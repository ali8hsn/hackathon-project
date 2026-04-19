#!/usr/bin/env node
/**
 * generate-demo-audio.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Generates public/demo/burning-building.mp3 — a simulated 911 call used by
 * the homepage Demo feature.
 *
 * What it does:
 *   1. Produces a realistic-sounding caller dialog via ElevenLabs (preferred)
 *      or OpenAI TTS. The caller sounds panicked; the AI dispatcher sounds
 *      calm and structured.
 *   2. Mixes the dialog with a fire-crackle + distant-siren bed using ffmpeg.
 *   3. Writes the final MP3 to public/demo/burning-building.mp3.
 *
 * Requirements:
 *   - Node 18+
 *   - ffmpeg installed on PATH
 *   - ONE of:
 *       ELEVENLABS_API_KEY  (recommended — best voices)
 *       OPENAI_API_KEY      (works with gpt-4o-mini-tts / tts-1)
 *
 * Usage:
 *   export ELEVENLABS_API_KEY=sk_...
 *   # OR:  export OPENAI_API_KEY=sk-...
 *   node scripts/generate-demo-audio.mjs
 *
 * You can re-run this any time to refresh the audio — it overwrites the file.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "demo");
const OUT_FILE = path.join(OUT_DIR, "burning-building.mp3");
const TMP_DIR = path.join(ROOT, ".cache", "demo-audio");

// ─── Script ─────────────────────────────────────────────────────────────────
// Keep this tight — ~40–50 seconds total. Each line gets a pause afterward.
// voiceKey maps to different speakers; keep "caller" panicked, "ai" calm.

const DIALOG = [
  { voice: "ai", text: "Nine-one-one, this is Siren — what's your emergency?" },
  {
    voice: "caller",
    text:
      "Oh my god — there's a fire, there's a huge fire in my apartment building! There's smoke everywhere!",
  },
  { voice: "ai", text: "Okay, I need you to stay with me. What's your address?" },
  {
    voice: "caller",
    text:
      "Um — twenty-two-oh-four Rio Grande Street, Austin. The whole second floor — it's — I can see flames from the window!",
  },
  {
    voice: "ai",
    text:
      "Got it, twenty-two-oh-four Rio Grande. Austin Fire is already rolling. Are you inside the building right now?",
  },
  {
    voice: "caller",
    text:
      "Yes — yes, I'm in my unit but my neighbor — she's on the second floor, I don't know if she got out! She has a dog too!",
  },
  {
    voice: "ai",
    text:
      "Okay — stay low, don't use the elevator. If the hallway is smoky, close your door and put a wet towel at the base. Can you do that?",
  },
  { voice: "caller", text: "Yes — okay, I'm doing it. Please hurry!" },
  {
    voice: "ai",
    text:
      "Help is less than two minutes out. I'm going to stay on the line with you the whole time.",
  },
];

const VOICE_DIRECTIONS = {
  caller:
    "A panicked adult female calling 911. She's frightened, breathing hard, speaking quickly and a little shakily. She is scared but coherent.",
  ai: "A calm, confident adult dispatcher or AI assistant. Clear, steady, warm but authoritative. Short phrases, reassuring.",
};

// ─── ElevenLabs config ──────────────────────────────────────────────────────
const ELEVEN_API = "https://api.elevenlabs.io/v1";
const ELEVEN_VOICES = {
  // Rachel — warm female, good for caller (public ElevenLabs voice)
  caller: "21m00Tcm4TlvDq8ikWAM",
  // Adam — steady male, good for dispatcher
  ai: "pNInz6obpgDQGcFmaJgB",
};

// ─── OpenAI config (fallback) ───────────────────────────────────────────────
const OPENAI_API = "https://api.openai.com/v1/audio/speech";
const OPENAI_VOICES = {
  caller: "shimmer",
  ai: "onyx",
};

// ─── Utilities ──────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function ensureFfmpeg() {
  try {
    await run("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    console.error(
      "[error] ffmpeg not found on PATH. Install it:\n" +
        "  macOS:    brew install ffmpeg\n" +
        "  Ubuntu:   sudo apt-get install ffmpeg\n" +
        "  Windows:  choco install ffmpeg  (or download from ffmpeg.org)"
    );
    process.exit(1);
  }
}

async function synthesizeLineElevenLabs(line, outFile) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = ELEVEN_VOICES[line.voice];
  const res = await fetch(`${ELEVEN_API}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: line.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: line.voice === "caller" ? 0.35 : 0.6,
        similarity_boost: 0.75,
        style: line.voice === "caller" ? 0.7 : 0.2,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `ElevenLabs ${res.status}: ${await res.text().catch(() => "")}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outFile, buf);
}

async function synthesizeLineOpenAI(line, outFile) {
  const key = process.env.OPENAI_API_KEY;
  const res = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: OPENAI_VOICES[line.voice],
      // `instructions` lets gpt-4o-mini-tts steer the delivery.
      instructions: VOICE_DIRECTIONS[line.voice],
      input: line.text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `OpenAI TTS ${res.status}: ${await res.text().catch(() => "")}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outFile, buf);
}

async function synthesize(line, outFile) {
  if (process.env.ELEVENLABS_API_KEY) {
    return synthesizeLineElevenLabs(line, outFile);
  }
  if (process.env.OPENAI_API_KEY) {
    return synthesizeLineOpenAI(line, outFile);
  }
  throw new Error(
    "No TTS key set. Export ELEVENLABS_API_KEY or OPENAI_API_KEY and re-run."
  );
}

// ─── Ambience: synthesize a fire-crackle + distant-siren bed with ffmpeg ────
// We keep this entirely local — no downloads. ffmpeg's filtergraph can build
// convincing noise-based ambience.
async function buildAmbience(outFile, durationSec) {
  // Fire crackle:  pink noise, low-pass ~1.5kHz, random short amplitude spikes
  // Distant siren: low-volume saw wave oscillating between two pitches
  // Room tone:     brown noise at -35dB
  const dur = durationSec.toFixed(2);
  const filter = [
    // Pink noise → lowpassed → duck volume → random amplitude for crackle
    `anoisesrc=d=${dur}:c=pink:a=0.35,lowpass=f=1600,volume=0.32[fire]`,
    `anoisesrc=d=${dur}:c=brown:a=0.14,lowpass=f=450[room]`,
    // Two-tone siren — slower oscillation to sound distant + heavy reverb-like feel
    `sine=f=620:d=${dur},volume=0.04[siren1]`,
    `sine=f=780:d=${dur},volume=0.04[siren2]`,
    `[siren1][siren2]amix=inputs=2:duration=shortest[siren]`,
    // Distance: low-pass the siren
    `[siren]lowpass=f=900,volume=0.06[sirenFar]`,
    `[fire][room][sirenFar]amix=inputs=3:duration=longest:normalize=0[bed]`,
  ].join(";");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    filter,
    "-map",
    "[bed]",
    "-t",
    dur,
    "-ac",
    "2",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    outFile,
  ]);
}

// ─── Concatenate dialog pieces with small pauses ────────────────────────────
async function concatDialog(files, outFile) {
  const listFile = path.join(TMP_DIR, "concat.txt");
  const entries = [];
  const silenceFile = path.join(TMP_DIR, "sil.mp3");
  // 450ms of silence between lines
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    "0.45",
    "-b:a",
    "128k",
    silenceFile,
  ]);
  files.forEach((f, i) => {
    entries.push(`file '${f.replace(/'/g, "'\\''")}'`);
    if (i < files.length - 1) {
      entries.push(`file '${silenceFile.replace(/'/g, "'\\''")}'`);
    }
  });
  await fs.writeFile(listFile, entries.join("\n"));
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    outFile,
  ]);
}

// ─── Mix dialog + ambience and output final MP3 ─────────────────────────────
async function finalMix(dialogFile, ambienceFile, outFile) {
  // Dialog slightly boosted, ambience ducked beneath it.
  await run("ffmpeg", [
    "-y",
    "-i",
    dialogFile,
    "-i",
    ambienceFile,
    "-filter_complex",
    "[0:a]volume=1.15[dia];[1:a]volume=0.55[amb];[dia][amb]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,acompressor=threshold=-18dB:ratio=3:attack=20:release=200,alimiter=limit=0.95",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    outFile,
  ]);
}

async function getDurationSec(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      resolve(parseFloat(out.trim()));
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("[siren] Generating burning-building demo call…");
  await ensureFfmpeg();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  if (!process.env.ELEVENLABS_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error(
      "\n[error] No TTS key found.\n" +
        "        Set one of:\n" +
        "          export ELEVENLABS_API_KEY=sk_...\n" +
        "          export OPENAI_API_KEY=sk-...\n"
    );
    process.exit(1);
  }

  // 1) Synthesize each line
  const lineFiles = [];
  for (let i = 0; i < DIALOG.length; i++) {
    const line = DIALOG[i];
    const file = path.join(TMP_DIR, `line-${String(i).padStart(2, "0")}.mp3`);
    console.log(`  · line ${i + 1}/${DIALOG.length} (${line.voice})`);
    await synthesize(line, file);
    lineFiles.push(file);
  }

  // 2) Concatenate dialog with small pauses
  const dialogFile = path.join(TMP_DIR, "dialog.mp3");
  console.log("  · concatenating dialog");
  await concatDialog(lineFiles, dialogFile);

  // 3) Build ambience bed the same length as the dialog
  const dur = await getDurationSec(dialogFile);
  const ambienceFile = path.join(TMP_DIR, "ambience.mp3");
  console.log(`  · building ${dur.toFixed(1)}s ambience bed`);
  await buildAmbience(ambienceFile, dur + 1);

  // 4) Final mix
  console.log("  · mixing final output");
  await finalMix(dialogFile, ambienceFile, OUT_FILE);

  const stat = await fs.stat(OUT_FILE);
  console.log(
    `\n[ok] Wrote ${path.relative(ROOT, OUT_FILE)} (${(stat.size / 1024).toFixed(
      1
    )} KB, ${dur.toFixed(1)}s)`
  );
  console.log(
    "Refresh the Siren homepage and click “Play Demo” to hear the new call."
  );
}

main().catch((err) => {
  console.error("\n[fatal]", err.message ?? err);
  process.exit(1);
});
