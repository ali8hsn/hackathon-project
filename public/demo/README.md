# Siren Demo Audio

The homepage **Play Demo** feature expects a file at:

```
public/demo/burning-building.mp3
```

Generate it locally with:

```bash
# ElevenLabs (recommended — best voices)
export ELEVENLABS_API_KEY=sk_...
node scripts/generate-demo-audio.mjs

# OR OpenAI TTS (works too, cheaper)
export OPENAI_API_KEY=sk-...
node scripts/generate-demo-audio.mjs
```

This produces a ~40-second simulated 911 call (burning building, caller +
AI dispatcher) mixed with a fire-crackle + distant-siren bed using ffmpeg.

If you want to use a different recording, just drop an MP3 at the path
above named `burning-building.mp3` — the demo player will pick it up.
