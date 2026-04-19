#!/usr/bin/env bash
# ─── Siren AI · one-shot redeploy ───────────────────────────────────────────
# Run from your Mac. Pushes the current branch to GitHub (as a backup), then
# rsyncs the LOCAL working tree into /opt/siren/app on the EC2 box, installs
# deps, rebuilds, kills *every* node process to guarantee a single PM2
# instance, restarts the `siren` process, and saves the PM2 process list.
#
# Why rsync (not git pull on the box)?
#   /opt/siren/app is not a git checkout — the original deploy was rsync'd
#   because the GitHub repo is/was private. Rsync also lets you deploy local
#   uncommitted experiments without a round-trip through GitHub.
#
# Idempotent — safe to run repeatedly. After it exits cleanly, exactly one
# PM2 process named `siren` will be running on the box.
#
# Usage:
#   bash scripts/redeploy.sh
#
# Optional env overrides:
#   SIREN_HOST      — defaults to 3.225.183.122 (per DEPLOY_NOTES.md)
#   SIREN_SSH_USER  — defaults to ubuntu
#   SIREN_SSH_KEY   — defaults to ~/.ssh/siren-deploy.pem
#   SIREN_APP_DIR   — defaults to /opt/siren/app
#   SIREN_APP_USER  — defaults to siren
#   SIREN_PM2_NAME  — defaults to siren
#   SIREN_BRANCH    — defaults to current branch
#   SIREN_SKIP_PUSH — set to "1" to skip `git push` to origin (rsync still runs)
#   SIREN_DIRTY     — set to "1" to rsync even with uncommitted changes
#                     (default: warn but proceed; the .env on the box is preserved)

set -euo pipefail

