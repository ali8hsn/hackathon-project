import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../../_lib/mongodb";
import { ingestTranscript } from "../../../_lib/incident-ingest";
import { transcribeAudio } from "../../../_lib/sentinel-ai";

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const recordingUrl = formData.get("RecordingUrl") as string | null;
  const recordingStatus = formData.get("RecordingStatus") as string | null;
  const callSid = formData.get("CallSid") as string | null;
  const from = formData.get("From") as string | null;
  const recordingDuration = formData.get("RecordingDuration") as string | null;

  console.log("📞 Twilio recording callback received:");
  console.log(`   CallSid: ${callSid}`);
  console.log(`   From: ${from}`);
  console.log(`   Status: ${recordingStatus}`);
  console.log(`   Duration: ${recordingDuration}s`);
  console.log(`   Recording: ${recordingUrl}`);

  if (recordingStatus !== "completed" || !recordingUrl) {
    console.warn("⚠️ Recording not completed or no URL, skipping pipeline");
    return new Response("OK", { status: 200 });
  }

  if (!isMongoConfigured()) {
    console.error("❌ MongoDB not configured — cannot process recording");
    return new Response("OK", { status: 200 });
  }

  const callerId = from ? `PHONE:${from}` : `CALL:${callSid || "unknown"}`;

  let transcript: string;
  try {
    console.log(`\n🎙️ Transcribing audio for ${callerId}...`);
    transcript = await transcribeAudio(recordingUrl);
    console.log(`   📝 Transcript: "${transcript.slice(0, 120)}..."`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️ Transcription skipped: ${msg}`);
    return new Response("OK", { status: 200 });
  }

  try {
    console.log(`\n🧠 Processing through AI pipeline (Claude + MongoDB)...`);
    await ingestTranscript({
      transcript,
      caller_id: callerId,
      sentinel_assist_enabled: true,
      extraLogFields: {
        source: "twilio_call",
        callSid: callSid || undefined,
        recordingUrl: recordingUrl || undefined,
      },
    });
    console.log("   ✅ Pipeline completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`   ❌ Pipeline error: ${message}`);
  }

  return new Response("OK", { status: 200 });
}

export async function GET() {
  return Response.json({
    status: "ok",
    endpoint: "Twilio Recording Callback",
    description:
      "Posts recording results here. Transcription requires a separate STT provider in the Claude-only stack; browser intake at /intake uses Web Speech API.",
  });
}
