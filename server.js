/**
 * Unified server: Next.js (Haashir UI + API) + Express (ARIA intake + WebSocket)
 * Dev:   npm run dev
 * Prod:  npm run build && npm start
 */
require('dotenv').config();

// ─── Boot-time configuration audit ──────────────────────────────────────────
// We log a single line at boot so PM2 surfaces it right at the top of the log
// and any operator can answer "are all the keys baked in?" with one glance.
// Anthropic is hard-required (Claude is the brain). The others are degraded-mode
// optional, but still worth advertising.
(() => {
  const has = (v) => !!String(v || '').trim();
  const status = {
    Anthropic: has(process.env.ANTHROPIC_API_KEY),
    Gemini: has(process.env.GEMINI_API_KEY),
    Eleven: has(process.env.ELEVENLABS_API_KEY),
    Twilio: has(process.env.TWILIO_ACCOUNT_SID) && has(process.env.TWILIO_AUTH_TOKEN),
    Mongo: has(process.env.MONGODB_URI),
  };
  const line = Object.entries(status)
    .map(([k, v]) => `${k}=${v ? 'on' : 'off'}`)
    .join(' ');
  console.log(`[CONFIG] ${line}`);
  if (!status.Anthropic) {
    console.error('[CONFIG] FATAL: ANTHROPIC_API_KEY missing — refusing to boot.');
    console.error('[CONFIG]        Set it in /etc/siren/siren.env (or .env locally) and restart PM2.');
    process.exit(78); // 78 = config error (sysexits.h EX_CONFIG)
  }
})();

const path = require('path');
const fs = require('fs');
const http = require('http');
const { parse } = require('url');
const express = require('express');
const WebSocket = require('ws');
const multer = require('multer');
const next = require('next');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { exec, execSync } = require('child_process');
const twilioPkg = require('twilio');
const awsS3Twilio = require('./lib/aws-s3-twilio');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: __dirname });
const handle = nextApp.getRequestHandler();

const ariaApp = express();
/** Behind AWS ALB / nginx / CloudFront — correct Host, X-Forwarded-Proto, signatures. */
ariaApp.set('trust proxy', 1);

/** Allow split-deploy frontends to call /api/aria and use /ws-aria from another origin. */
ariaApp.use((req, res, next) => {
  const allow = (process.env.ARIA_CORS_ORIGIN || '*').trim();
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
ariaApp.use(express.json({ limit: '4mb' }));
ariaApp.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: os.tmpdir() });

let anthropicKey = process.env.ANTHROPIC_API_KEY || '';
let anthropic = new Anthropic({ apiKey: anthropicKey });

const sessions = {};
/** Twilio CallSid → ARIA sessionId (multiple concurrent calls supported). */
const twilioCallSidToSessionId = Object.create(null);
let wss;

