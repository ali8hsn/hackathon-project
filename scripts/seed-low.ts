/**
 * Seed: Extra Low-Priority Incidents (Multi-City)
 *
 * Mundane, observational-only calls — single callers, no urgency. Fresh
 * mix from cities other than Austin so the table doesn't feel duplicated.
 * All rows tagged `is_demo:true`.
 *
 * Usage: bun run scripts/seed-low.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Mailbox vandalism (Portland) ──────────────────────────────────
  {
    callers: [
      {
        transcript:
          "Someone smashed our community mailboxes on SE 38th Ave near Hawthorne in Portland overnight. Mail is scattered all over the sidewalk and some envelopes look like they've been opened. The neighbors and I are going to start picking it up but USPS will probably want to know too.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 45.5128, lng: -122.6235 },
      },
    ],
  },

  // ─── 2. Stop sign knocked down (Salt Lake City) ───────────────────────
  {
    callers: [
      {
        transcript:
          "The stop sign at the corner of 700 East and 400 South in Salt Lake City has been completely knocked over. Probably hit by a car. It's lying in the gutter. Drivers are blowing through the intersection because they don't realize it's supposed to be a four-way stop.",
        caller_id: "CALLER (Pedestrian)",
        coordinates: { lat: 40.7615, lng: -111.8741 },
      },
    ],
  },

  // ─── 3. Loud generator (New Orleans) ──────────────────────────────────
  {
    callers: [
      {
        transcript:
          "There's a construction generator running on Magazine Street near Napoleon in New Orleans. It's been on since 6 AM, it's now after 10 PM. The contractor said they'd shut it down at 7 but they didn't. Half the block can hear it through closed windows.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 29.9215, lng: -90.0950 },
      },
    ],
  },

  // ─── 4. Lost child reunited (San Diego) ───────────────────────────────
  {
    callers: [
      {
        transcript:
          "I'm at Mission Beach in San Diego near the boardwalk. A little girl, maybe 5 or 6, is here without her parents. She's calm but she's been with me for about 15 minutes and we can't find her family. She says her name is Maya and her mom was wearing a yellow sundress.",
        caller_id: "CALLER (Lifeguard)",
        coordinates: { lat: 32.7672, lng: -117.2549 },
      },
    ],
  },

  // ─── 5. Overflowing dumpster (Cleveland) ──────────────────────────────
  {
    callers: [
      {
        transcript:
          "The commercial dumpster behind the strip mall on Detroit Avenue near W 117th in Cleveland is overflowing. Trash bags piled six feet high, raccoons and rats are getting into it. It hasn't been picked up in over two weeks. The smell is unbearable.",
        caller_id: "CALLER (Business owner)",
        coordinates: { lat: 41.4845, lng: -81.7621 },
      },
    ],
  },

  // ─── 6. Abandoned shopping carts in road (Tampa) ──────────────────────
  {
    callers: [
      {
        transcript:
          "Someone left about a dozen Publix shopping carts in the middle of Bayshore Boulevard in Tampa, near Bay to Bay. Cars are swerving around them. Nobody is here, looks like they were just dumped. They're going to cause a wreck.",
        caller_id: "CALLER (Driver)",
        coordinates: { lat: 27.9159, lng: -82.4905 },
      },
    ],
  },

  // ─── 7. Found dog (Kansas City) ───────────────────────────────────────
  {
    callers: [
      {
        transcript:
          "I found a small terrier wandering along Ward Parkway near 55th in Kansas City. He has a collar but no tags. Friendly but really scared. I have him at my house — I can't keep him but I want someone to scan for a chip and reunite him with his owner.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 39.0246, lng: -94.5950 },
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
      haashir_assist_enabled: false,
      is_demo: true,
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
  console.log("📋 SEED: Extra Low-Priority Incidents (Multi-City)");
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
