/**
 * Seed: Extra Low-Priority Incidents (Austin, TX)
 *
 * More mundane, observational-only calls. Single callers, no urgency.
 * These should always classify as LOW.
 *
 * Usage: bun run scripts/seed-low.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Illegal dumping ────────────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "Someone dumped a bunch of old furniture and mattresses on the side of the road near the bridge on East Riverside Drive in Austin. It's been there for a few days now and nobody's cleaned it up. It's starting to look really trashy. There are also some bags of garbage.",
        caller_id: "CALLER (Jogger)",
        coordinates: { lat: 30.2408, lng: -97.7270 },
      },
    ],
  },

  // ─── 2. Broken traffic signal ─────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "The traffic light at the intersection of Manor Road and Airport Boulevard in Austin is stuck on flashing red in all directions. It's been like this for at least two hours. Cars are treating it as a four-way stop but I almost saw a couple of close calls. Can you get someone from the city to look at it?",
        caller_id: "CALLER (Commuter)",
        coordinates: { lat: 30.2858, lng: -97.7115 },
      },
    ],
  },

  // ─── 3. Homeless encampment concern ───────────────────────────────
  {
    callers: [
      {
        transcript:
          "I want to report a growing homeless encampment under the bridge on North Lamar near 51st Street in Austin. There are about ten tents now and it's blocking part of the sidewalk. I've seen open fires there at night which worries me. I'm not asking for enforcement, just maybe some outreach services or fire safety check.",
        caller_id: "CALLER (Neighbor)",
        coordinates: { lat: 30.3100, lng: -97.7440 },
      },
    ],
  },

  // ─── 4. Found property ───────────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "I found a wallet in the parking lot of the Whole Foods on North Lamar in Austin. It has a driver's license, credit cards, and about 40 dollars cash in it. The name on the license is James R. Thompson. I tried calling the number on a business card inside but no answer. I have it with me at the store right now.",
        caller_id: "CALLER (Shopper)",
        coordinates: { lat: 30.3070, lng: -97.7475 },
      },
    ],
  },

  // ─── 5. Fireworks complaint ────────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "People are shooting off fireworks in the park on East Cesar Chavez near the bridge in Austin. It's 11 PM on a weekday and it's been going on for about 45 minutes. My dogs are freaking out. I know the Fourth of July is next week but this is ridiculous. Kids in the neighborhood are trying to sleep.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 30.2535, lng: -97.7330 },
      },
    ],
  },

  // ─── 6. Pothole hazard ────────────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "There's a massive pothole on South Congress Avenue right around the 1100 block in Austin. It's in the right lane and it's deep enough that I saw a car bottom out going through it. Someone's going to blow a tire or damage their car. It needs to be fixed or at least coned off.",
        caller_id: "CALLER (Driver)",
        coordinates: { lat: 30.2508, lng: -97.7468 },
      },
    ],
  },

  // ─── 7. Trespasser in vacant building ─────────────────────────────
  {
    callers: [
      {
        transcript:
          "I manage a commercial property on East 5th Street near I-35 in Austin. Someone has broken into the vacant unit on the ground floor again. I can see a light on inside through the boarded window. This is the third time this month. Nobody should be in there — the building doesn't have power.",
        caller_id: "CALLER (Property manager)",
        coordinates: { lat: 30.2640, lng: -97.7350 },
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
  console.log("📋 SEED: Extra Low-Priority Incidents (Austin)");
  console.log("═".repeat(60));

  for (let s = 0; s < scenarios.length; s++) {
    const scenario = scenarios[s];
    console.log(`\n── Scenario ${s + 1}/${scenarios.length} ──`);

    for (const caller of scenario.callers) {
      await ingestTranscript(caller);
      await sleep(1200);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("✅ LOW SEED COMPLETE");
  console.log("═".repeat(60));
}

main().catch(console.error);