function broadcast(data) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function checkWhisper() {
  try {
    execSync('which whisper', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Public HTTPS base (Twilio webhooks + <Play> URLs). Set PUBLIC_BASE_URL in production. */
function getPublicBaseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  const host =
    req.get('x-forwarded-host') || req.get('host') || req.headers.host || `localhost:${process.env.PORT || 3000}`;
  let proto = req.get('x-forwarded-proto');
  if (!proto && req.secure) proto = 'https';
  if (!proto) proto = String(host).includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

ariaApp.use((req, res, next) => {
  const p = (req.url || '').split('?')[0];
  req.ariaPublicPath = '/api/aria' + p;
  next();
});

function twilioSignatureOk(req) {
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!token) return true;
  const sig = req.headers['x-twilio-signature'];
  const fullUrl = `${getPublicBaseUrl(req)}${req.ariaPublicPath}`;
  try {
    return twilioPkg.validateRequest(token, sig, fullUrl, req.body);
  } catch {
    return false;
  }
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Full HTTPS URL for Twilio <Play> — ElevenLabs MP3 via S3 (AWS) or local /api/aria/twilio/audio/:id.mp3.
 * Returns null → use Polly Say fallback.
 */
async function buildTwilioTtsPlayUrl(text, publicBase) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL').trim();
  if (!key || !text) return null;
  const token = uuidv4();
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.05 }
      })
    });
    if (!res.ok) {
      console.warn('[TWILIO TTS] ElevenLabs HTTP', res.status);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    if (awsS3Twilio.isS3Configured()) {
      const objectKey = `${awsS3Twilio.keyPrefix()}/${token}.mp3`;
      const signed = await awsS3Twilio.uploadMp3PresignedUrl(buf, objectKey);
      if (signed) {
        console.log('[TWILIO TTS] Uploaded to s3://' + awsS3Twilio.bucket() + '/' + objectKey);
        return signed;
      }
    }

    const dir = path.join(__dirname, 'public', 'twilio-audio');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${token}.mp3`), buf);
    return `${publicBase.replace(/\/$/, '')}/api/aria/twilio/audio/${token}.mp3`;
  } catch (e) {
    console.warn('[TWILIO TTS]', e.message);
    return null;
  }
}

ariaApp.post('/configure', (req, res) => {
  const { anthropicKey: key } = req.body || {};
  if (!key || !key.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'Invalid Anthropic key format' });
  }
  anthropicKey = key;
  anthropic = new Anthropic({ apiKey: key });
  console.log('[CONFIG] Anthropic key set via browser');
  res.json({ ok: true });
});

ariaApp.get('/status', (req, res) => {
  const whisperInstalled = checkWhisper();
  const hasKey = !!(anthropicKey || process.env.ANTHROPIC_API_KEY);
  res.json({
    status: 'online',
    whisper: whisperInstalled,
    anthropic: hasKey,
    activeSessions: Object.keys(sessions).filter(k => sessions[k].callActive).length
  });
});

/**
 * Lightweight configuration probe used by /intake to decide whether to render
 * the setup overlay at all. Returns ONLY a boolean — never the key itself —
 * so it's safe to expose without auth.
 */
ariaApp.get('/configure-status', (req, res) => {
  res.json({ configured: !!(anthropicKey || process.env.ANTHROPIC_API_KEY) });
});

/** Optional keys for /intake auto-launch (same host only; do not expose this app publicly without auth). */
ariaApp.get('/bootstrap', (req, res) => {
  res.json({
    elevenLabsKey: (process.env.ELEVENLABS_API_KEY || '').trim()
  });
});

/** Forward geocode for intake map (Nominatim; worldwide — use caller address as-is). */
ariaApp.get('/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 4) {
    return res.status(400).json({ error: 'Query too short' });
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'SirenDispatch/1.0 (emergency dispatch demo; contact via repo)',
        Accept: 'application/json'
      }
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Geocoder unavailable' });
    }
    const data = await r.json();
    if (!Array.isArray(data) || !data[0]) {
      return res.json({ lat: null, lon: null, display_name: null });
    }
    const row = data[0];
    res.json({
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      display_name: row.display_name || null
    });
  } catch (err) {
    console.error('[GEOCODE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

ariaApp.post('/session/start', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = {
    id: sessionId,
    startTime: new Date().toISOString(),
    channel: 'browser',
    transcript: [],
    ticket: {
      incidentId: 'INC-' + Date.now(),
      priority: null,
      type: null,
      location: null,
      victims: null,
      injuries: null,
      hazards: null,
      callerName: null,
      medicalHistory: null,
      dispatchStatus: 'INTAKE IN PROGRESS',
      language: null,
      translationActive: false
    },
    callActive: true
  };
  broadcast({
    type: 'session_start',
    sessionId,
    channel: 'browser',
    ticket: sessions[sessionId].ticket
  });
  console.log(`[SESSION] Started: ${sessionId}`);
  res.json({ sessionId, incidentId: sessions[sessionId].ticket.incidentId });
});

async function translateCallerIfNeeded(sessionId, trimmed) {
  let translatedText = null;
  let isNonEnglish = false;
  const nonLatinPattern = /[\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/;
  const nonEngWords = trimmed.split(' ').filter(w => w.length > 3 && !/^[a-zA-Z0-9'.,!?\-]+$/.test(w)).length;
  if (nonLatinPattern.test(trimmed) || nonEngWords > 2) {
    isNonEnglish = true;
    const txRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{ role: 'user', content: `Detect language and translate to English. Reply ONLY: [Language]|||[Translation]\nText: "${trimmed}"` }]
    });
    const parts = txRes.content[0].text.split('|||');
    sessions[sessionId].ticket.language = parts[0]?.trim() || 'Unknown';
    translatedText = parts[1]?.trim() || trimmed;
    sessions[sessionId].ticket.translationActive = true;
  }
  return { translatedText, isNonEnglish };
}

async function ingestCallerText(sessionId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length < 2 || !sessions[sessionId]) return;

  console.log(`[CALLER TEXT] "${trimmed}"`);

  const { translatedText, isNonEnglish } = await translateCallerIfNeeded(sessionId, trimmed);

  const entry = {
    role: 'caller',
    text: trimmed,
    translatedText,
    timestamp: new Date().toISOString()
  };
  sessions[sessionId].transcript.push(entry);

  const ch = sessions[sessionId].channel || 'browser';
  broadcast({
    type: 'transcription',
    sessionId,
    channel: ch,
    text: trimmed,
    translatedText,
    isNonEnglish,
    ticket: sessions[sessionId].ticket,
    timestamp: entry.timestamp
  });

  scheduleClaudeProcessing(sessionId, translatedText || trimmed);
}

ariaApp.post('/transcript/chunk', async (req, res) => {
  const { sessionId, transcriptDelta } = req.body || {};
  if (!sessionId || !sessions[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const delta = (transcriptDelta || '').trim();
  if (!delta || delta.length < 2) {
    return res.json({ ok: true, skipped: true });
  }
  try {
    await ingestCallerText(sessionId, delta);
    res.json({ ok: true });
  } catch (err) {
    console.error('[TRANSCRIPT CHUNK]', err.message);
    res.status(500).json({ error: err.message });
  }
});

ariaApp.post('/transcribe', upload.single('audio'), async (req, res) => {
  const { sessionId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  if (!sessions[sessionId]) return res.status(404).json({ error: 'Session not found' });

  const tmpIn = req.file.path + '.webm';
  const tmpOut = req.file.path + '.wav';
  fs.renameSync(req.file.path, tmpIn);

  try {
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${tmpIn}" -ar 16000 -ac 1 "${tmpOut}" 2>/dev/null`, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const whisperResult = await new Promise((resolve, reject) => {
      const outDir = os.tmpdir();
      exec(
        `whisper "${tmpOut}" --model small --output_format txt --output_dir "${outDir}" --fp16 False 2>/dev/null`,
        { timeout: 30000 },
        (err) => {
          if (err) { reject(err); return; }
          const txtFile = tmpOut.replace('.wav', '.txt');
          const altTxt = path.join(outDir, path.basename(tmpOut, '.wav') + '.txt');
          let text = '';
          if (fs.existsSync(txtFile)) {
            text = fs.readFileSync(txtFile, 'utf8').trim();
            fs.unlinkSync(txtFile);
          } else if (fs.existsSync(altTxt)) {
            text = fs.readFileSync(altTxt, 'utf8').trim();
            fs.unlinkSync(altTxt);
          }
          resolve(text);
        }
      );
    });

    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);

    const text = whisperResult?.trim();
    if (!text || text.length < 2) {
      return res.json({ text: '', skipped: true });
    }

    console.log(`[WHISPER] "${text}"`);
    await ingestCallerText(sessionId, text);
    const session = sessions[sessionId];
    const last = session.transcript[session.transcript.length - 1];
    res.json({
      text,
      translatedText: last?.translatedText ?? null,
      isNonEnglish: !!last?.translatedText
    });

  } catch (err) {
    console.error('[TRANSCRIBE ERROR]', err.message);
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    res.status(500).json({ error: err.message });
  }
});

