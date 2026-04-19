## Learned User Preferences

- Project rebrand: replace every "Sentinel" reference (code, identifiers, routes, branding, comments, docs) with "Siren" / "Haashir" as appropriate.
- Prefer terse, scannable answers (tables, bullets, short summaries) over long prose.
- Prefer free / no-cost solutions when feasible (e.g. user declined to buy a domain; use sslip.io against the EC2 Elastic IP for free HTTPS).
- For non-trivial work, present a plan first (with todos), then implement; mark todos in_progress as you go and don't stop until all are complete.
- When asking the user for input, batch related questions and offer concrete option choices instead of open-ended prompts.

## Learned Workspace Facts

- Project name is "Siren" — operator-facing 911 dispatch console for callers on hold; live at `https://3-225-183-122.sslip.io`.
- Production runs on AWS EC2 (Ubuntu 22.04, t3.small, us-east-1a, Elastic IP `3.225.183.122`); Nginx → Node 20 + PM2 on port 3000; Let's Encrypt TLS.
- Server layout: app at `/opt/siren/app` (owned by `siren` user), env at `/etc/siren/siren.env` (mode 640, `root:siren`) symlinked to `app/.env`; SSH as `ubuntu` with `~/.ssh/siren-deploy.pem`.
- MongoDB Atlas database name is `siren`.
- AI providers: Anthropic Claude for classification + report generation (`app/_lib/haashir-ai.ts`), Gemini `gemini-2.5-flash-lite` for 1–10 severity scoring (`app/_lib/gemini-severity.ts`, persisted as `severity_score`, ratchet-up only on UPDATE), ElevenLabs for TTS on `/intake`.
- Build gotcha: `npm ci --omit=dev` breaks `npm run build` because `@tailwindcss/postcss` is a devDependency — always run full `npm ci` before building.
- Deploy gotcha: after `rsync` to the server, always `rm -rf .next` before `npm run build` — rsynced dev-mode Turbopack cache breaks the production build.
- GitHub repo `https://github.com/jawaadmerali/siren-dispatch` is private; deploy by rsyncing local files to `/tmp/siren-app/` then `cp -a` into `/opt/siren/app/`, not by `git clone` on the server.
- A redeploy/auto-commit hook auto-commits edits in batches, so `git status` may appear clean immediately after edits — verify via `git log` rather than assuming changes were lost.
- AWS firewall: security group `siren-sg` (`sg-0afefd751b50b5539`) opens TCP 22/80/443/3000; UFW on the host also allows the same set. Open both layers when exposing new ports.
- Map behavior conventions in `app/_components/MapView.tsx`: single pin → `flyTo` zoom 14.5; multiple pins → `fitBounds` padding 60 maxZoom 14; if exactly one pin is `active`, fly to it instead of fitting bounds.
- Backfill script `scripts/backfill-severity.mjs` rescores existing incidents via Gemini; run with `MONGODB_URI`, `MONGODB_DB_NAME=siren`, and `GEMINI_API_KEY` env vars after schema-affecting changes.
