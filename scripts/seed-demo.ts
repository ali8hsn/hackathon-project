/**
 * Seed: Multi-Caller Mass Event — Subway Smoke (Boston Park St)
 *
 * Replaces the Becker Elementary "suspicious person" scenario with a
 * fresher mass-event situation: smoke pouring from a subway station,
 * 5 callers in 6 minutes. Each caller is independently MEDIUM, but the
 * trend-escalation analyzer should promote the cluster to HIGH.
 *
 * All rows tagged `is_demo:true` so the Reports → Live toggle hides them.
 *
 * Usage: bun run scripts/seed-demo.ts
 */

const API_BASE = "http://localhost:3000";

// Park Street MBTA station, Boston Common
const PARK_ST = { lat: 42.3564, lng: -71.0623 };

const transcripts = [
  {
    transcript:
      "I'm walking on Tremont Street in Boston and there's a lot of smoke coming up out of the Park Street T entrance. People are running up the stairs coughing. I can smell that burning electrical smell. I haven't seen any fire trucks yet.",
    caller_id: "CALLER-1 (Pedestrian)",
    coordinates: { lat: PARK_ST.lat + 0.0002, lng: PARK_ST.lng - 0.0001 },
    delay: 0,
  },
  {
    transcript:
      "I just got off the inbound Green Line train at Park Street and the platform is filling with smoke. The conductor is telling everyone to evacuate up the stairs. I helped an older man who was wheezing badly. We're all coming out onto the Common now.",
    caller_id: "CALLER-2 (Commuter)",
    coordinates: { lat: PARK_ST.lat, lng: PARK_ST.lng },
    delay: 2000,
  },
  {
    transcript:
      "Park Street station Boston — there's heavy smoke and someone fell on the stairs trying to evacuate, I think she hit her head pretty hard. There are at least four or five people coughing badly out here on the sidewalk. We need EMS, not just fire trucks.",
    caller_id: "CALLER-3 (Off-duty nurse)",
    coordinates: { lat: PARK_ST.lat - 0.0001, lng: PARK_ST.lng + 0.0002 },
    delay: 2000,
  },
  {
    transcript:
      "This is an MBTA station agent at Park Street, Boston. We've activated the platform fire alarms and pulled the third-rail emergency stop. The smoke is thickest on the Red Line lower platform. I think we still have passengers on a stalled train down there. We need fire department and EMS at every entrance.",
    caller_id: "CALLER-4 (MBTA staff)",
    coordinates: { lat: PARK_ST.lat, lng: PARK_ST.lng - 0.0001 },
    delay: 2000,
  },
  {
    transcript:
      "I'm a paramedic off-duty at Park Street station. We have at least eight people with smoke inhalation now sitting on the Common, two are unresponsive but breathing. The smoke is now visible from a block away on Tremont. This is a serious incident — we need a multi-unit EMS response and probably a hazmat team.",
    caller_id: "CALLER-5 (Off-duty paramedic)",
    coordinates: { lat: PARK_ST.lat + 0.0001, lng: PARK_ST.lng + 0.0001 },
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
      is_demo: true,
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
  console.log("🚇 SEED DEMO: Subway Smoke Mass Event (Boston Park St)");
  console.log("═".repeat(70));
  console.log("\nThis script sends 5 caller reports through the pipeline,");
  console.log("then triggers AI trend analysis to promote the cluster to HIGH.\n");

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
