/**
 * Seed: Multi-Vehicle Accident on Highway
 *
 * Simulates a high-priority multi-vehicle collision with multiple callers
 * reporting different details about injuries, vehicles, and road conditions.
 *
 * Usage: bun run scripts/seed-highway-accident.ts
 */

const API_BASE = "http://localhost:3000";

const transcripts = [
  {
    transcript:
      "There's been a major accident on I-35 northbound near exit 238. I can see at least three cars piled up and a semi truck jackknifed across two lanes. Traffic is completely stopped. I think I see someone climbing out of one of the cars but another person looks like they're not moving.",
    caller_id: "CALLER-1 (Passing driver)",
    coordinates: { lat: 30.3150, lng: -97.7100 },
    delay: 0,
  },
  {
    transcript:
      "I'm calling about the wreck on I-35 north. A red pickup truck rear-ended a white SUV which then hit the semi. The pickup is on fire — I can see flames coming from under the hood. There are at least two people still inside the SUV. We need fire trucks out here immediately.",
    caller_id: "CALLER-2 (Witness)",
    coordinates: { lat: 30.3152, lng: -97.7098 },
    delay: 2000,
  },
  {
    transcript:
      "This is a trucker on I-35. The semi that jackknifed is carrying some kind of chemical tanks — there are hazmat placards on the trailer. I don't see any leaks yet but the trailer is damaged. The driver of the semi is out and walking around, he looks shaken up but okay.",
    caller_id: "CALLER-3 (Trucker)",
    coordinates: { lat: 30.3148, lng: -97.7103 },
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
      haashir_assist_enabled: false,
    }),
  });

  const data = await res.json();
  console.log(`   → Action: ${data.action} | Priority: ${data.priority} | Title: ${data.title}`);
  if (data.target_id) console.log(`   → Linked to: ${data.target_id}`);
  if (data.new_incident_id) console.log(`   → New ID: ${data.new_incident_id}`);
  if (data.conflicts_detected?.length > 0) {
    console.log(`   → ⚠️  Conflicts: ${data.conflicts_detected.length}`);
  }
  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("═".repeat(60));
  console.log("🚗 SEED: Multi-Vehicle Accident on I-35");
  console.log("═".repeat(60));

  for (const entry of transcripts) {
    if (entry.delay > 0) await sleep(entry.delay);
    await ingestTranscript(entry);
  }

  console.log("\n✅ Done — check http://localhost:3000");
}

main().catch(console.error);