/** Caller is already on the intake line — never echo “hang up / dial 911” style instructions. */
function sanitizeAriaResponse(text) {
  if (text == null || typeof text !== 'string') return text;
  const patterns = [
    /\bhang\s*up\s+and\s+(call|dial)\s*(911|nine[\s-]*one[\s-]*one)\b[^.!?]*[.!?]?/gi,
    /\b(call|dial)\s*(911|nine[\s-]*one[\s-]*one)\s+immediately\b[^.!?]*[.!?]?/gi,
    /\bplease\s+(call|dial|phone)\s*(911|nine[\s-]*one[\s-]*one)\b[^.!?]*[.!?]?/gi,
    /\b(if\s+you\s+can,?\s+)?(call|dial)\s*(911|nine[\s-]*one[\s-]*one)\b[^.!?]*[.!?]?/gi,
    /\bring\s+another\s+phone\s+and\s+(call|dial)\s*911\b[^.!?]*[.!?]?/gi
  ];
  let t = text;
  for (const p of patterns) t = t.replace(p, ' ');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.!?])/g, '$1').trim();
  if (t.length < 6) {
    return "Stay on the line — I'm passing your details to dispatch.";
  }
  return t;
}

function clearClaudeTimers(session) {
  if (session._claudeIdleTimer) {
    clearTimeout(session._claudeIdleTimer);
    session._claudeIdleTimer = null;
  }
  if (session._claudeMaxTimer) {
    clearTimeout(session._claudeMaxTimer);
    session._claudeMaxTimer = null;
  }
}

