#!/bin/bash
# ============================================================
# Siren — Twilio webhook configurator (production)
# ============================================================
# Re-points every Twilio number on the configured account at the AWS host
# defined by PUBLIC_BASE_URL. Use this any time the AWS hostname changes
# or you suspect a number is still pointing at an old ngrok URL.
#
# Required env (or .env beside the project root):
#   TWILIO_ACCOUNT_SID
#   TWILIO_AUTH_TOKEN
#   PUBLIC_BASE_URL    e.g. https://3-225-183-122.sslip.io
#
# Examples:
#   ./scripts/setup-twilio.sh
#   ./scripts/setup-twilio.sh --dry-run
# ============================================================

set -e

cd "$(dirname "$0")/.."

if [ -z "$PUBLIC_BASE_URL" ]; then
  if [ -f .env ] && grep -q '^PUBLIC_BASE_URL=' .env; then
    export PUBLIC_BASE_URL=$(grep '^PUBLIC_BASE_URL=' .env | head -1 | cut -d= -f2-)
  fi
fi

if [ -z "$PUBLIC_BASE_URL" ]; then
  echo "✖ PUBLIC_BASE_URL is not set."
  echo "  export PUBLIC_BASE_URL=https://3-225-183-122.sslip.io"
  echo "  (or add it to .env), then re-run."
  exit 1
fi

echo "▸ Pointing Twilio numbers at $PUBLIC_BASE_URL/api/aria/twilio/voice"
node scripts/configure-twilio-webhook.mjs "$@"
