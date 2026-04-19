/**
 * Seed: Medium-Priority Incidents (Austin, TX)
 *
 * Scenarios that should classify as MEDIUM — situations needing prompt response
 * but without confirmed immediate threat to life.
 *
 * Usage: bun run scripts/seed-medium.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Bar fight / disturbance (2 callers) ────────────────────────
  {
    callers: [
      {
        transcript:
          "Yeah, there's a fight breaking out at the bar on Rainey Street in Austin. Two guys are going at it, throwing punches. A couple of tables got knocked over. No weapons that I can see but it's getting pretty heated. There's maybe 30 people watching.",
        caller_id: "CALLER-1 (Bartender)",
        coordinates: { lat: 30.2588, lng: -97.7390 },
      },
      {
        transcript:
          "I'm outside PJ's Sports Bar on Rainey Street and there's a big fight happening inside. Someone just got thrown through the front door. He's bleeding from his face. I think there are at least three or four guys involved now. It's escalating fast.",
        caller_id: "CALLER-2 (Passerby)",
        coordinates: { lat: 30.2590, lng: -97.7388 },
      },
    ],
  },

  // ─── 2. Non-injury car crash blocking intersection (2 callers) ─────
  {
    callers: [
      {
        transcript:
          "There's been a car accident at the intersection of Lamar Boulevard and Barton Springs Road in Austin. Two cars collided — looks like someone ran the red light. Nobody seems hurt but both cars are blocking the intersection and traffic is backed up in all directions. An airbag deployed in one of the vehicles.",
        caller_id: "CALLER-1 (Witness)",
        coordinates: { lat: 30.2620, lng: -97.7710 },
      },
      {
        transcript:
          "I'm stuck in traffic on Barton Springs Road near Lamar in Austin. There's a two-car crash blocking both lanes. Looks like the driver in the sedan might be a little shaken up but I see them standing outside. Traffic is not moving at all. We need someone to direct traffic or clear the scene.",
        caller_id: "CALLER-2 (Driver in traffic)",
        coordinates: { lat: 30.2622, lng: -97.7708 },
      },
    ],
  },

  // ─── 3. Shoplifting/theft in progress (1 caller) ───────────────────
  {
    callers: [
      {
        transcript:
          "I'm the loss prevention officer at the HEB on East 7th Street in Austin. We have a shoplifter who just left the store with about 200 dollars worth of merchandise. Male, mid-20s, wearing a red hoodie and jeans. He's heading east on foot toward Chicon Street. He was aggressive when confronted and pushed one of our employees. We didn't try to stop him.",
        caller_id: "CALLER (Loss prevention)",
        coordinates: { lat: 30.2630, lng: -97.7260 },
      },
    ],
  },

  // ─── 4. Domestic disturbance (1 caller) ────────────────────────────
  {
    callers: [
      {
        transcript:
          "I can hear my neighbors screaming at each other again. The apartment next to mine, unit 304 at the complex on East Riverside Drive near Pleasant Valley in Austin. I can hear things being thrown and broken. There's a woman yelling for help. This has happened before but tonight sounds worse than usual.",
        caller_id: "CALLER (Neighbor)",
        coordinates: { lat: 30.2395, lng: -97.7210 },
      },
    ],
  },

  // ─── 5. Minor water main break (2 callers) ────────────────────────
  {
    callers: [
      {
        transcript:
          "There's water gushing up from the street on South Lamar near Oltorf in Austin. It looks like a water main broke. The water is flooding onto the sidewalk and into the bike lane. It's not a huge amount but it's been going for at least 30 minutes and it's getting worse.",
        caller_id: "CALLER-1 (Cyclist)",
        coordinates: { lat: 30.2415, lng: -97.7650 },
      },
      {
        transcript:
          "I'm calling about the broken water pipe on South Lamar Boulevard. The water is now starting to flood into the street and creating a hazard for drivers. There's a big puddle forming and cars are swerving to avoid it. I almost hydroplaned through it.",
        caller_id: "CALLER-2 (Driver)",
        coordinates: { lat: 30.2418, lng: -97.7648 },
      },
    ],
  },
];

async function ingestTranscript(entry: { transcript: string; caller_id: string; coordinates: { lat: number; lng: number } }) {
  console.log(`   📞 ${entry.caller_id}`);
  console.log(`      "${entry.transcript.slice(0, 70)}..."`);

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
  console.log(`      → ${data.action} | Priority: ${data.priority} | ${data.title}`);
  if (data.target_id) console.log(`      → Linked to: ${data.target_id}`);
  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("═".repeat(60));
  console.log("⚡ SEED: Medium-Priority Incidents (Austin)");
  console.log("═".repeat(60));

  for (let s = 0; s < scenarios.length; s++) {
    const scenario = scenarios[s];
    console.log(`\n── Scenario ${s + 1}/${scenarios.length} (${scenario.callers.length} caller${scenario.callers.length > 1 ? "s" : ""}) ──`);

    for (const caller of scenario.callers) {
      await ingestTranscript(caller);
      await sleep(1500);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("✅ MEDIUM SEED COMPLETE");
  console.log("═".repeat(60));
}

main().catch(console.error);