function flushClaudeBatch(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;
  clearClaudeTimers(session);
  const batch = session._claudePending?.trim();
  session._claudePending = '';
  session._claudeBatchStart = null;
  if (!batch) return;

  if (!session._claudeQueue) session._claudeQueue = Promise.resolve();
  session._claudeQueue = session._claudeQueue
    .then(() => processWithClaude(sessionId, batch, batch))
    .catch((err) => console.error('[CLAUDE]', err.message));
}

/**
 * Batches rapid HTTP chunks; flushes after a short pause (low latency when you stop talking)
 * or ~520ms max wait (still get updates during a long uninterrupted sentence).
 */
function scheduleClaudeProcessing(sessionId, englishText) {
  const session = sessions[sessionId];
  if (!session) return;
  const piece = (englishText || '').trim();
  if (!piece) return;

  session._claudePending = session._claudePending
    ? `${session._claudePending} ${piece}`
    : piece;

  if (!session._claudeBatchStart) {
    session._claudeBatchStart = Date.now();
    session._claudeMaxTimer = setTimeout(() => flushClaudeBatch(sessionId), 520);
  }

  if (session._claudeIdleTimer) clearTimeout(session._claudeIdleTimer);
  session._claudeIdleTimer = setTimeout(() => flushClaudeBatch(sessionId), 150);
}

function buildPhoneSystemPrompt(session, transcriptHistory) {
  return `You are Siren, 911 intake AI. Phone call — respond FAST. JSON only, no markdown.

Caller is already on the emergency line — NEVER say hang up, dial 911, or call 911.

Ticket:
${JSON.stringify(session.ticket)}

Recent:
${transcriptHistory}

RESPOND WITH VALID JSON ONLY:
{
  "ariaResponse": "Max 2 short sentences for voice",
  "ticketUpdates": { "type": null, "priority": "CRITICAL|HIGH|MEDIUM|LOW|null", "location": null, "victims": null, "injuries": null, "hazards": null, "callerName": null, "medicalHistory": null, "dispatchStatus": null },
  "severityScores": { "lifeThreat": 0, "urgency": 0, "locationConfidence": 0, "infoCompleteness": 0 },
  "timelineStep": 0,
  "dispatchRecommendation": null,
  "keyFlags": [],
  "shouldDispatch": false
}
Scores 0-100. timelineStep 0-4.`;
}

