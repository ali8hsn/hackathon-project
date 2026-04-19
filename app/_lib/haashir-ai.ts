/**
 * Haashir AI — Claude (Anthropic) only. Replaces former Gemini usage.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\n?/i, "")
    .replace(/^```\n?/, "")
    .replace(/\n?```$/i, "")
    .trim();
}

async function claudeText(system: string, user: string, maxTokens = 4096): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content[0];
  if (block.type !== "text") return "";
  return block.text;
}

// ─── Embedding (not used — matching uses recent incidents + Claude) ──────────

export async function generateEmbedding(_text: string): Promise<number[]> {
  throw new Error("Embeddings are not used in the MongoDB + Claude pipeline.");
}

// ─── Twilio audio (no Claude audio STT in this stack) ────────────────────────

export async function transcribeAudio(_audioUrl: string): Promise<string> {
  throw new Error(
    "Phone recording transcription is not enabled in the Claude-only setup. Use /intake with browser speech, or add a dedicated STT provider."
  );
}

// ─── Classification ─────────────────────────────────────────────────────────

export interface MatchResult {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  location: string;
  description: string;
  similarity: number;
}

export interface AIDecision {
  action: "CREATE" | "UPDATE" | "FLAG_FOR_REVIEW";
  target_id: string | null;
  confidence_score: number;
  structured_summary: string;
  severity_level: string;
  title: string;
  type: string;
  location: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

const SYSTEM_PROMPT = `You are Haashir, an AI-powered 911 dispatch assistant. Analyze incoming emergency call transcripts and decide how to handle them.

You will receive:
1. A new call transcript
2. A list of existing incidents that may be related (with rough similarity scores)

Your task:
1. **Extract** structured information from the transcript: incident type, location, severity, key details.
2. **Compare** with existing matches. Is this transcript about the SAME root-cause event as any match?
3. **Decide** on an action:

RULES:
- If the best match clearly describes the same real-world event → ACTION: "UPDATE"
- If the best match is possibly the same event but uncertain → ACTION: "FLAG_FOR_REVIEW"
- If no match, or matches are clearly DIFFERENT events → ACTION: "CREATE"

Always respond with a JSON object matching this exact schema:
{
  "action": "CREATE" | "UPDATE" | "FLAG_FOR_REVIEW",
  "target_id": "<uuid of matched incident or null>",
  "confidence_score": <float 0.0-1.0>,
  "structured_summary": "<concise summary of what the caller reported>",
  "severity_level": "P1" | "P2" | "P3" | "P4",
  "title": "<structured title for the incident>",
  "type": "<incident type e.g. Structure Fire, Vehicle Collision, Medical Emergency>",
  "location": "<extracted location>",
  "priority": "HIGH" | "MEDIUM" | "LOW"
}

Important:
- P1 = life-threatening (fire with trapped persons, active shooter, cardiac arrest)
- P2 = urgent (vehicle collision with injuries, assault in progress)
- P3 = non-urgent (minor accident, noise complaint, non-injury collision)
- P4 = informational (suspicious activity, property damage only, strange odors)
- Be precise with locations. Extract street addresses when available.
- The structured_summary should be 1-2 sentences, factual, no speculation.

PRIORITY RULES (follow strictly):
- HIGH: ONLY for confirmed immediate threats to life — active fire with people inside, active shooter, serious medical emergency, major hazmat with exposure risk.
- MEDIUM: Situations that need prompt response but no confirmed life threat — vehicle collision with possible injuries, assault report, large disturbance.
- LOW: Anything observational, suspicious, or non-emergency — suspicious person/vehicle, strange odor without confirmed source, noise complaint, minor property damage, welfare check requests, parking violations.
- When in doubt, assign MEDIUM or LOW. Do NOT default to HIGH.`;

export async function classifyAndRoute(
  transcript: string,
  topMatches: MatchResult[]
): Promise<AIDecision> {
  const client = getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const matchContext =
    topMatches.length > 0
      ? `\n\nEXISTING INCIDENTS (candidate matches):\n${topMatches
          .map(
            (m, i) =>
              `${i + 1}. [ID: ${m.id}] [score: ${m.similarity.toFixed(3)}] ${m.title}\n   Location: ${m.location}\n   ${m.description}`
          )
          .join("\n\n")}`
      : "\n\nNo similar existing incidents in the recent window.";

  const userPrompt = `NEW CALL TRANSCRIPT:\n"${transcript}"${matchContext}\n\nAnalyze this transcript and provide your decision as JSON only.`;

  try {
    const text = stripJsonFence(await claudeText(SYSTEM_PROMPT, userPrompt, 2048));
    return JSON.parse(text) as AIDecision;
  } catch {
    return {
      action: "CREATE",
      target_id: null,
      confidence_score: 0.5,
      structured_summary: transcript.slice(0, 200),
      severity_level: "P3",
      title: "Unclassified Incident",
      type: "Unknown",
      location: "Unknown",
      priority: "MEDIUM",
    };
  }
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

export interface ConflictResult {
  field: string;
  callerA: { id: string; statement: string };
  callerB: { id: string; statement: string };
}

export async function detectConflicts(
  newTranscript: string,
  existingLogs: Array<{ time: string; speaker: string; text: string }>,
  callerId: string
): Promise<ConflictResult[]> {
  if (!getClient()) return [];
  if (existingLogs.length === 0) return [];

  const logsText = existingLogs.map((l) => `[${l.speaker}]: ${l.text}`).join("\n");

  const prompt = `Compare the NEW caller's statement with the EXISTING call transcripts for the same incident.
Identify any CONFLICTING facts — where the new caller disagrees with or contradicts previous callers on specific factual details.

EXISTING TRANSCRIPTS:
${logsText}

NEW CALLER (${callerId}):
"${newTranscript}"

Only flag genuine factual contradictions (e.g. different number of victims, different descriptions of suspects, different locations of the same event, different causes).
Do NOT flag minor wording differences, additional details, or different perspectives on the same fact.

Respond with a JSON array only. If no conflicts, return [].
Each conflict object:
{
  "field": "<what fact is conflicting, e.g. 'Number of vehicles', 'Fire origin', 'Suspect description'>",
  "callerA": { "id": "<speaker from existing logs>", "statement": "<their claim>" },
  "callerB": { "id": "${callerId}", "statement": "<new caller's conflicting claim>" }
}`;

  try {
    const text = stripJsonFence(
      await claudeText(
        "You are a factual contradiction detector for emergency dispatch. Only return genuine conflicts. Respond with JSON array only.",
        prompt,
        2048
      )
    );
    return JSON.parse(text) as ConflictResult[];
  } catch {
    return [];
  }
}

// ─── Trend escalation ───────────────────────────────────────────────────────

export interface TrendEscalation {
  should_escalate: boolean;
  new_priority: "HIGH" | "MEDIUM" | "LOW";
  new_severity: string;
  reason: string;
  pattern_summary: string;
  escalate_indices: number[];
}

export async function analyzeTrendEscalation(
  incidents: Array<{
    title: string;
    type: string;
    location: string;
    priority: string;
    description: string;
    caller_count: number;
  }>
): Promise<TrendEscalation> {
  if (!getClient()) {
    return {
      should_escalate: false,
      new_priority: "LOW",
      new_severity: "P4",
      reason: "AI not available",
      pattern_summary: "",
      escalate_indices: [],
    };
  }

  const incidentsList = incidents
    .map(
      (inc, i) =>
        `${i + 1}. [Index: ${i}] [${inc.priority}] ${inc.title} — ${inc.location}\n   ${inc.description} (${inc.caller_count} callers)`
    )
    .join("\n\n");

  const prompt = `You are reviewing ${incidents.length} active low or medium priority incidents. Determine if any SUBSET of them form a connected pattern that warrants escalation.

INCIDENTS:
${incidentsList}

IMPORTANT RULES:
- Do NOT escalate all incidents. Most incidents are UNRELATED and should stay at their current priority.
- Only escalate incidents that are clearly part of the SAME emerging pattern (same location area, same type of event, corroborating each other).
- You need at least 2-3 incidents about the SAME event/pattern with 3+ total callers to justify escalation.
- When in doubt, do NOT escalate.

Respond with JSON only:
{
  "should_escalate": true/false,
  "escalate_indices": [<0-based indices of ONLY the incidents that form the pattern — empty array if no escalation>],
  "new_priority": "HIGH" | "MEDIUM" | "LOW",
  "new_severity": "P1" | "P2" | "P3" | "P4",
  "reason": "<1-2 sentence explanation>",
  "pattern_summary": "<brief summary of the detected pattern, or empty if none>"
}`;

  try {
    const text = stripJsonFence(
      await claudeText(
        "You are a conservative emergency pattern detection AI. Most incidents are unrelated. Respond with JSON only.",
        prompt,
        2048
      )
    );
    const parsed = JSON.parse(text) as TrendEscalation;
    if (!Array.isArray(parsed.escalate_indices)) {
      parsed.escalate_indices = [];
    }
    return parsed;
  } catch {
    return {
      should_escalate: false,
      new_priority: "LOW",
      new_severity: "P4",
      reason: "Analysis failed",
      pattern_summary: "",
      escalate_indices: [],
    };
  }
}

// ─── Priority suggestion ──────────────────────────────────────────────────────

export interface PrioritySuggestion {
  recommended_priority: "HIGH" | "MEDIUM" | "LOW";
  severity_level: string;
  confidence: number;
  reasoning: string;
  auto_flag: boolean;
}

export async function suggestPriority(
  transcript: string,
  incidentTitle: string,
  incidentType: string
): Promise<PrioritySuggestion> {
  if (!getClient()) {
    return {
      recommended_priority: "MEDIUM",
      severity_level: "P3",
      confidence: 0.5,
      reasoning: "AI not available",
      auto_flag: false,
    };
  }

  const prompt = `Analyze this emergency call and suggest a priority level.

INCIDENT: ${incidentTitle}
TYPE: ${incidentType}
TRANSCRIPT: "${transcript}"

Determine:
1. Priority (HIGH, MEDIUM, LOW)  
2. Severity (P1-P4)
3. Whether this should be AUTO-FLAGGED for immediate human attention (only for life-threatening scenarios)
4. Your confidence in this assessment (0.0-1.0)

Respond with JSON only:
{
  "recommended_priority": "HIGH" | "MEDIUM" | "LOW",
  "severity_level": "P1" | "P2" | "P3" | "P4",
  "confidence": <float>,
  "reasoning": "<1-2 sentence explanation>",
  "auto_flag": true/false
}

auto_flag should ONLY be true for:
- Active fires with people trapped
- Active shooter / weapons
- Cardiac arrest / severe medical emergencies
- Any imminent threat to life`;

  try {
    const text = stripJsonFence(
      await claudeText(
        "You are a 911 triage AI. Be decisive. Respond with JSON only.",
        prompt,
        1024
      )
    );
    return JSON.parse(text) as PrioritySuggestion;
  } catch {
    return {
      recommended_priority: "MEDIUM",
      severity_level: "P3",
      confidence: 0.5,
      reasoning: "Analysis failed — defaulting to medium priority",
      auto_flag: false,
    };
  }
}

// ─── Report generation ────────────────────────────────────────────────────────

export async function generateReport(
  title: string,
  location: string,
  rawLogs: Array<{ time: string; speaker: string; text: string }>,
  aggregatedDetails: Record<string, unknown>[],
  conflicts: Record<string, unknown>[]
): Promise<string> {
  if (!getClient()) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const logText = rawLogs.map((l) => `[${l.time}] ${l.speaker}: ${l.text}`).join("\n");

  const prompt = `Generate a concise situation report for the following emergency incident.

INCIDENT: ${title}
LOCATION: ${location}

CALL TRANSCRIPTS:
${logText}

${aggregatedDetails.length > 0 ? `AGGREGATED DETAILS: ${JSON.stringify(aggregatedDetails)}` : ""}
${conflicts.length > 0 ? `CONFLICTS: ${JSON.stringify(conflicts)}` : ""}

Write the report using EXACTLY this markdown format:

## INCIDENT SUMMARY
<1-2 sentence factual overview>

## KEY FACTS
- <confirmed fact from transcripts>
- <confirmed fact from transcripts>

## NATURE OF EMERGENCY
<brief description of the emergency type and immediate hazards>

${conflicts.length > 0 ? "## CONFLICTING REPORTS\n- <discrepancies between callers>\n\n" : ""}\
## DISPATCH RECOMMENDATION
PRIORITY: <P1 | P2 | P3 | P4>
ADDRESS: <single line — full street address or best-known location>

### IMMEDIATE DISPATCH
- <verb-led action: max 12 words, e.g. "Dispatch 2 engines + 1 ladder to 412 Oak St">
- <verb-led action>
- <verb-led action>

### BYSTANDER INSTRUCTIONS
- <verb-led caller guidance: max 12 words, e.g. "Tell caller to evacuate east side, stay on line">
- <verb-led caller guidance>

### RESPONDER PREPARATION
- <verb-led prep note: max 12 words, e.g. "Stage EMS one block south, brief on hazmat exposure">
- <verb-led prep note>

Rules: Use only the section headers above. PRIORITY and ADDRESS lines are required. Each section needs 2-4 bullets that start with a verb (Dispatch, Stage, Notify, Instruct, Establish, Confirm, Brief). Max 12 words per bullet. No prose paragraphs anywhere in DISPATCH RECOMMENDATION. No speculation. Facts only.`;

  const text = await claudeText(
    "You are an emergency dispatch AI assistant. Write clear, factual, actionable reports. " +
      "Output ONLY the requested markdown sections in the EXACT order requested. " +
      "Inside DISPATCH RECOMMENDATION you MUST emit the literal lines `PRIORITY:` and `ADDRESS:` " +
      "followed by the three `### IMMEDIATE DISPATCH`, `### BYSTANDER INSTRUCTIONS`, " +
      "`### RESPONDER PREPARATION` sub-headings, each with bullet lines starting with `- `. " +
      "NEVER collapse the dispatch recommendation into a prose paragraph. " +
      "Each bullet starts with a verb and is at most 12 words.",
    prompt,
    4096
  );
  return text || "Report generation failed.";
}
