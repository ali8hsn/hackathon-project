# Siren — Handoff

Everything below was built and verified (tsc + eslint clean) on Apr 19, 2026.
Three tracks: (1) AWS + GoDaddy deploy, (2) cleaner call-report UI,
(3) homepage caller-queue + demo feature.

## TL;DR — commands to run, in order

```bash
# 1. Install deps if you haven't (already done in this session)
cd siren-dispatch
npm install

# 2. Generate the demo 911-call MP3 (pick one TTS provider)
export ELEVENLABS_API_KEY=sk_...        # recommended
# OR: export OPENAI_API_KEY=sk-...
node scripts/generate-demo-audio.mjs
# → writes public/demo/burning-building.mp3

# 3. Sanity-check locally
npm run dev
# open http://localhost:3000 → click "Play Demo" on the homepage
#   → click any situation card → new clean report UI

# 4. Hand the AWS + GoDaddy deploy off to Claude Code
claude --dangerously-skip-permissions
# in the Claude Code session, paste the contents of DEPLOY_PROMPT.md
```

---

## Task 1 — AWS EC2 + GoDaddy (`DEPLOY_PROMPT.md`)

Give this file to **Claude Code**, not Cursor. It's a self-contained prompt
that walks Claude Code through:

1. `whois` probing `siren.help`, `.ai`, `.live`, `.dev`, `.com`, `.io`
   and asking you which to go with
2. Step-by-step GoDaddy checkout with promo code `MLHEM26` (manual — no
   GoDaddy API exists for the public)
3. EC2 `t3.small` + Elastic IP + security group in `us-east-1`
4. Node 20 + Nginx + PM2 + Certbot bootstrap via cloud-init user-data
5. Secrets in `/etc/siren/siren.env` owned `root:siren` 640
6. Nginx reverse proxy with **WebSocket upgrade headers** (required by
   `server.js`) and `proxy_read_timeout 3600s`
7. Let's Encrypt TLS (HTTP → HTTPS redirect)
8. PM2 systemd on-boot service
9. Smoke tests: `curl`, `wscat` WebSocket connect, browser walkthrough
10. A `DEPLOY_NOTES.md` written back into the repo

You'll need to provide Claude Code, when it asks:

- AWS access-key + secret (IAM user scoped to EC2/VPC is enough)
- Your GitHub repo URL (add a deploy key if it's private)
- Anthropic API key
- MongoDB Atlas URI (or let it walk you through making one)

Estimated spend: $20/mo for EC2 + domain. `MLHEM26` covers the domain for
hackathon participants; the EC2 instance will run on your AWS credits.

---

## Task 2 — Cleaner call-report UI

Changed files:

- `app/situation-sheet/[id]/page.tsx` — full rewrite

What's new:

- **Key Facts card** at the top of the report — grid of aggregated
  details (nature, location, victims, hazards, etc.) pulled from
  `incident.aggregatedDetails`, so the dispatcher sees structured facts
  before any prose
- **Conflicts moved to a dedicated tab** (appears only when conflicts
  exist) with a banner at the top of the report that jumps to it —
  dispatcher always knows callers disagreed before they start reading
- **Copy**, **Print**, **Regenerate**, **Edit** buttons as a tidy action
  row (Copy strips markdown; Print hides chrome via `print:hidden`
  classes so PDF export is clean)
- **Polished markdown rendering** — section headers get a brand-red
  accent bar, blockquotes are tinted, bullets use brand dots, tighter
  vertical rhythm
- **Chat-bubble transcripts** — caller on left, AI/dispatcher on right,
  speaker icons, live-pulse indicator for active lines
- **Confidence breakdown + dispatched units** now live in the right
  sidebar beneath the map — every useful datum on one screen, no scroll
- Priority-aware header ring (red for HIGH, amber for MEDIUM)
- Empty state when the report isn't generated yet with a one-click
  "Generate Report" button

Visual tone matches the rest of Siren (Inter / Material Symbols / dark
theme tokens from `globals.css`).

---

## Task 3 — Homepage live caller queue + Demo feature

Changed/new files:

- `app/page.tsx` — reworked homepage
- `app/_components/LiveCallerQueue.tsx` (new)
- `app/_components/DemoController.tsx` (new)
- `scripts/generate-demo-audio.mjs` (new)
- `public/demo/README.md` (new)

### Homepage

- New **"Dispatcher Console"** heading + live pulse chip + total-count
  summary
- A **Live Caller Queue** strip at the top showing calls in progress.
  Each card renders:
    - masked phone + elapsed timer (ticks every second)
    - status pill (`ringing` → `triaging` → `ready`)
    - fields populating over time: Nature, Location, Victims, Hazards
    - confidence bar
    - "Open dispatch" link once promoted to an incident
- Below, the existing **Active Situations** list, cleaned up and
  priority-ring-aware
- **Play Demo** button in the top-right, launches the DemoController

### Live-caller source

The queue renders two things:

1. **Backend-derived callers** — any `Incident` whose transcript has
   `isLive === true` or whose `status` is `intake`/`open` is folded
   into a `LiveCaller` via `callerFromIncident(incident)`
2. **The demo caller** — when the demo is playing, a synthetic
   `+1 512 ••• 0471` caller is injected at the top and its fields
   populate in sync with the MP3 playback

### Demo controller

`DemoController` is a modal overlay. When open:

1. Plays `/demo/burning-building.mp3`
2. Auto-advances through 7 scripted steps keyed to timestamps in the MP3
   (`DEMO_STEPS` in `DemoController.tsx` — tweak timings if your TTS
   output is longer/shorter than ~45s)
3. For each step, pushes a partial `LiveCaller` patch upward to the
   homepage, so fields appear in real time
4. For each step, also emits a `spotlight` key (`queue`, `report`,
   `haashir`, etc.) that the homepage uses to highlight the relevant
   section with a brand ring
5. Play / pause / restart / stop controls
6. Graceful fallback: if the MP3 is missing, a yellow notice appears
   and the step narration continues without audio

### MP3 generator

`scripts/generate-demo-audio.mjs` is a zero-dep (node + ffmpeg) Node
script that:

1. Renders each scripted line through ElevenLabs (preferred, best
   voices) or OpenAI `gpt-4o-mini-tts`
2. Concatenates the lines with 450ms pauses
3. Builds a **fire-crackle + distant-siren + room-tone** bed on the fly
   using ffmpeg's `anoisesrc` / `sine` filters — no asset downloads
4. Mixes dialog over bed, compresses, limits, and writes
   `public/demo/burning-building.mp3`

Run it any time to regenerate. If you later record a real MP3 you'd
rather use, just drop it in at the same path.

---

## Verification run

```bash
npx tsc --noEmit                  # ✅ 0 errors
npx eslint app/page.tsx app/situation-sheet app/_components   # ✅ 0 errors
```

`npm run build` succeeds once the host has public internet access for
Google Fonts (this sandbox doesn't, but EC2 will).

---

## What's still on your plate

- [ ] Give Claude Code `DEPLOY_PROMPT.md` and the secrets it asks for
- [ ] Pick a TLD when it prints availability
- [ ] Run the GoDaddy checkout with `MLHEM26` when prompted
- [ ] Run `scripts/generate-demo-audio.mjs` with an ElevenLabs or
      OpenAI key so `public/demo/burning-building.mp3` exists
- [ ] Walk through the demo in dev (`npm run dev`) to confirm timings
      feel right — tweak `DEMO_STEPS[].atSec` in
      `app/_components/DemoController.tsx` if needed

## What I did NOT touch

- Anything under `app/haashir-assist`, `app/trend-detection`, or
  `app/intake` — they still use the old styling. Happy to polish these
  to match the new report/homepage look if you want a consistent pass.
- `server.js` — the deploy prompt relies on it running unchanged on
  port 3000 behind Nginx.
- The MongoDB schema and API routes — only the UI changed.