async function processWithClaude(sessionId, rawText, englishText) {
  const session = sessions[sessionId];
  if (!session) return null;

  const transcriptHistory = session.transcript
    .slice(-8)
    .map(t => `[${t.role.toUpperCase()}]: ${t.translatedText || t.text}`)
    .join('\n');

  const isPhone = session.channel === 'phone';

  const systemPrompt = isPhone
    ? buildPhoneSystemPrompt(session, transcriptHistory)
    : `You are Siren, an AI emergency intake assistant for 911-style emergency dispatch (United States and callers who reach this line from anywhere). You have two jobs:
1. Extract structured incident data from what the caller is saying — including full location anywhere in the world when they give it; never assume a single city or region.
2. Provide a calm, clear, helpful spoken response to guide the caller

CRITICAL — THE CALLER IS ALREADY ON AN EMERGENCY INTAKE LINE:
- They are already connected to this system (911 / emergency intake). NEVER tell them to hang up, call 911, dial 911, use another phone, "phone emergency services," or any variant of "hang up and dial 911 immediately."
- NEVER instruct them to place a new emergency call — help is already being reached through this session.
- Use "stay on the line," "I'm updating dispatch," or "help is being coordinated" instead of any redirect-to-911 language.

Current ticket state:
${JSON.stringify(session.ticket, null, 2)}

Conversation so far:
${transcriptHistory}

RESPOND WITH VALID JSON ONLY — no markdown, no explanation, just the JSON object:
{
  "ariaResponse": "Your spoken response to the caller — calm, directive, 1-2 sentences max",
  "ticketUpdates": {
    "type": "e.g. CARDIAC ARREST / HOUSE FIRE / VEHICLE ACCIDENT / ACTIVE SHOOTER etc, or null if unchanged",
    "priority": "CRITICAL or HIGH or MEDIUM or LOW — or null if not enough info yet",
    "location": "Full address if mentioned, or null",
    "victims": "Description of victims if mentioned, or null",
    "injuries": "Nature of injuries if mentioned, or null",
    "hazards": "Any hazards like fire, gas, weapons, or null",
    "callerName": "If caller gives their name, or null",
    "medicalHistory": "Any medical info mentioned, or null",
    "dispatchStatus": "Updated status string, or null"
  },
  "severityScores": {
    "lifeThreat": 0,
    "urgency": 0,
    "locationConfidence": 0,
    "infoCompleteness": 0
  },
  "timelineStep": 0,
  "dispatchRecommendation": "What units to send, or null if not enough info",
  "keyFlags": ["array", "of", "critical", "flags"],
  "shouldDispatch": false
}

All scores are 0-100. timelineStep is 0-4 (0=call received, 1=location found, 2=priority set, 3=ticket sent, 4=dispatched).`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isPhone ? 384 : 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: `New caller statement: "${englishText}"` }]
    });

    const raw = response.content[0].text.trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(raw);

    if (parsed.ariaResponse) {
      parsed.ariaResponse = sanitizeAriaResponse(parsed.ariaResponse);
    }

    const updates = parsed.ticketUpdates || {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== null && updates[key] !== undefined) {
        session.ticket[key] = updates[key];
      }
    });

    if (parsed.ariaResponse) {
      session.transcript.push({
        role: 'aria',
        text: parsed.ariaResponse,
        timestamp: new Date().toISOString()
      });
    }

    const ch = session.channel || 'browser';
    broadcast({
      type: 'ai_analysis',
      sessionId,
      channel: ch,
      twilioCallSid: session.twilioCallSid || undefined,
      from: session.from || undefined,
      ariaResponse: parsed.ariaResponse,
      ticket: session.ticket,
      severityScores: parsed.severityScores,
      timelineStep: parsed.timelineStep,
      dispatchRecommendation: parsed.dispatchRecommendation,
      keyFlags: parsed.keyFlags,
      shouldDispatch: parsed.shouldDispatch,
      timestamp: new Date().toISOString()
    });

    console.log(`[CLAUDE] Type: ${session.ticket.type} | Priority: ${session.ticket.priority}`);

    return parsed;
  } catch (err) {
    console.error('[CLAUDE ERROR]', err.message);
    broadcast({
      type: 'error',
      sessionId,
      channel: sessions[sessionId]?.channel || 'browser',
      message: 'AI processing error: ' + err.message
    });
    return null;
  }
}

