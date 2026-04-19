#!/usr/bin/env bash
# ─── Siren AI · one-shot redeploy ───────────────────────────────────────────
# Run from your Mac. Pushes the current branch to GitHub, SSHs into the EC2
# box documented in DEPLOY_NOTES.md, pulls the latest code, installs deps,
# rebuilds, kills *every* node process so we can guarantee one PM2 instance,
# then re-starts the `siren` process and saves the PM2 process list.
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
#   SIREN_SKIP_PUSH — set to "1" to skip `git push` (useful when running on the box)

set -euo pipefail

# ── 0. Config ───────────────────────────────────────────────────────────────
SIREN_HOST="${SIREN_HOST:-3.225.183.122}"
SIREN_SSH_USER="${SIREN_SSH_USER:-ubuntu}"
SIREN_SSH_KEY="${SIREN_SSH_KEY:-$HOME/.ssh/siren-deploy.pem}"
SIREN_APP_DIR="${SIREN_APP_DIR:-/opt/siren/app}"
SIREN_APP_USER="${SIREN_APP_USER:-siren}"
SIREN_PM2_NAME="${SIREN_PM2_NAME:-siren}"
SIREN_SKIP_PUSH="${SIREN_SKIP_PUSH:-0}"
SIREN_HEALTH_URL="${SIREN_HEALTH_URL:-https://3-225-183-122.sslip.io/api/incidents}"

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

# ── 1. Push current branch ──────────────────────────────────────────────────
if [ "$SIREN_SKIP_PUSH" != "1" ]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    if [ "${SIREN_AUTO_COMMIT:-0}" = "1" ]; then
      yellow "⚠  Uncommitted changes detected — auto-committing (SIREN_AUTO_COMMIT=1)"
      git status --short
      git add -A
      git commit --no-verify -m "wip: auto-commit before redeploy ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
      green "✓ Auto-committed"
    else
      yellow "⚠  Uncommitted changes detected. Commit them, stash, or re-run with"
      yellow "    SIREN_AUTO_COMMIT=1 bash scripts/redeploy.sh"
      git status --short
      exit 1
    fi
  fi
  bold "→ Pushing $BRANCH to origin"
  git push origin "$BRANCH"
  green "✓ Pushed"
else
  yellow "⚠  SIREN_SKIP_PUSH=1 — skipping git push"
fi
echo

# ── 2. Remote redeploy ──────────────────────────────────────────────────────
bold "→ Connecting to $SIREN_HOST and redeploying"

# Build the remote script as a single heredoc. `bash -s` reads stdin so we can
# stream this whole block over the existing SSH session — no temp files on the
# remote box.
ssh -o StrictHostKeyChecking=accept-new \
    -i "$SIREN_SSH_KEY" \
    "$SIREN_SSH_USER@$SIREN_HOST" \
    "BRANCH='$BRANCH' APP_DIR='$SIREN_APP_DIR' APP_USER='$SIREN_APP_USER' PM2_NAME='$SIREN_PM2_NAME' bash -s" <<'REMOTE'
set -euo pipefail

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

# 2a. Pull latest code
bold "  ▸ git fetch + reset to origin/$BRANCH"
sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch origin "$BRANCH"
sudo -u "$APP_USER" -H git -C "$APP_DIR" reset --hard "origin/$BRANCH"

# 2b. Install deps (production-ready; honors lockfile)
bold "  ▸ npm ci"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm ci --no-audit --no-fund"

# 2c. Build
bold "  ▸ npm run build"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && NODE_ENV=production npm run build"

# 2d. Single-instance guarantee — kill EVERY node process on the box,
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

# 2e. Start exactly one PM2 process. Uses server.js because that's the
# project's custom entry (Next 16 + ws-aria WebSocket). Falls back to
# `npm start` if server.js is missing.
bold "  ▸ Starting PM2 process: $PM2_NAME"
if [ -f "$APP_DIR/server.js" ]; then
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 start server.js --name '$PM2_NAME' --time --update-env"
else
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 start npm --name '$PM2_NAME' --time --update-env -- start"
fi

# 2f. Save the process list so `pm2 resurrect` works after reboot.
sudo -u "$APP_USER" -H pm2 save --force >/dev/null

# 2g. Sanity-check: there should be EXACTLY one process now.
COUNT="$(sudo -u "$APP_USER" -H pm2 jlist | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')"
if [ "$COUNT" != "1" ]; then
  red "  ✗ Expected exactly 1 PM2 process, found $COUNT"
  sudo -u "$APP_USER" -H pm2 list
  exit 1
fi

green "  ✓ Single PM2 instance running:"
sudo -u "$APP_USER" -H pm2 list
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
echo "  Live: https://3-225-183-122.sslip.io"
echo "  Logs: ssh -i $SIREN_SSH_KEY $SIREN_SSH_USER@$SIREN_HOST 'sudo -u $SIREN_APP_USER pm2 logs $SIREN_PM2_NAME --lines 80'"
