#!/bin/bash
# ============================================================
# Sentinel — Twilio + Ngrok Setup Helper
# ============================================================
# This script:
#   1. Starts ngrok to tunnel your localhost:3000
#   2. Shows you the webhook URL to configure in Twilio
#
# Prerequisites:
#   - ngrok installed (brew install ngrok)
#   - ngrok authenticated (ngrok config add-authtoken YOUR_TOKEN)
#   - Next.js dev server running (npm run dev)
#
# Usage:
#   chmod +x scripts/setup-twilio.sh
#   ./scripts/setup-twilio.sh
# ============================================================

set -e

PORT=${1:-3000}

echo "═══════════════════════════════════════════════════════════════"
echo "🛡️  Sentinel — Twilio + Ngrok Setup"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
  echo "❌ ngrok not found. Install with: brew install ngrok"
  exit 1
fi

# Check if dev server is running
if ! curl -s http://localhost:$PORT > /dev/null 2>&1; then
  echo "⚠️  Next.js dev server doesn't seem to be running on port $PORT"
  echo "   Start it with: npm run dev"
  echo "   Then re-run this script."
  echo ""
fi

echo "🔗 Starting ngrok tunnel on port $PORT..."
echo ""

# Start ngrok in the background and wait for it to be ready
ngrok http $PORT --log=stdout > /tmp/ngrok-sentinel.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Get the public URL from ngrok's API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
  echo "❌ Failed to get ngrok URL. Check if ngrok is authenticated:"
  echo "   ngrok config add-authtoken YOUR_TOKEN"
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

VOICE_WEBHOOK="${NGROK_URL}/api/twilio/voice"

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Ngrok tunnel active!"
echo ""
echo "   Public URL:     $NGROK_URL"
echo "   Voice Webhook:  $VOICE_WEBHOOK"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 TWILIO CONFIGURATION STEPS:"
echo ""
echo "   1. Go to: https://console.twilio.com/us1/develop/phone-numbers"
echo "   2. Click on your phone number"
echo "   3. Under 'Voice Configuration':"
echo "      • Set 'A call comes in' → Webhook"
echo "      • URL: $VOICE_WEBHOOK"
echo "      • Method: HTTP POST"
echo "   4. Click 'Save configuration'"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎯 TEST IT:"
echo "   Call your Twilio number and describe an emergency."
echo "   The incident should appear on the dashboard within ~30 seconds."
echo ""
echo "Press Ctrl+C to stop ngrok..."
echo ""

# Keep ngrok running in foreground
wait $NGROK_PID
