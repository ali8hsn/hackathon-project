## Learned User Preferences

- Project name is "Siren" / "Haashir" — never use any other product name in code, identifiers, routes, branding, comments, or docs. The user has a strong aversion to the legacy name and wants zero references anywhere.
- Prefer terse, scannable answers (tables, bullets, short summaries) over long prose.
- Prefer free / no-cost solutions when feasible.
- For non-trivial work, present a plan first (with todos), then implement; mark todos in_progress as you go and don't stop until all are complete.
- When asking the user for input, batch related questions and offer concrete option choices instead of open-ended prompts.
- User frequently pastes raw secrets (Anthropic / Mongo URI / Twilio / AWS session creds / ElevenLabs) into chat — never write those values into committed files; keep them only in `/etc/siren/siren.env` on the server and use placeholders in `.env.example` and docs.

## Learned Workspace Facts

- Project name is "Siren" — operator-facing 911 dispatch console for callers on hold; live at `https://siren.ink`.
- Production: AWS EC2 (Ubuntu 22.04, t3.small, us-east-1a, Elastic IP `3.225.183.122`); Nginx → Node 20 + PM2 on port 3000; Let's Encrypt TLS. App at `/opt/siren/app` (owner `siren`); env at `/etc/siren/siren.env` (mode 640, `root:siren`) symlinked to `app/.env`; SSH as `ubuntu` with `~/.ssh/siren-deploy.pem`.
- MongoDB Atlas database name is `siren`. Connection details live in `/etc/siren/siren.env` via `MONGODB_URI` + `MONGODB_DB_NAME=siren`. Older deployments may have a stale `MONGODB_DB_NAME` value in the on-box env file even after the code defaults change — always verify with `ssh ... grep MONGODB_DB_NAME /opt/siren/app/.env` and merge+drop any other databases (idempotent upsert-by-_id) before flipping.
- AI providers: Anthropic Claude for classification + report generation (`app/_lib/haashir-ai.ts`); Gemini `gemini-2.5-flash-lite` for 1–10 severity scoring (`app/_lib/gemini-severity.ts`, persisted as `severity_score`, ratchet-up only on UPDATE); ElevenLabs for TTS on `/intake`.
- Live phone-call ingest uses Twilio webhooks routed through an ngrok tunnel set via `PUBLIC_BASE_URL`; recorded audio is uploaded to S3 bucket `amzn-siren` (`AWS_S3_TWILIO_BUCKET`); auth via `TWILIO_AUTH_TOKEN`.
- Build/deploy gotchas: run full `npm ci` (NOT `--omit=dev`) before `npm run build` because `@tailwindcss/postcss` is a devDependency; always `rm -rf .next` after rsync (Turbopack dev cache breaks the production build).
- Canonical redeploy: run `scripts/redeploy.sh` after each major change — rsyncs local → `/tmp/siren-stage/` then into `/opt/siren/app/`, rebuilds, and restarts PM2. The repo `https://github.com/jawaadmerali/siren-dispatch` is private, so do NOT `git clone` on the server.
- Co-developer "Jawaad" pushes to `main` on the same GitHub repo; before each AWS redeploy pull/merge his latest commits and integrate his changes (esp. the Twilio phone bridge).
- An auto-commit hook batches edits, so `git status` may look clean immediately after edits — verify via `git log` rather than assuming changes were lost.
- AWS firewall: security group `siren-sg` (`sg-0afefd751b50b5539`) and host UFW must both allow TCP 22/80/443/3000; open both layers when exposing new ports.
- Map conventions in `app/_components/MapView.tsx`: single pin → `flyTo` zoom 14.5; multiple pins → `fitBounds` padding 60 maxZoom 14; if exactly one pin is `active`, fly to it instead of fitting bounds. Rescore existing incidents via `scripts/backfill-severity.mjs` (env: `MONGODB_URI`, `MONGODB_DB_NAME=siren`, `GEMINI_API_KEY`).
- Branding lock: homepage hero tagline is "Every 911 call, treated with the same care." Dispatch recommendation must render structured (Priority + address header; sections: Immediate Dispatch / Bystander Instructions / Responder Preparation) with copy buttons and severity pills — never a single paragraph wall-of-text.
- API shape: `ingestTranscript` returns `new_incident_id` for CREATE and `target_id` for UPDATE/FLAG_FOR_REVIEW (NOT `incident.id` or `id`). Anything that links to `/situation-sheet/<id>` after POST `/api/incidents` must read `new_incident_id || target_id`.
