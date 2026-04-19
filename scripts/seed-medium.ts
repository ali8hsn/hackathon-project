/**
 * Seed: Medium-Priority Incidents (Multi-City)
 *
 * Replaces the Austin bar-fight set with fresh MEDIUM scenarios from
 * five different metros so /reports doesn't look duplicated. All rows
 * are tagged `is_demo:true`.
 *
 * Usage: bun run scripts/seed-medium.ts
 */

const API_BASE = "http://localhost:3000";

const scenarios = [
  // ─── 1. Bus shelter struck by SUV (Pittsburgh, 2 callers) ─────────────
  {
    callers: [
      {
        transcript:
          "An SUV just plowed through the bus shelter at Forbes and Atwood in Pittsburgh. The driver looks dazed but he's out of the car. There were two people waiting for the bus — one is sitting up holding her arm, the other is unconscious. Glass everywhere.",
        caller_id: "CALLER-1 (Witness)",
        coordinates: { lat: 40.4419, lng: -79.9525 },
      },
      {
        transcript:
          "I'm at the corner of Forbes and Atwood, Pittsburgh — there's a wreck at the bus stop. Looks like the SUV jumped the curb. Two pedestrians down. Traffic is backing up. The driver smells like alcohol from where I'm standing.",
        caller_id: "CALLER-2 (Cyclist)",
        coordinates: { lat: 40.4421, lng: -79.9523 },
      },
    ],
  },

  // ─── 2. Apartment kitchen fire (Atlanta, 2 callers) ───────────────────
  {
    callers: [
      {
        transcript:
          "There's a kitchen fire on the 4th floor of the Highland Walk apartments at 1100 N Highland in Atlanta. Smoke is coming out of unit 412. Alarms are going off building-wide and people are coming down the stairs. I don't think anyone's still on that floor but I'm not sure.",
        caller_id: "CALLER-1 (Resident)",
        coordinates: { lat: 33.7820, lng: -84.3520 },
      },
      {
        transcript:
          "I'm outside the Highland Walk apartments in Atlanta. There's smoke pouring out of a 4th-floor window and some flames just shot out. We're all evacuated to the parking lot. One of the tenants is asking about her cat but she got out.",
        caller_id: "CALLER-2 (Neighbor)",
        coordinates: { lat: 33.7822, lng: -84.3518 },
      },
    ],
  },

  // ─── 3. Stranded driver in flooded underpass (Nashville, 1 caller) ────
  {
    callers: [
      {
        transcript:
          "A car is stuck in the flooded underpass at Demonbreun and 16th in Nashville. Water's up to the door handles. The driver is still inside, she rolled the window down. She says her legs hurt and the water keeps rising. We can see her but we can't reach her.",
        caller_id: "CALLER (Driver)",
        coordinates: { lat: 36.1530, lng: -86.7895 },
      },
    ],
  },

  // ─── 4. Aggressive shoplifter — assault (Sacramento, 1 caller) ────────
  {
    callers: [
      {
        transcript:
          "Loss prevention at the Target on Arden Way in Sacramento. Male shoplifter, mid-30s, red Cardinals hat — he took about $400 of electronics. When our employee tried to stop him at the door he pulled a box cutter and slashed at her. She has a cut on her forearm. Suspect ran into the parking lot toward Arden Fair Mall.",
        caller_id: "CALLER (Loss prevention)",
        coordinates: { lat: 38.6004, lng: -121.3850 },
      },
    ],
  },

  // ─── 5. Construction crane swinging in wind (Minneapolis, 2 callers) ──
  {
    callers: [
      {
        transcript:
          "The construction crane on top of the new tower at Nicollet and Washington in Minneapolis is swinging really hard in this wind. The arm is swaying maybe 15 feet. There are still workers on the upper floors. We need someone to call the site foreman.",
        caller_id: "CALLER-1 (Office worker)",
        coordinates: { lat: 44.9794, lng: -93.2706 },
      },
      {
        transcript:
          "I'm watching from across the river — that crane on the new Minneapolis tower is way out of control with this windstorm. A piece of plywood just blew off and landed on the street. Pedestrians need to be moved back, this is going to hurt someone.",
        caller_id: "CALLER-2 (Bystander)",
        coordinates: { lat: 44.9798, lng: -93.2709 },
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
  console.log("⚡ SEED: Medium-Priority Incidents (Multi-City)");
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
