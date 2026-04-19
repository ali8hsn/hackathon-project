#!/usr/bin/env node
// Re-points every Twilio phone number on the configured account at our
// production AWS host so live calls never depend on a developer-laptop tunnel.
//
// Required env (read from process.env or .env beside this script):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   PUBLIC_BASE_URL          e.g. https://siren.ink
//
// Optional:
//   TWILIO_PHONE_NUMBER_SID  — if set, only update that single number
//
// Usage:
//   node scripts/configure-twilio-webhook.mjs
//   node scripts/configure-twilio-webhook.mjs --dry-run

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Lightweight .env loader so the script also works on the box where dotenv may
// not be installed in the script's local node context.
function loadDotenv() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.join(here, '..', '.env');
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) {
        process.env[k] = v.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // No .env beside the script — that's fine, env may already be set.
  }
}
loadDotenv();

const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const onlyNumberSid = (process.env.TWILIO_PHONE_NUMBER_SID || '').trim();
const dryRun = process.argv.includes('--dry-run');

if (!sid || !token) {
  console.error('✖ Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.');
  process.exit(1);
}
if (!base) {
  console.error('✖ Missing PUBLIC_BASE_URL (e.g. https://siren.ink).');
  process.exit(1);
}

const voiceUrl = `${base}/api/aria/twilio/voice`;
const statusCallback = `${base}/api/aria/twilio/call-status`;
const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

async function listNumbers() {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`,
    { headers: { Authorization: auth } }
  );
  if (!res.ok) {
    throw new Error(`Twilio list failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return (await res.json()).incoming_phone_numbers ?? [];
}

async function updateNumber(numberSid, label) {
  const body = new URLSearchParams({
    VoiceUrl: voiceUrl,
    VoiceMethod: 'POST',
    StatusCallback: statusCallback,
    StatusCallbackMethod: 'POST',
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${numberSid}.json`,
    { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) {
    throw new Error(`Update ${label} failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res.json();
}

(async () => {
  console.log(`▸ Pointing Twilio numbers at ${voiceUrl}`);
  if (dryRun) console.log('  (dry-run — no changes will be applied)');

  const numbers = await listNumbers();
  const targets = onlyNumberSid ? numbers.filter((n) => n.sid === onlyNumberSid) : numbers;

  if (!targets.length) {
    console.warn('⚠ No Twilio incoming numbers matched. Nothing to do.');
    return;
  }

  for (const n of targets) {
    const label = `${n.phone_number} (${n.friendly_name || n.sid})`;
    console.log(`  • ${label}`);
    console.log(`      old VoiceUrl: ${n.voice_url || '(empty)'}`);
    console.log(`      new VoiceUrl: ${voiceUrl}`);
    if (!dryRun) {
      await updateNumber(n.sid, label);
      console.log('      ✓ updated');
    }
  }

  console.log('✓ Done. Place a real call to verify.');
})().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