# ── 0. Config ───────────────────────────────────────────────────────────────
SIREN_HOST="${SIREN_HOST:-3.225.183.122}"
SIREN_SSH_USER="${SIREN_SSH_USER:-ubuntu}"
SIREN_SSH_KEY="${SIREN_SSH_KEY:-$HOME/.ssh/siren-deploy.pem}"
SIREN_APP_DIR="${SIREN_APP_DIR:-/opt/siren/app}"
SIREN_APP_USER="${SIREN_APP_USER:-siren}"
SIREN_PM2_NAME="${SIREN_PM2_NAME:-siren}"
SIREN_SKIP_PUSH="${SIREN_SKIP_PUSH:-0}"
SIREN_HEALTH_URL="${SIREN_HEALTH_URL:-https://siren.ink/api/incidents}"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${SIREN_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

bold "── Siren redeploy ─────────────────────────────────────────────"
echo "  Host:      $SIREN_SSH_USER@$SIREN_HOST"
echo "  Key:       $SIREN_SSH_KEY"
echo "  App dir:   $SIREN_APP_DIR"
echo "  PM2 name:  $SIREN_PM2_NAME"
echo "  Branch:    $BRANCH"
echo "  Health:    $SIREN_HEALTH_URL"
echo

if [ ! -f "$SIREN_SSH_KEY" ]; then
  red "✗ SSH key not found at $SIREN_SSH_KEY"
  echo "  Set SIREN_SSH_KEY=/path/to/key.pem and re-run."
  exit 1
fi
chmod 600 "$SIREN_SSH_KEY" || true

# ── 1. Optional push to origin (backup; rsync below is the source of truth) ─
if [ "$SIREN_SKIP_PUSH" != "1" ]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    if [ "${SIREN_AUTO_COMMIT:-0}" = "1" ]; then
      yellow "⚠  Uncommitted changes detected — auto-committing (SIREN_AUTO_COMMIT=1)"
      git status --short
      git add -A
      git commit --no-verify -m "wip: auto-commit before redeploy ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
      green "✓ Auto-committed"
    elif [ "${SIREN_DIRTY:-0}" = "1" ]; then
      yellow "⚠  Uncommitted changes — proceeding (SIREN_DIRTY=1; will not push to origin)"
      git status --short
      SIREN_SKIP_PUSH=1
    else
      yellow "⚠  Uncommitted changes detected. Choose one:"
      yellow "    • SIREN_AUTO_COMMIT=1 bash scripts/redeploy.sh   (commit + push + rsync)"
      yellow "    • SIREN_DIRTY=1       bash scripts/redeploy.sh   (rsync only, skip push)"
      yellow "    • SIREN_SKIP_PUSH=1   bash scripts/redeploy.sh   (rsync only, skip push)"
      git status --short
      exit 1
    fi
  fi
  if [ "$SIREN_SKIP_PUSH" != "1" ]; then
    bold "→ Pushing $BRANCH to origin (backup)"
    git push origin "$BRANCH" || yellow "⚠  push failed — continuing with rsync"
    green "✓ Pushed"
  fi
else
  yellow "⚠  SIREN_SKIP_PUSH=1 — skipping git push (rsync still runs)"
fi
echo

# ── 2. Stage local tree → remote /tmp/siren-stage ───────────────────────────
bold "→ Staging local tree → $SIREN_SSH_USER@$SIREN_HOST:/tmp/siren-stage"
ssh -o StrictHostKeyChecking=accept-new \
    -i "$SIREN_SSH_KEY" \
    "$SIREN_SSH_USER@$SIREN_HOST" \
    'rm -rf /tmp/siren-stage && mkdir -p /tmp/siren-stage'

# Excludes mirror what's in .gitignore + a few hot caches that we never want
# to push. We DO ship package-lock.json, server.js, public/, app/, lib/.
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.cache' \
  --exclude='.cursor' \
  --exclude='*.pem' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='public/twilio-audio' \
  --exclude='tsconfig.tsbuildinfo' \
  -e "ssh -i '$SIREN_SSH_KEY' -o StrictHostKeyChecking=accept-new" \
  "$ROOT/" "$SIREN_SSH_USER@$SIREN_HOST:/tmp/siren-stage/"
green "✓ Staged"
echo

# ── 3. Remote install / build / restart ─────────────────────────────────────
bold "→ Connecting to $SIREN_HOST and redeploying"

LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"

ssh -o StrictHostKeyChecking=accept-new \
    -i "$SIREN_SSH_KEY" \
    "$SIREN_SSH_USER@$SIREN_HOST" \
    "APP_DIR='$SIREN_APP_DIR' APP_USER='$SIREN_APP_USER' PM2_NAME='$SIREN_PM2_NAME' LOCAL_SHA='$LOCAL_SHA' bash -s" <<'REMOTE'
set -euo pipefail

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

# 3a. Sync staged code into /opt/siren/app, preserving the .env symlink
#     (which points to /etc/siren/siren.env — the source of truth for secrets).
bold "  ▸ rsync /tmp/siren-stage → $APP_DIR (preserving .env symlink)"
sudo rsync -a --delete \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='public/twilio-audio' \
  /tmp/siren-stage/ "$APP_DIR/"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Sanity-check the env symlink is still intact (must use sudo because
# /opt/siren is mode 750 and unreadable by the ubuntu SSH user).
if ! sudo test -L "$APP_DIR/.env"; then
  red "  ✗ $APP_DIR/.env is missing or not a symlink — refusing to continue."
  red "    Restore with: sudo -u $APP_USER ln -s /etc/siren/siren.env $APP_DIR/.env"
  exit 1
fi
ENV_TARGET="$(sudo readlink -f "$APP_DIR/.env")"
if ! sudo test -r "$ENV_TARGET"; then
  red "  ✗ $APP_DIR/.env points at $ENV_TARGET which is missing/unreadable — refusing to continue."
  exit 1
fi
green "  ✓ .env symlink intact: $ENV_TARGET"

# 3b. Install deps (production-ready; honors lockfile). Note: full install
#     including devDeps because @tailwindcss/postcss is a devDep needed at
#     build time. Build output is the only thing PM2 actually serves.
bold "  ▸ npm ci"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm ci --no-audit --no-fund"

# 3c. Build (always rm -rf .next first — rsync may have brought stale chunks)
bold "  ▸ rm -rf .next && npm run build"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && rm -rf .next && NODE_ENV=production npm run build"

# 3c.1. Drop a marker so we can always answer "what's deployed?".
DEPLOY_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sudo -u "$APP_USER" -H bash -lc "printf 'deployed_at=%s\nbuild_id=%s\nsha=%s\n' '$DEPLOY_TS' \"\$(cat $APP_DIR/.next/BUILD_ID)\" '$LOCAL_SHA' > $APP_DIR/.deployed-at"
# Standalone .git-sha so external tools (curl /api/version) can read it cheaply.
sudo -u "$APP_USER" -H bash -lc "echo '$LOCAL_SHA' > $APP_DIR/.git-sha"

# 3d. Single-instance guarantee — kill EVERY node process on the box,
# then start exactly one PM2 process named "$PM2_NAME".
bold "  ▸ Stopping all PM2 + node processes (single-instance guarantee)"

# Stop & delete every PM2 process owned by the app user (clean slate).
sudo -u "$APP_USER" -H pm2 stop all  >/dev/null 2>&1 || true
sudo -u "$APP_USER" -H pm2 delete all >/dev/null 2>&1 || true

# Belt-and-suspenders: also stop any PM2 daemons / processes for other users.
# This catches the case where someone (or `pm2 startup`) launched a second
# daemon under root or ubuntu.
for u in root ubuntu "$APP_USER"; do
  if id "$u" &>/dev/null; then
    sudo -u "$u" -H pm2 stop all   >/dev/null 2>&1 || true
    sudo -u "$u" -H pm2 delete all >/dev/null 2>&1 || true
    sudo -u "$u" -H pm2 kill       >/dev/null 2>&1 || true
  fi
done

# Final hammer: kill any orphaned `node` / `next` processes that weren't
# tracked by PM2 (e.g. left from a manual `npm start`).
ORPHANS="$(pgrep -af 'node|next-server|next start' | grep -v 'pgrep' || true)"
if [ -n "$ORPHANS" ]; then
  yellow "    ! Orphan node/next processes found — killing:"
  echo "$ORPHANS" | sed 's/^/      /'
  sudo pkill -f 'next-server' 2>/dev/null || true
  sudo pkill -f 'next start'  2>/dev/null || true
  sudo pkill -9 -f 'node .*server.js' 2>/dev/null || true
  sleep 1
fi

# 3e. Start exactly one PM2 process. Uses server.js because that's the
# project's custom entry (Next 16 + ws-aria WebSocket). Falls back to
# `npm start` if server.js is missing.
bold "  ▸ Starting PM2 process: $PM2_NAME"
# `sudo test -f` because $APP_DIR is mode 750 (siren:siren only).
if sudo test -f "$APP_DIR/server.js"; then
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 start server.js --name '$PM2_NAME' --time --update-env"
else
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 start npm --name '$PM2_NAME' --time --update-env -- start"
fi

# 3f. Save the process list so `pm2 resurrect` works after reboot.
sudo -u "$APP_USER" -H pm2 save --force >/dev/null

# 3g. Sanity-check: there should be EXACTLY one process now.
COUNT="$(sudo -u "$APP_USER" -H pm2 jlist | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')"
if [ "$COUNT" != "1" ]; then
  red "  ✗ Expected exactly 1 PM2 process, found $COUNT"
  sudo -u "$APP_USER" -H pm2 list
  exit 1
fi

green "  ✓ Single PM2 instance running:"
sudo -u "$APP_USER" -H pm2 list

# 3h. Drift detection — fail loudly if the box has files that aren't in
# our local tree. The rsync --delete should already prevent this, but a
# fresh `find` on the box is cheap insurance and gives us a paper trail.
bold "  ▸ Verifying box parity (no files newer than $APP_DIR/.deployed-at)"
DRIFT="$(sudo find "$APP_DIR" -type f \
  -newer "$APP_DIR/.deployed-at" \
  -not -path "$APP_DIR/node_modules/*" \
  -not -path "$APP_DIR/.next/*" \
  -not -path "$APP_DIR/.cache/*" \
  -not -name '.deployed-at' \
  -not -name '.git-sha' \
  2>/dev/null || true)"
if [ -n "$DRIFT" ]; then
  red "  ✗ DRIFT DETECTED — files modified on the box AFTER deploy:"
  echo "$DRIFT" | sed 's/^/      /'
  red "    These files are unmanaged. Investigate before trusting this deploy."
else
  green "  ✓ No drift — every file on the box came from this rsync"
fi

# 3i. Clean up the staging tree so /tmp doesn't accumulate.
bold "  ▸ Cleaning up /tmp/siren-stage"
rm -rf /tmp/siren-stage
green "  ✓ Cleaned"
REMOTE

echo
bold "→ Smoke-testing $SIREN_HEALTH_URL"
HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SIREN_HEALTH_URL" || echo "000")"
if [ "$HTTP_CODE" = "200" ]; then
  green "✓ Health check OK ($HTTP_CODE)"
else
  yellow "⚠  Health check returned $HTTP_CODE (give it ~10s and check again with: curl -i $SIREN_HEALTH_URL)"
fi

echo
green "── Redeploy complete ───────────────────────────────────────────"
echo "  Live: https://siren.ink"
echo "  Logs: ssh -i $SIREN_SSH_KEY $SIREN_SSH_USER@$SIREN_HOST 'sudo -u $SIREN_APP_USER pm2 logs $SIREN_PM2_NAME --lines 80'"
