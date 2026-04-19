/**
 * Seed: Neighborhood Gas Leak Reports
 *
 * Simulates multiple LOW-priority odor/gas reports spread across a neighborhood.
 * These are individually minor but collectively indicate a potential gas main break.
 * Designed to be escalated by the AI trend analysis.
 *
 * Usage: bun run scripts/seed-gas-leak.ts
 */

const API_BASE = "http://localhost:3000";

// Centered around South Austin — East Oltorf / South 1st area
const CENTER = { lat: 30.2380, lng: -97.7600 };

const transcripts = [
  {
    transcript:
      "Hi, I just wanted to report a strange smell outside my house on East Oltorf Street here in Austin. It smells like rotten eggs. I'm not sure if it's a gas leak or what but it's been going on for about 20 minutes. It's not super strong but it's definitely noticeable.",
    caller_id: "CALLER-1 (Homeowner)",
    coordinates: { lat: CENTER.lat + 0.001, lng: CENTER.lng },
    delay: 0,
  },
  {
    transcript:
      "Yeah, I'm smelling something weird on my street — South 1st Street near the intersection with Oltorf in South Austin. Kind of a sulfur smell. My neighbor said she smells it too. We don't have gas stoves or anything so we're not sure where it's coming from.",
    caller_id: "CALLER-2 (Resident)",
    coordinates: { lat: CENTER.lat, lng: CENTER.lng + 0.001 },
    delay: 2000,
  },
  {
    transcript:
      "I'm a mail carrier on my route and I've been noticing a really strong gas smell for the last few blocks around East Oltorf and South 1st Street area in Austin. It seems to be getting stronger as I walk south. I can hear a hissing sound near the corner of Oltorf and South Congress.",
    caller_id: "CALLER-3 (Mail carrier)",
    coordinates: { lat: CENTER.lat - 0.0005, lng: CENTER.lng - 0.0005 },
    delay: 2000,
  },
  {
    transcript:
      "I work at the daycare center on South Congress Avenue in Austin and we can smell gas inside the building now. We've moved all the children outside as a precaution. The smell is very strong near the south side of our building. Can you please send someone? We have 30 kids here.",
    caller_id: "CALLER-4 (Daycare worker)",
    coordinates: { lat: CENTER.lat - 0.001, lng: CENTER.lng - 0.001 },
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
  console.log("💨 SEED: Neighborhood Gas Leak Reports");
  console.log("═".repeat(60));

  for (const entry of transcripts) {
    if (entry.delay > 0) await sleep(entry.delay);
    await ingestTranscript(entry);
  }

  console.log("\n" + "─".repeat(60));
  console.log("Running AI Trend Escalation...");
  console.log("─".repeat(60));

  await sleep(1000);

  const res = await fetch(`${API_BASE}/api/incidents/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const result = await res.json();
  console.log(`\n   Escalate: ${result.should_escalate ? "✅ YES" : "❌ No"}`);
  console.log(`   Reason: ${result.reason}`);
  console.log(`   Incidents analyzed: ${result.incidents_analyzed || 0}`);

  console.log("\n✅ Done — check http://localhost:3000/trend-detection");
}

main().catch(console.error);
