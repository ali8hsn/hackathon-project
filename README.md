# ARIA 911 — AI Emergency Intake System
## Full Setup & Usage Guide

---

## What This Does

ARIA is a **real, working** AI-powered 911 intake system. When you speak into your microphone (or phone):

1. **Whisper AI** (OpenAI) transcribes your speech to text in real time, every 3 seconds
2. **Claude AI** (Anthropic) analyzes what you said, extracts structured emergency data, and generates a spoken response
3. The **dispatcher screen** updates live — ticket fields populate, severity bars animate, and priority is assigned automatically
4. **Auto-translation**: If you speak Spanish, Mandarin, Arabic, or any other language, it detects and translates automatically
5. At call end, Claude generates a **full formal incident report** with one click

---

## Prerequisites

You need:
- **Node.js** (version 18 or higher) — download at https://nodejs.org
- **An OpenAI API key** — get one at https://platform.openai.com/api-keys
- **An Anthropic API key** — get one at https://console.anthropic.com/

Both keys cost money per use but very small amounts (~$0.01–0.05 per call session).

---

## Step-by-Step Setup

### Step 1 — Download the project files

Put all these files in a folder on your computer, e.g. `aria911/`:
```
aria911/
  server.js
  package.json
  .env.example
  public/
    index.html
```

### Step 2 — Install Node.js (if you don't have it)

1. Go to https://nodejs.org
2. Download the **LTS version** (the green button)
3. Install it — just click through the installer
4. To verify: open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
   ```
   node --version
   ```
   It should show something like `v20.11.0`

### Step 3 — Install project dependencies

Open Terminal / Command Prompt, navigate to your aria911 folder:
```bash
cd aria911
npm install
```
Wait for it to finish (may take 30–60 seconds).

### Step 4 — Set up your API keys

Copy the example env file and add your keys:
```bash
cp .env.example .env
```
Then open `.env` in any text editor and fill in your keys:
```
OPENAI_API_KEY=sk-your-actual-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-actual-anthropic-key-here
PORT=3000
```

### Step 5 — Start the server

```bash
node server.js
```

You should see:
```
╔══════════════════════════════════════════╗
║     ARIA 911 — AI Intake System          ║
║     http://localhost:3000                ║
╚══════════════════════════════════════════╝
```

### Step 6 — Open the app

Open your browser and go to:
```
http://localhost:3000
```

A setup screen will appear. Enter your OpenAI and Anthropic keys and click **Connect & Launch ARIA**.

---

## Using ARIA

### Option A — Speak directly through your computer (simplest)
1. Click **▶ Start Call**
2. Allow microphone access when the browser asks
3. Start speaking — describe your emergency
4. Watch the dispatcher panel on the right update in real time
5. Click **■ End Call** when done
6. Click **📋 Incident Report** to generate the AI report

### Option B — Use your phone as the microphone
This lets you literally call from your phone and have it captured:

**Method 1 — Open on phone browser:**
1. Find your computer's local IP address:
   - Mac: System Preferences → Network → your IP (e.g. 192.168.1.45)
   - Windows: CMD → type `ipconfig` → look for IPv4 Address
2. On your phone, open the browser and go to: `http://192.168.1.45:3000`
3. Tap Start Call — your phone mic is now the input
4. Your computer screen shows the live dispatcher view

**Method 2 — Two-device split (most realistic simulation):**
- Open `http://localhost:3000` on your **computer** (dispatcher view)
- Open `http://[your-ip]:3000` on your **phone** (caller view)
- Start call on phone → dispatcher view updates on computer in real time via WebSocket

**Method 3 — Phone call to computer audio (advanced):**
- Use Bluetooth/AirPlay to route phone call audio to computer speakers
- Use a virtual audio cable (e.g., BlackHole on Mac, VB-Audio on Windows) to capture that as mic input
- Then ARIA transcribes the actual phone call

---

## What the Dispatcher Sees (Real-Time)

As you speak, these fields populate live:
- **Incident Type** — auto-classified (CARDIAC ARREST, HOUSE FIRE, etc.)
- **Location** — extracted from what you say
- **Victims / Injuries / Hazards** — pulled from speech
- **Priority Badge** — CRITICAL / HIGH / MEDIUM auto-assigned by Claude
- **Severity Bars** — Life Threat, Urgency, Location Confidence, Info Completeness
- **Incident Timeline** — tracks progress from intake → dispatch
- **AI Dispatch Recommendation** — Claude suggests what units to send
- **Key Flags** — important items highlighted automatically
- **Translation Panel** — if non-English detected, shows original + English translation

---

## The Incident Report

After ending a call, click **📋 Incident Report**. Claude generates a formal report including:
- Incident Summary
- Full Incident Details
- Caller & Victim Information
- Nature of Emergency
- Hazards & Special Considerations
- AI Actions Taken
- Dispatch Recommendation
- Timestamped Timeline of Events
- Language/Translation Notes
- AI Confidence Assessment
- Recommended Follow-Up Actions

You can copy it or print/save as PDF.

---

## Troubleshooting

**"Cannot connect to server"**
→ Make sure `node server.js` is running in Terminal

**"Microphone access denied"**
→ In your browser, click the lock icon in the URL bar and allow microphone

**"AI processing error"**
→ Check your API keys in `.env` are correct and have credits

**Phone can't reach computer**
→ Make sure both are on the same WiFi network, and check your IP with `ipconfig` (Windows) or `ifconfig` (Mac)

**Transcription is slow or missing**
→ Speak clearly, wait 3–4 seconds between statements (audio sends in 3-second chunks)

---

## Cost Estimate

Per 5-minute call session:
- OpenAI Whisper: ~$0.03 (3-second chunks × 100 chunks × $0.006/min)
- Anthropic Claude: ~$0.05 (analysis per chunk + report generation)
- **Total: ~$0.08 per session**

---

## Tech Stack
- **Backend**: Node.js + Express + WebSockets
- **Speech-to-Text**: OpenAI Whisper API
- **AI Analysis + Responses**: Anthropic Claude Sonnet
- **Frontend**: Vanilla JS + WebSocket client (no framework needed)
- **Audio Capture**: Web MediaRecorder API (browser-native)
