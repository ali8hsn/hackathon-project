/**
 * Seed: Variety Pack — Mixed-Severity Calls (Multi-City)
 *
 * Replaces the Austin-heavy "noise complaint / loose dog" set. We seed a
 * mix of mid-and-low priority calls across five different cities so the
 * map and reports table feel like a real national feed instead of a
 * single neighbourhood demo. Every row is tagged `is_demo:true` so the
 * Reports → Live toggle can hide them.
 *
 * Usage: bun run scripts/seed-variety.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Subway smoke (Boston Park St, 3 callers) ──────────────────────
  {
    callers: [
      {
        transcript:
          "There's heavy smoke pouring out of the Park Street subway station in Boston. People are running up the stairs coughing. I can see the smoke from across the Common. No flames visible from outside but the platform must be filling up.",
        caller_id: "CALLER-1 (Tourist)",
        coordinates: { lat: 42.3564, lng: -71.0623 },
      },
      {
        transcript:
          "I'm on the inbound Green Line platform at Park Street and there's smoke coming out of the tunnel. The conductor told everyone to evacuate. An older woman tripped on the stairs, I think she hit her head. We're all heading up to the street now.",
        caller_id: "CALLER-2 (Commuter)",
        coordinates: { lat: 42.3563, lng: -71.0625 },
      },
      {
        transcript:
          "Park Street station, Boston — there's smoke and that burning electrical smell coming up from the platforms. MBTA staff are pulling fire alarms but I don't see any first responders yet. There's a guy on the stairs who can't catch his breath.",
        caller_id: "CALLER-3 (MBTA staff)",
        coordinates: { lat: 42.3565, lng: -71.0622 },
      },
    ],
  },

  // ─── 2. Rooftop fall (Denver, 1 caller) ────────────────────────────────
  {
    callers: [
      {
        transcript:
          "A construction worker just fell from the scaffolding on the new building at 16th and Wynkoop in Denver — the LoDo project. He fell maybe two stories onto the sidewalk. He's conscious but he's not moving his legs. We've got someone holding his head still. We need an ambulance fast.",
        caller_id: "CALLER (Site foreman)",
        coordinates: { lat: 39.7531, lng: -105.0007 },
      },
    ],
  },

  // ─── 3. EV battery fire (Seattle pier, 2 callers) ──────────────────────
  {
    callers: [
      {
        transcript:
          "An electric SUV in the Pier 55 parking lot in Seattle is on fire — I think it's the battery. Flames coming out from under the car, lots of white smoke, and there's this hissing sound. People are backing away. The car next to it is starting to smoke too.",
        caller_id: "CALLER-1 (Tourist)",
        coordinates: { lat: 47.6062, lng: -122.3411 },
      },
      {
        transcript:
          "I'm on the waterfront in Seattle near Pier 55 and a Tesla is fully on fire. The driver got out, he's okay. The flames keep flaring back up even though someone tried a fire extinguisher. The smoke is really nasty, like chemicals.",
        caller_id: "CALLER-2 (Pedestrian)",
        coordinates: { lat: 47.6064, lng: -122.3413 },
      },
    ],
  },

  // ─── 4. Drone vs power line (Phoenix, 1 caller) ────────────────────────
  {
    callers: [
      {
        transcript:
          "A big drone — looks commercial, four propellers — just hit a power line over Camelback Road near 24th Street in Phoenix. It's tangled in the wires and there are sparks. A small fire started on the pole. Power just went out on this whole block.",
        caller_id: "CALLER (Resident)",
        coordinates: { lat: 33.5093, lng: -112.0303 },
      },
    ],
  },

  // ─── 5. Restaurant brawl (Chicago, 2 callers) ──────────────────────────
  {
    callers: [
      {
        transcript:
          "There's a huge fight inside the steakhouse at Wabash and Hubbard in Chicago. Like ten guys, chairs being thrown, broken glass everywhere. One person is bleeding badly from the head. Staff is yelling for everyone to leave.",
        caller_id: "CALLER-1 (Diner)",
        coordinates: { lat: 41.8898, lng: -87.6262 },
      },
      {
        transcript:
          "I just ran out of the steakhouse on Wabash in Chicago — there's a brawl inside, somebody pulled a knife. I think one guy was stabbed in the arm. The fight spilled onto the sidewalk now. I'm watching from across the street.",
        caller_id: "CALLER-2 (Witness)",
        coordinates: { lat: 41.8896, lng: -87.6260 },
      },
    ],
  },

  // ─── 6. Apartment carbon monoxide (Brooklyn, 1 caller) ─────────────────
  {
    callers: [
      {
        transcript:
          "My carbon monoxide detector at 412 Sterling Place, Brooklyn just started screaming. Two of my kids feel really dizzy and have headaches. We're getting out now but the older couple downstairs aren't answering their door. The whole hallway smells weird.",
        caller_id: "CALLER (Tenant)",
        coordinates: { lat: 40.6735, lng: -73.9605 },
      },
    ],
  },

  // ─── 7. Hit-and-run cyclist (Houston, 1 caller) ────────────────────────
  {
    callers: [
      {
        transcript:
          "A cyclist just got hit by a black pickup truck on Westheimer near Montrose in Houston. The truck didn't stop — it sped off east. The cyclist is on the ground, conscious but his leg looks broken and there's blood on the road. People are with him but we need EMS now.",
        caller_id: "CALLER (Driver)",
        coordinates: { lat: 29.7440, lng: -95.3905 },
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
  console.log("📋 SEED: Variety Pack — Multi-City Mixed Severity");
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
