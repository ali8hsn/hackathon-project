#!/usr/bin/env node
/**
 * backfill-severity.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * One-shot script that walks every active incident in MongoDB, asks Gemini
 * for a 1-10 severity score using the same prompt as
 * app/_lib/gemini-severity.ts, and writes `severity_score` back onto the
 * document.
 *
 * Skips incidents that already have a `severity_score`.
 *
 * Requirements:
 *   - Env: MONGODB_URI, MONGODB_DB_NAME (optional, defaults to "sentinel"),
 *          GEMINI_API_KEY
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-severity.mjs
 *   # or with explicit env:
 *   MONGODB_URI=... GEMINI_API_KEY=... node scripts/backfill-severity.mjs
 */

import { MongoClient } from "mongodb";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT = `You are a 911 dispatch severity scorer. Given a single emergency call transcript and lightweight context, return a numeric severity score on a 1-10 scale.

Anchor points:
- 1: informational (suspicious smell, parking complaint, lost item)
- 2-3: non-urgent (minor property damage, noise complaint, welfare check)
- 4-5: urgent property issue, no confirmed injury (fender bender, small fire, alarm)
- 6-7: urgent with possible injury (collision with injuries, assault, person down)
- 8: confirmed serious injury or imminent threat to one life (cardiac arrest, structure fire with one person inside, weapon brandished)
- 9: active threat to multiple lives (active shooter, structure fire with multiple trapped, mass collision)
- 10: imminent multi-victim catastrophe (hazmat with crowd exposure, building collapse, mass casualty event)

Be calibrated — most calls are 3-6. Reserve 9-10 for clearly catastrophic situations.

Respond with JSON only:
{
  "score": <integer 1-10>,
  "reason": "<one short sentence>"
}`;

function clampScore(n) {
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function heuristicScore(priority, callerCount) {
  const base = priority === "HIGH" ? 9 : priority === "MEDIUM" ? 6 : 3;
  const callerBump = Math.min(1, Math.max(0, (callerCount || 1) - 1));
  return clampScore(base + callerBump);
}

async function scoreOne(ai, incident) {
  const priority = incident.priority || "LOW";
  const callerCount = incident.caller_count || 1;
  const fallback = heuristicScore(priority, callerCount);

  const logs = Array.isArray(incident.raw_logs) ? incident.raw_logs : [];
  const transcript = logs
    .map((l) => (typeof l?.text === "string" ? l.text : ""))
    .filter(Boolean)
    .join("\n");

  if (!ai || !transcript) return { score: fallback, reason: "fallback" };

  const userPrompt = `INCIDENT: ${incident.title || "Untitled"}
TYPE: ${incident.type || "Unknown"}
CLAUDE PRIORITY: ${priority}
CALLER COUNT: ${callerCount}

TRANSCRIPT:
"${transcript}"

Score the severity 1-10 and respond with JSON only.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });
    const text = (response.text ?? "").trim();
    if (!text) return { score: fallback, reason: "empty" };
    const parsed = JSON.parse(text);
    return {
      score: clampScore(Number(parsed.score)),
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch (err) {
    return { score: fallback, reason: `error: ${err?.message || err}` };
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ERROR: MONGODB_URI not set");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB_NAME || "sentinel";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARN: GEMINI_API_KEY not set — falling back to heuristic for all rows.");
  }
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  const client = await MongoClient.connect(uri);
  try {
    const col = client.db(dbName).collection("incidents");
    const cursor = col.find({
      status: { $in: ["active", "pending_triage"] },
    });
    const docs = await cursor.toArray();
    console.log(`Found ${docs.length} active/pending incident(s).`);

    let updated = 0;
    let skipped = 0;
    for (const doc of docs) {
      if (typeof doc.severity_score === "number" && doc.severity_score > 0) {
        skipped++;
        continue;
      }
      const result = await scoreOne(ai, doc);
      await col.updateOne(
        { _id: doc._id },
        { $set: { severity_score: result.score, updated_at: new Date() } }
      );
      updated++;
      console.log(
        `  [${result.score}/10] ${doc.title || doc._id} — ${result.reason}`
      );
    }
    console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
