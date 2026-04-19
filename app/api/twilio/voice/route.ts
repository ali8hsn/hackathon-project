import { NextRequest } from "next/server";

// ─── POST /api/twilio/voice ──────────────────────────────────────────────────
// Twilio sends a POST here when someone calls your Twilio number.
// We return TwiML that greets the caller and records their message.
// When the recording is finished, Twilio posts the audio URL to /api/twilio/status.

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  // TwiML response:
  // 1. Say a greeting
  // 2. Record the caller's message (transcription handled in /api/twilio/status if STT is available)
  // 3. When recording completes, Twilio POSTs the audio URL to /api/twilio/status
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">
    Sentinel Emergency Dispatch. Please describe your emergency after the tone. When you are finished, hang up or press the pound key.
  </Say>
  <Record
    maxLength="120"
    timeout="5"
    playBeep="true"
    trim="trim-silence"
    recordingStatusCallback="${baseUrl}/api/twilio/status"
    recordingStatusCallbackMethod="POST"
    recordingStatusCallbackEvent="completed"
  />
  <Say voice="Polly.Matthew">
    No message was received. Goodbye.
  </Say>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

// Also handle GET for testing/verification
export async function GET() {
  return Response.json({
    status: "ok",
    endpoint: "Legacy Next route — Siren phone AI uses unified server",
    useInstead:
      "POST https://<YOUR_HOST>/api/aria/twilio/voice (see server.js + .env.example PUBLIC_BASE_URL)",
    dispatchLive: "/dispatch-live",
  });
}
