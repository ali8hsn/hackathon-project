// ─── Gemini Severity Scorer ──────────────────────────────────────────────
// Standalone scorer that maps an emergency call transcript to a 1-10
// severity score. Used purely as an additive signal on top of Claude's
// CREATE/UPDATE/priority decision in `sentinel-ai.ts`.

import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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

export interface SeverityScoreResult {
  score: number;
  reason: string;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function heuristicScore(input: {
  priority: "HIGH" | "MEDIUM" | "LOW";
  callerCount: number;
}): number {
  const base =
    input.priority === "HIGH" ? 9 : input.priority === "MEDIUM" ? 6 : 3;
  // Multi-caller corroboration nudges severity up modestly.
  const callerBump = Math.min(1, Math.max(0, input.callerCount - 1));
  return clampScore(base + callerBump);
}

export async function scoreSeverity(input: {
  transcript: string;
  title: string;
  type: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  callerCount: number;
}): Promise<SeverityScoreResult> {
  const fallback: SeverityScoreResult = {
    score: heuristicScore(input),
    reason: "Heuristic fallback (Gemini unavailable)",
  };

  if (!ai) return fallback;

  const userPrompt = `INCIDENT: ${input.title}
TYPE: ${input.type}
CLAUDE PRIORITY: ${input.priority}
CALLER COUNT: ${input.callerCount}

TRANSCRIPT:
"${input.transcript}"

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
    if (!text) return fallback;

    const parsed = JSON.parse(text) as { score?: unknown; reason?: unknown };
    const score = clampScore(Number(parsed.score));
    const reason =
      typeof parsed.reason === "string" && parsed.reason.length > 0
        ? parsed.reason
        : "AI severity assessment";

    return { score, reason };
  } catch {
    return fallback;
  }
}