/** Phone: one utterance → await Claude → spoken reply (used by Twilio webhooks). */
async function ingestPhoneTurn(sessionId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length < 2 || !sessions[sessionId]) {
    return "I'm listening. What is your emergency?";
  }

  /** No separate translation API — faster; Claude handles language in one call. */
  const entry = {
    role: 'caller',
    text: trimmed,
    translatedText: null,
    timestamp: new Date().toISOString()
  };
  sessions[sessionId].transcript.push(entry);

  const ch = sessions[sessionId].channel || 'phone';
  broadcast({
    type: 'transcription',
    sessionId,
    channel: ch,
    twilioCallSid: sessions[sessionId].twilioCallSid,
    from: sessions[sessionId].from,
    text: trimmed,
    translatedText: null,
    isNonEnglish: false,
    ticket: sessions[sessionId].ticket,
    timestamp: entry.timestamp
  });

  const parsed = await processWithClaude(sessionId, trimmed, trimmed);
  const reply =
    parsed?.ariaResponse ||
    "Stay on the line — I'm updating dispatch with what you've told me.";
  return sanitizeAriaResponse(reply) || reply;
}

ariaApp.post('/report/generate', async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const fullTranscript = session.transcript
    .map(t => {
      const role = t.role === 'caller' ? 'CALLER' : 'SIREN AI';
      const translation = t.translatedText ? ` [Translated: "${t.translatedText}"]` : '';
      return `[${new Date(t.timestamp).toLocaleTimeString()}] ${role}: "${t.text}"${translation}`;
    })
    .join('\n');

  const duration = Math.floor((Date.now() - new Date(session.startTime)) / 1000);
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  try {
    const reportRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Generate a formal, detailed emergency incident report for this 911 call.

INCIDENT TICKET DATA:
${JSON.stringify(session.ticket, null, 2)}

CALL DURATION: ${mins}m ${secs}s
CALL STARTED: ${session.startTime}
CALL ENDED: ${new Date().toISOString()}

FULL CALL TRANSCRIPT:
${fullTranscript}

Write a complete professional incident report with these sections:
1. INCIDENT SUMMARY
2. INCIDENT DETAILS (type, location, date/time, priority level)
3. CALLER INFORMATION
4. VICTIM / PATIENT INFORMATION
5. NATURE OF EMERGENCY (detailed description)
6. HAZARDS & SPECIAL CONSIDERATIONS
7. SIREN AI ACTIONS TAKEN
8. DISPATCH RECOMMENDATION
9. CHRONOLOGICAL TIMELINE (with timestamps)
10. LANGUAGE & TRANSLATION NOTES (if applicable)
11. AI CONFIDENCE ASSESSMENT
12. RECOMMENDED FOLLOW-UP ACTIONS

Be precise and professional. This will be used by dispatchers and first responders.`
      }]
    });

    const report = reportRes.content[0].text;
    session.report = report;
    session.callActive = false;
    session.endTime = new Date().toISOString();

    broadcast({ type: 'report_ready', sessionId, report });
    res.json({ report, sessionId, incidentId: session.ticket.incidentId });

  } catch (err) {
    console.error('[REPORT ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

ariaApp.post('/session/end', (req, res) => {
  const { sessionId } = req.body;
  const session = sessions[sessionId];
  if (session) {
    clearClaudeTimers(session);
    const flush = session._claudePending?.trim();
    session._claudePending = '';
    session._claudeBatchStart = null;
    if (flush) {
      if (!session._claudeQueue) session._claudeQueue = Promise.resolve();
      session._claudeQueue = session._claudeQueue
        .then(() => processWithClaude(sessionId, flush, flush))
        .catch((err) => console.error('[CLAUDE]', err.message));
    }
    session.callActive = false;
    broadcast({ type: 'session_end', sessionId });
    console.log(`[SESSION] Ended: ${sessionId}`);
  }
  res.json({ ok: true });
});

// ─── Twilio voice ↔ Siren (Gather + speech recognition; ElevenLabs or Polly TTS) ─
/** Twilio `<Gather>` attrs: phone_call model + enhanced ASR for simultaneous calls (stateless per request). */
const TWILIO_GATHER_ATTRS =
  'input="speech" method="POST" speechTimeout="auto" language="en-US" speechModel="phone_call" enhanced="true" timeout="8"';

/** GET — paste this URL in a browser to verify routing + see exact webhook URLs (no Twilio call needed). */
ariaApp.get('/twilio/ping', (req, res) => {
  const base = getPublicBaseUrl(req);
  res.json({
    ok: true,
    message: 'Siren Twilio hooks are mounted. Point Twilio Voice POST to voiceWebhook, then call your number.',
    publicBaseUrl: base,
    voiceWebhook: `${base}/api/aria/twilio/voice`,
    gatherWebhook: `${base}/api/aria/twilio/gather`,
    callStatusWebhook: `${base}/api/aria/twilio/call-status`,
    signatureCheck: !!(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
    awsS3TwilioBucket: awsS3Twilio.isS3Configured() ? awsS3Twilio.bucket() : null,
    twilioTtsMode: awsS3Twilio.isS3Configured() ? 's3-presigned' : 'local-or-public-base',
    note:
      'If POST tests return 403, Twilio signature failed: use real Twilio POST or temporarily unset TWILIO_AUTH_TOKEN for local curl only.'
  });
});

ariaApp.post('/twilio/voice', async (req, res) => {
  if (!twilioSignatureOk(req)) return res.status(403).send('Forbidden');
  const callSid = req.body.CallSid;
  const from = req.body.From || '';
  if (!callSid) return res.status(400).send('Missing CallSid');

  let sessionId = twilioCallSidToSessionId[callSid];
  if (!sessionId || !sessions[sessionId]) {
    sessionId = uuidv4();
    sessions[sessionId] = {
      id: sessionId,
      startTime: new Date().toISOString(),
      channel: 'phone',
      twilioCallSid: callSid,
      from,
      transcript: [],
      ticket: {
        incidentId: 'INC-' + Date.now(),
        priority: null,
        type: null,
        location: null,
        victims: null,
        injuries: null,
        hazards: null,
        callerName: null,
        medicalHistory: null,
        dispatchStatus: 'INTAKE IN PROGRESS',
        language: null,
        translationActive: false
      },
      callActive: true
    };
    twilioCallSidToSessionId[callSid] = sessionId;
    broadcast({
      type: 'session_start',
      sessionId,
      channel: 'phone',
      twilioCallSid: callSid,
      from,
      ticket: sessions[sessionId].ticket
    });
    console.log(`[TWILIO] Incoming call ${callSid} → session ${sessionId.slice(0, 8)}`);
  }

  const base = getPublicBaseUrl(req);
  const gatherUrl = `${base}/api/aria/twilio/gather`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather ${TWILIO_GATHER_ATTRS} action="${escapeXml(gatherUrl)}">
    <Say voice="Polly.Matthew">Siren here. What is your emergency?</Say>
  </Gather>
  <Say voice="Polly.Matthew">We did not hear you. Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.type('text/xml');
  res.send(xml);
});

ariaApp.post('/twilio/gather', async (req, res) => {
  if (!twilioSignatureOk(req)) return res.status(403).send('Forbidden');
  const callSid = req.body.CallSid;
  const speech = (req.body.SpeechResult || '').trim();
  const sessionId = twilioCallSidToSessionId[callSid];
  const base = getPublicBaseUrl(req);
  const gatherUrl = `${base}/api/aria/twilio/gather`;

  if (!sessionId || !sessions[sessionId]) {
    const errXml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">Session error. Goodbye.</Say><Hangup/></Response>`;
    res.type('text/xml');
    return res.send(errXml);
  }

  let spoken = "I didn't catch that. What is your emergency?";
  if (speech.length >= 2) {
    try {
      spoken = await ingestPhoneTurn(sessionId, speech);
    } catch (e) {
      console.error('[TWILIO GATHER]', e);
      spoken = 'Sorry, something went wrong. Please say that again.';
    }
  }

  let playPart;
  try {
    const playAudioUrl = await buildTwilioTtsPlayUrl(spoken, base);
    if (playAudioUrl) {
      playPart = `<Play>${escapeXml(playAudioUrl)}</Play>`;
    } else {
      playPart = `<Say voice="Polly.Matthew">${escapeXml(spoken.slice(0, 4000))}</Say>`;
    }
  } catch (e) {
    console.error('[TWILIO TTS]', e);
    playPart = `<Say voice="Polly.Matthew">${escapeXml(spoken.slice(0, 4000))}</Say>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${playPart}
  <Gather ${TWILIO_GATHER_ATTRS} action="${escapeXml(gatherUrl)}"></Gather>
  <Say voice="Polly.Matthew">Goodbye.</Say>
  <Hangup/>
</Response>`;
  res.type('text/xml');
  res.send(xml);
});

