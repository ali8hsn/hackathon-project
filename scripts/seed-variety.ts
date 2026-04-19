/**
 * Seed: Variety Pack — Low-Priority & Single-Report Incidents
 *
 * A mix of mundane, low-priority calls that a real 911 center gets.
 * Some have 1 report, some have 2. None should be HIGH priority.
 *
 * Usage: bun run scripts/seed-variety.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Noise complaint (1 caller) ──────────────────────────────────
  {
    callers: [
      {
        transcript:
          "Hi, my neighbor at 712 Guadalupe Street has been playing extremely loud music since about 10 PM. It's now midnight and I have to work in the morning. I've asked them to turn it down but they won't answer the door. It's a house party, there are a bunch of cars parked on the street.",
        caller_id: "CALLER (Neighbor)",
        coordinates: { lat: 30.2750, lng: -97.7460 },
      },
    ],
  },

  // ─── 2. Suspicious vehicle (2 callers) ─────────────────────────────
  {
    callers: [
      {
        transcript:
          "There's a van that's been parked on West 6th Street for three days now. It has out-of-state plates and the windows are all covered up with cardboard. I haven't seen anyone go in or out of it. It just seems odd.",
        caller_id: "CALLER-1 (Business owner)",
        coordinates: { lat: 30.2690, lng: -97.7510 },
      },
      {
        transcript:
          "I want to report an abandoned vehicle on West 6th. It's a white van with Arizona plates, been there since Monday. There's a weird smell coming from it — not like a dead animal, more like chemicals or something. I'm a little concerned.",
        caller_id: "CALLER-2 (Pedestrian)",
        coordinates: { lat: 30.2692, lng: -97.7508 },
      },
    ],
  },

  // ─── 3. Minor fender bender (1 caller) ─────────────────────────────
  {
    callers: [
      {
        transcript:
          "I just got into a minor fender bender at the intersection of Congress and Riverside. No one is hurt, both cars are drivable. We've pulled over to the side. The other driver and I are exchanging information. We just need a police report for insurance purposes.",
        caller_id: "CALLER (Driver)",
        coordinates: { lat: 30.2600, lng: -97.7440 },
      },
    ],
  },

  // ─── 4. Welfare check request (1 caller) ───────────────────────────
  {
    callers: [
      {
        transcript:
          "I'm calling about my elderly mother who lives alone at 2204 East Cesar Chavez. I haven't been able to reach her by phone since yesterday morning. She usually calls me every day. She has diabetes and sometimes has trouble with her blood sugar. Can you send someone to check on her?",
        caller_id: "CALLER (Daughter)",
        coordinates: { lat: 30.2555, lng: -97.7280 },
      },
    ],
  },

  // ─── 5. Graffiti / vandalism (1 caller) ────────────────────────────
  {
    callers: [
      {
        transcript:
          "Someone spray-painted a bunch of graffiti on the side of my restaurant overnight. It's the Tex-Mex place on South Lamar, near Barton Springs Road. They also smashed one of the front windows. Nobody was inside, we were closed. I noticed it when I came to open up this morning.",
        caller_id: "CALLER (Restaurant owner)",
        coordinates: { lat: 30.2610, lng: -97.7680 },
      },
    ],
  },

  // ─── 6. Loose dog reports (2 callers) ──────────────────────────────
  {
    callers: [
      {
        transcript:
          "There's a large dog running loose in Zilker Park near the soccer fields. It doesn't have a collar and it's been chasing joggers. It hasn't bitten anyone but it's getting pretty aggressive with people. Looks like a pit bull mix, brown and white.",
        caller_id: "CALLER-1 (Jogger)",
        coordinates: { lat: 30.2670, lng: -97.7720 },
      },
      {
        transcript:
          "I'm at Zilker Park and there's an aggressive stray dog near the playground area. My kids are scared. It growled at another child a few minutes ago. It's a brownish dog, medium to large. Can animal control come get it?",
        caller_id: "CALLER-2 (Parent)",
        coordinates: { lat: 30.2668, lng: -97.7718 },
      },
    ],
  },

  // ─── 7. Parking complaint (1 caller) ───────────────────────────────
  {
    callers: [
      {
        transcript:
          "Someone has parked their truck blocking my driveway at 1501 East 7th Street. I can't get my car out. It's a red Ford F-150, Texas plates. I've been waiting 20 minutes and no one has come back for it. I need to get to work.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 30.2640, lng: -97.7310 },
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
  console.log("📋 SEED: Variety Pack — Low-Priority Incidents");
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
  console.log("✅ VARIETY SEED COMPLETE");
  console.log("═".repeat(60));
  console.log("\nCheck: http://localhost:3000/");
}

main().catch(console.error);
