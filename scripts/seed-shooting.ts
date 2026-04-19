/**
 * Seed: Active Shooter — Sentinel Assist Mode
 *
 * Sends a life-threatening call with sentinel_assist_enabled=true.
 * This should trigger auto-flagging (HIGH priority, bypasses triage).
 *
 * Usage: bun run scripts/seed-shooting.ts
 */

const API_BASE = "http://localhost:3000";

const transcripts = [
  {
    transcript:
      "There are shots fired at the Riverside Shopping Center on Congress Avenue. People are running and screaming. I'm hiding behind a car in the parking lot. I heard at least 5 or 6 shots. I can see a man with a gun near the entrance of the Target store. Please send help immediately, there are people on the ground.",
    caller_id: "CALLER-1 (Bystander)",
    coordinates: { lat: 30.2490, lng: -97.7480 },
    sentinel_assist: true,
    delay: 0,
  },
  {
    transcript:
      "I'm an employee at the Target on Congress. A man came in and started shooting. We've locked ourselves in the back stockroom. I can hear more shots. There are about 15 of us in here. I think at least two customers were hit near the front registers.",
    caller_id: "CALLER-2 (Employee)",
    coordinates: { lat: 30.2492, lng: -97.7478 },
    sentinel_assist: true,
    delay: 2000,
  },
];

async function ingestTranscript(entry: (typeof transcripts)[number]) {
  console.log(`\n📞 Ingesting: ${entry.caller_id}`);
  console.log(`   "${entry.transcript.slice(0, 80)}..."`);

  const res = await fetch(`${API_BASE}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: entry.transcript,
      caller_id: entry.caller_id,
      coordinates: entry.coordinates,
      sentinel_assist_enabled: entry.sentinel_assist,
    }),
  });

  const data = await res.json();
  console.log(`   → Action: ${data.action} | Priority: ${data.priority} | Status: ${data.status}`);
  console.log(`   → Title: ${data.title}`);
  if (data.new_incident_id) console.log(`   → ID: ${data.new_incident_id}`);
  if (data.ai_suggestion) {
    console.log(`   → AI Suggestion: priority=${data.ai_suggestion.recommended_priority}, auto_flag=${data.ai_suggestion.auto_flag}`);
    console.log(`   → Reasoning: ${data.ai_suggestion.reasoning}`);
  }
  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("═".repeat(60));
  console.log("🔫 SEED: Active Shooter (Sentinel Assist ON)");
  console.log("═".repeat(60));

  for (const entry of transcripts) {
    if (entry.delay > 0) await sleep(entry.delay);
    await ingestTranscript(entry);
  }

  console.log("\n✅ Done — check:");
  console.log("  → Sentinel Assist: http://localhost:3000/sentinel-assist");
  console.log("  → Monitor: http://localhost:3000/");
}

main().catch(console.error);