ariaApp.get('/twilio/audio/:file', (req, res) => {
  const raw = String(req.params.file || '');
  const m = raw.match(/^([a-f0-9-]{36})\.mp3$/i);
  if (!m) return res.status(400).end('Bad file');
  const fp = path.join(__dirname, 'public', 'twilio-audio', `${m[1]}.mp3`);
  if (!fs.existsSync(fp)) return res.status(404).end();
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(fp).pipe(res);
});

/** Optional: set Twilio number "Status callback" to this URL so sessions end when the call completes. */
ariaApp.post('/twilio/call-status', (req, res) => {
  if (!twilioSignatureOk(req)) return res.status(403).send('Forbidden');
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus || '';
  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) {
    const sessionId = twilioCallSidToSessionId[callSid];
    if (sessionId && sessions[sessionId]) {
      sessions[sessionId].callActive = false;
      broadcast({
        type: 'session_end',
        sessionId,
        channel: 'phone',
        twilioCallSid: callSid
      });
      delete twilioCallSidToSessionId[callSid];
      console.log(`[TWILIO] Call ended ${callSid}`);
    }
  }
  res.type('text/plain');
  res.send('OK');
});

nextApp.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname || '';

    try {
      if (pathname === '/intake' || pathname === '/intake/') {
        const htmlPath = path.join(__dirname, 'public', 'intake', 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(htmlPath).pipe(res);
      }

      if (
        pathname === '/dispatch-live' ||
        pathname === '/dispatch-live/' ||
        pathname === '/dispatch-live.html' ||
        pathname === '/dispatch-live.html/'
      ) {
        const htmlPath = path.join(__dirname, 'public', 'dispatch-live.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(htmlPath).pipe(res);
      }

      if (pathname.startsWith('/api/aria')) {
        const u = req.url;
        req.url = u.startsWith('/api/aria') ? (u.slice('/api/aria'.length) || '/') : u;
        return ariaApp(req, res);
      }

      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[HTTP]', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Dedicated path so Next.js dev (Turbopack/HMR) never shares the same upgrade as ARIA
  wss = new WebSocket.Server({ server, path: '/ws-aria' });
  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'connected', message: 'Siren system online' }));
    ws.on('close', () => console.log('[WS] Client disconnected'));
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    const whisperOk = checkWhisper();
    console.log(`
╔══════════════════════════════════════════════════════╗
║  Siren — voice intake + dispatch intelligence        ║
║  http://localhost:${PORT}                             ║
║    • Situations & tools: /                           ║
║    • Voice intake:       /intake                     ║
║    • Live dispatch:      /dispatch-live              ║
║    • Twilio voice POST:  /api/aria/twilio/voice      ║
║  Whisper (optional): ${whisperOk ? 'yes' : 'no'}                          ║
╚══════════════════════════════════════════════════════╝
`);
  });
}).catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
