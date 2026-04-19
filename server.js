/**
 * Unified server: Next.js (Haashir UI + API) + Express (ARIA intake + WebSocket)
 * Dev:   npm run dev
 * Prod:  npm run build && npm start
 */
require('dotenv').config();
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

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: __dirname });
const handle = nextApp.getRequestHandler();

const ariaApp = express();
ariaApp.use(express.json({ limit: '4mb' }));
const upload = multer({ dest: os.tmpdir() });

let anthropicKey = process.env.ANTHROPIC_API_KEY || '';
let anthropic = new Anthropic({ apiKey: anthropicKey });

const sessions = {};
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
  broadcast({ type: 'session_start', sessionId, ticket: sessions[sessionId].ticket });
  console.log(`[SESSION] Started: ${sessionId}`);
  res.json({ sessionId, incidentId: sessions[sessionId].ticket.incidentId });
});

async function ingestCallerText(sessionId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length < 2 || !sessions[sessionId]) return;

  console.log(`[CALLER TEXT] "${trimmed}"`);

  let translatedText = null;
  let isNonEnglish = false;
  const nonLatinPattern = /[\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/;
  const nonEngWords = trimmed.split(' ').filter(w => w.length > 3 && !/^[a-zA-Z0-9'.,!?\-]+$/.test(w)).length;
  if (nonLatinPattern.test(trimmed) || nonEngWords > 2) {
    isNonEnglish = true;
    const txRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: `Detect language and translate to English. Reply ONLY: [Language]|||[Translation]\nText: "${trimmed}"` }]
    });
    const parts = txRes.content[0].text.split('|||');
    sessions[sessionId].ticket.language = parts[0]?.trim() || 'Unknown';
    translatedText = parts[1]?.trim() || trimmed;
    sessions[sessionId].ticket.translationActive = true;
  }

  const entry = {
    role: 'caller',
    text: trimmed,
    translatedText,
    timestamp: new Date().toISOString()
  };
  sessions[sessionId].transcript.push(entry);

  broadcast({
    type: 'transcription',
    sessionId,
    text: trimmed,
    translatedText,
    isNonEnglish,
    timestamp: entry.timestamp
  });

  processWithClaude(sessionId, trimmed, translatedText || trimmed).catch(console.error);
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

async function processWithClaude(sessionId, rawText, englishText) {
  const session = sessions[sessionId];
  if (!session) return;

  const transcriptHistory = session.transcript
    .slice(-10)
    .map(t => `[${t.role.toUpperCase()}]: ${t.translatedText || t.text}`)
    .join('\n');

  const systemPrompt = `You are Siren, an AI emergency intake assistant for Austin 911 dispatch. You have two jobs:
1. Extract structured incident data from what the caller is saying
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
      max_tokens: 800,
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

    broadcast({
      type: 'ai_analysis',
      sessionId,
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

  } catch (err) {
    console.error('[CLAUDE ERROR]', err.message);
    broadcast({ type: 'error', sessionId, message: 'AI processing error: ' + err.message });
  }
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
  if (sessions[sessionId]) {
    sessions[sessionId].callActive = false;
    broadcast({ type: 'session_end', sessionId });
    console.log(`[SESSION] Ended: ${sessionId}`);
  }
  res.json({ ok: true });
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
║  Whisper (optional): ${whisperOk ? 'yes' : 'no'}                          ║
╚══════════════════════════════════════════════════════╝
`);
  });
}).catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
