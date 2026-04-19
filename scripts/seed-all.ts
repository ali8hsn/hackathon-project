/**
 * Seed All: Runs all scenario seeds to populate the database with demo data.
 *
 * Usage: bun run scripts/seed-all.ts
 */

import { execSync } from "child_process";

const seeds = [
  { name: "Suspicious Person at School", file: "scripts/seed-demo.ts" },
  { name: "Highway Multi-Vehicle Accident", file: "scripts/seed-highway-accident.ts" },
  { name: "Neighborhood Gas Leak", file: "scripts/seed-gas-leak.ts" },
  { name: "Active Shooter (Sentinel Assist)", file: "scripts/seed-shooting.ts" },
  { name: "Variety Pack (Low-Priority)", file: "scripts/seed-variety.ts" },
  { name: "Medium-Priority Incidents", file: "scripts/seed-medium.ts" },
  { name: "Extra Low-Priority Incidents", file: "scripts/seed-low.ts" },
];

async function main() {
  console.log("═".repeat(60));
  console.log("🌱 SEEDING ALL SCENARIOS");
  console.log("═".repeat(60));

  for (const seed of seeds) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`▶ Running: ${seed.name}`);
    console.log(`${"─".repeat(60)}`);
    try {
      execSync(`bun run ${seed.file}`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      console.error(`⚠ Failed to run ${seed.file}`);
    }
    // Small delay between scenarios
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("✅ ALL SEEDS COMPLETE");
  console.log("═".repeat(60));
  console.log("\nPages to check:");
  console.log("  → Monitor:         http://localhost:3000/");
  console.log("  → Trend Detection: http://localhost:3000/trend-detection");
  console.log("  → Sentinel Assist: http://localhost:3000/sentinel-assist");
}

main().catch(console.error);
