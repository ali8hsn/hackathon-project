# Siren

AI dispatch console for 911 callers stuck on hold. Live at **https://siren.ink**.

A single inbound number receives the call, an AI agent triages the caller in
real time, the dispatcher sees structured fields (priority, location, victims,
hazards) populating live, and a formal incident report is generated when the
call ends. Multiple callers reporting the same event are auto-clustered into a
single incident on the map and in the queue.

## Stack

- **Next.js 15** (App Router) + **Express** in one process (`server.js`)
- **Anthropic Claude** — incident triage + report generation
- **Google Gemini** — 1–10 severity scoring
- **ElevenLabs** — natural-voice TTS for the intake flow
- **Twilio** — inbound voice + transcription webhooks
- **MongoDB Atlas** — incidents + phone-call history (`siren` database)
- **MapLibre GL** — live caller map with proximity clustering
- **AWS EC2** + **Nginx** + **PM2** + **Let's Encrypt** in production

## Local dev

```bash
cp .env.example .env   # then fill in API keys
npm install
npm run dev            # http://localhost:3000
```

Required env vars are documented in `.env.example`. Mongo + Anthropic + Twilio
+ ElevenLabs are all required for full functionality; the rest are optional.

## Deploy

```bash
./scripts/redeploy.sh
```

Rsyncs the local tree to EC2, runs `npm ci && npm run build`, and restarts the
PM2 process. The production env lives in `/etc/siren/siren.env` on the box and
is symlinked into `/opt/siren/app/.env`.

## Layout

```
app/                     Next.js routes + components
  _components/             shared client components
  _lib/                    server-side helpers (Mongo, AI, types)
  api/                     route handlers (incidents, Twilio, status)
  phone-calls/             live Twilio monitor
  reports/                 historical incident table + filters
  haashir-assist/          AI co-pilot panel
  trend-detection/         pattern + anomaly view
  situation-sheet/[id]/    per-incident dispatch view
  intake/ → public/intake/ static voice-intake page (served by Express)
server.js                Express + WebSocket bridge for Twilio + intake
scripts/                 deploy, seed, Twilio config helpers
```

## Routes

| Path | What |
|---|---|
| `/` | Homepage with live monitor, map, hero |
| `/phone-calls` | Twilio call monitor with triage queue ranking |
| `/reports` | All incidents (live + demo with filter) |
| `/haashir-assist` | AI assist panel + scenario lab |
| `/trend-detection` | Pattern + anomaly view |
| `/situation-sheet/[id]` | Per-incident dispatch sheet |
| `/intake/` | Browser-based voice intake (alternative to phone) |
| `/api/incidents` | List + create incidents |
| `/api/aria/twilio/voice` | Inbound Twilio webhook |
| `/api/aria/phone-calls` | Persisted phone-call history |
| `/ws-aria` | WebSocket bridge for live transcripts + AI updates |
