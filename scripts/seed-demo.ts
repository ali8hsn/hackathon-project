/**
 * Seed script: Suspicious Person Near Elementary School (Austin, TX)
 *
 * Simulates 5 low-priority reports over a few hours about a mysterious person
 * near Becker Elementary. Each report is slightly different — different callers,
 * different details — but all LOW priority individually.
 *
 * After seeding, calls the escalation endpoint so the AI can detect the pattern
 * and promote the cluster to HIGH priority.
 *
 * Usage:
 *   bun run scripts/seed-demo.ts
 *
 * Requires the dev server to be running (bun dev).
 */

const API_BASE = "http://localhost:3000";

// Becker Elementary — Northland Drive, Austin, TX
const SCHOOL_COORDS = { lat: 30.3485, lng: -97.7190 };

const transcripts = [
  {
    transcript:
      "Hi, I just wanted to report something. There's a man sitting in a dark sedan parked across from Becker Elementary on Northland Drive here in Austin. He's been there for about 30 minutes just sitting in his car. He's not picking up any kids or anything, just watching. I walk my dog past there every morning and I've never seen him before. It's probably nothing but it made me a little uneasy.",
    caller_id: "CALLER-1 (Dog walker)",
    coordinates: { lat: SCHOOL_COORDS.lat + 0.0003, lng: SCHOOL_COORDS.lng - 0.0002 },
    delay: 0,
  },
  {
    transcript:
      "Yeah, I'm a crossing guard at Becker Elementary on Northland Drive in Austin. I noticed a dark colored car, maybe a Honda or Toyota, parked on the street near the playground. There's a man inside wearing sunglasses and a baseball cap. He was there when I started my shift at 7:45 and he's still there now. He hasn't gotten out of the car. Just wanted someone to know about it.",
    caller_id: "CALLER-2 (Crossing guard)",
    coordinates: { lat: SCHOOL_COORDS.lat + 0.0001, lng: SCHOOL_COORDS.lng + 0.0001 },
    delay: 2000,
  },
  {
    transcript:
      "I'm calling because my daughter told me there was a strange man talking to some kids through the fence at Becker Elementary during recess today. She said he was asking them questions about when school lets out and if they walk home. I'm really concerned. She said he was wearing a dark hat and was near a black car on Northland Drive.",
    caller_id: "CALLER-3 (Parent)",
    coordinates: { lat: SCHOOL_COORDS.lat - 0.0002, lng: SCHOOL_COORDS.lng + 0.0003 },
    delay: 2000,
  },
  {
    transcript:
      "This is the assistant principal at Becker Elementary in Austin. One of our teachers reported that a man approached the east fence during afternoon recess and appeared to be photographing children on the playground. When the teacher walked toward him, he quickly went back to a dark sedan parked on Northland Drive and drove away. He came back about 20 minutes later and parked in the same spot. We've kept the kids inside since then.",
    caller_id: "CALLER-4 (Asst. Principal)",
    coordinates: { lat: SCHOOL_COORDS.lat, lng: SCHOOL_COORDS.lng },
    delay: 2000,
  },
  {
    transcript:
      "I live on Northland Drive right across from Becker Elementary in Austin. That dark car is back again — same one from this morning. This is the third time today I've seen it. The man got out this time and was walking along the school fence taking pictures with his phone. When he saw me watching from my window he got back in the car fast. I got a partial plate — it starts with 7-K-J. This is really scaring the neighborhood. Several of us have been texting about it all day.",
    caller_id: "CALLER-5 (Neighbor)",
    coordinates: { lat: SCHOOL_COORDS.lat + 0.0002, lng: SCHOOL_COORDS.lng - 0.0001 },
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
      sentinel_assist_enabled: false,
    }),
  });

  const data = await res.json();
  console.log(`   → Action: ${data.action} | Priority: ${data.priority} | Title: ${data.title}`);
  if (data.target_id) console.log(`   → Linked to: ${data.target_id}`);
  if (data.new_incident_id) console.log(`   → New ID: ${data.new_incident_id}`);
  if (data.conflicts_detected?.length > 0) {
    console.log(`   → ⚠️  Conflicts detected: ${data.conflicts_detected.length}`);
  }
  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("═".repeat(70));
  console.log("🏫 SEED DEMO: Suspicious Person Near Becker Elementary (Austin)");
  console.log("═".repeat(70));
  console.log("\nThis script sends 5 low-priority reports through the pipeline,");
  console.log("then triggers AI trend analysis to detect the escalating pattern.\n");

  // Phase 1: Ingest all transcripts
  console.log("─".repeat(70));
  console.log("PHASE 1: Ingesting 5 caller reports...");
  console.log("─".repeat(70));

  const results = [];
  for (const entry of transcripts) {
    if (entry.delay > 0) await sleep(entry.delay);
    const result = await ingestTranscript(entry);
    results.push(result);
  }

  console.log("\n" + "─".repeat(70));
  console.log("PHASE 1 COMPLETE");
  console.log("─".repeat(70));

  const created = results.filter((r) => r.action === "CREATE").length;
  const updated = results.filter((r) => r.action === "UPDATE").length;
  const flagged = results.filter((r) => r.action === "FLAG_FOR_REVIEW").length;
  console.log(`   Created: ${created} | Updated: ${updated} | Flagged: ${flagged}`);

  // Phase 2: Run trend escalation analysis
  console.log("\n" + "─".repeat(70));
  console.log("PHASE 2: Running AI Trend Escalation Analysis...");
  console.log("─".repeat(70));

  await sleep(1000);

  const escalateRes = await fetch(`${API_BASE}/api/incidents/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const escalation = await escalateRes.json();
  console.log(`\n   Should escalate: ${escalation.should_escalate ? "✅ YES" : "❌ No"}`);
  console.log(`   New priority: ${escalation.new_priority || "N/A"}`);
  console.log(`   Reason: ${escalation.reason}`);
  console.log(`   Pattern: ${escalation.pattern_summary}`);
  console.log(`   Incidents analyzed: ${escalation.incidents_analyzed || 0}`);

  console.log("\n" + "═".repeat(70));
  console.log("✅ SEED COMPLETE");
  console.log("═".repeat(70));
  console.log("\nCheck the following pages:");
  console.log("  → Monitor:         http://localhost:3000/");
  console.log("  → Trend Detection: http://localhost:3000/trend-detection");
  console.log("  → Click any incident to see the Situation Sheet with map + transcripts");
}

main().catch(console.error);
