import {
  findIncidentById,
  findRecentForMatching,
  insertIncident,
  updateIncident,
} from "./incidents-repo";
import { buildMatchResults } from "./match-utils";
import {
  classifyAndRoute,
  detectConflicts,
  generateReport,
  suggestPriority,
  type MatchResult,
} from "./sentinel-ai";
import { scoreSeverity } from "./gemini-severity";

function getIconForType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("fire")) return "local_fire_department";
  if (t.includes("crash") || t.includes("collision") || t.includes("accident") || t.includes("vehicle"))
    return "minor_crash";
  if (t.includes("medical") || t.includes("cardiac") || t.includes("injury"))
    return "medical_services";
  if (t.includes("shoot") || t.includes("gun") || t.includes("weapon"))
    return "warning";
  return "emergency";
}

export async function ingestTranscript(body: {
  transcript: string;
  caller_id?: string;
  location_hint?: string;
  coordinates?: { lat: number; lng: number };
  sentinel_assist_enabled?: boolean;
  extraLogFields?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { transcript, caller_id, coordinates, sentinel_assist_enabled, extraLogFields } = body;

  const recent = await findRecentForMatching(25);
  const topMatches: MatchResult[] = buildMatchResults(transcript, recent, 5);

  const decision = await classifyAndRoute(transcript, topMatches);

  const timestamp = new Date().toISOString();
  const callerId = caller_id || "CALLER";
  const logEntry = {
    time: new Date().toLocaleTimeString("en-US", { hour12: false }),
    speaker: callerId,
    text: transcript,
    ...extraLogFields,
  };

  if (
    (decision.action === "UPDATE" || decision.action === "FLAG_FOR_REVIEW") &&
    decision.target_id
  ) {
    const existing = await findIncidentById(decision.target_id);
    if (existing) {
      const currentLogs =
        (existing.raw_logs as Array<{ time: string; speaker: string; text: string }>) ?? [];
      const currentCallerCount = existing.caller_count ?? 0;
      const currentConflicts = (existing.conflicts as Record<string, unknown>[]) ?? [];

      const newConflicts = await detectConflicts(transcript, currentLogs, callerId);
      const mergedConflicts = [...currentConflicts, ...newConflicts];

      const enrichedLogEntry =
        decision.action === "FLAG_FOR_REVIEW"
          ? { ...logEntry, flaggedForReview: true, confidence: decision.confidence_score }
          : logEntry;

      const mergedCallerCount = currentCallerCount + 1;
      const effectivePriority =
        (decision.priority as "HIGH" | "MEDIUM" | "LOW") ??
        (existing.priority as "HIGH" | "MEDIUM" | "LOW") ??
        "LOW";

      const updatePayload: Record<string, unknown> = {
        raw_logs: [...currentLogs, enrichedLogEntry],
        caller_count: mergedCallerCount,
        description: decision.structured_summary,
      };

      const priorityRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      const currentPriority = existing.priority ?? "LOW";
      if ((priorityRank[decision.priority] ?? 0) > (priorityRank[currentPriority] ?? 0)) {
        updatePayload.priority = decision.priority;
        updatePayload.risk_index = decision.severity_level;
      }

      // AI severity — recompute with merged context, only ratchet upward.
      const newScore = await scoreSeverity({
        transcript,
        title: existing.title || decision.title,
        type: existing.type || decision.type,
        priority: effectivePriority,
        callerCount: mergedCallerCount,
      });
      const prevScore =
        typeof existing.severity_score === "number" ? existing.severity_score : 0;
      updatePayload.severity_score = Math.max(prevScore, newScore.score);

      if (newConflicts.length > 0) {
        updatePayload.conflicts = mergedConflicts;
      }

      await updateIncident(decision.target_id, updatePayload);

      const updatedLogs = [...currentLogs, enrichedLogEntry];
      const report = await generateReport(
        existing.title,
        existing.location,
        updatedLogs,
        (existing.aggregated_details as Record<string, unknown>[]) ?? [],
        mergedConflicts as Record<string, unknown>[]
      );

      await updateIncident(decision.target_id, { ai_report: report });

      return {
        ...decision,
        conflicts_detected: newConflicts,
        ai_report: report,
        message:
          decision.action === "FLAG_FOR_REVIEW"
            ? `Appended to incident ${decision.target_id} (low-confidence match — flagged for review)`
            : `Updated incident ${decision.target_id}`,
      };
    }
  }

  let aiSuggestion = null;
  let incidentStatus: "active" | "pending_triage" = "active";

  if (sentinel_assist_enabled) {
    const suggestion = await suggestPriority(transcript, decision.title, decision.type);
    aiSuggestion = suggestion;

    if (suggestion.auto_flag && suggestion.recommended_priority === "HIGH") {
      incidentStatus = "active";
      decision.priority = "HIGH";
    } else {
      incidentStatus = "pending_triage";
    }
  }

  const coords = coordinates ?? { lat: 0, lng: 0 };

  const severity = await scoreSeverity({
    transcript,
    title: decision.title,
    type: decision.type,
    priority: decision.priority,
    callerCount: 1,
  });

  const newRow = await insertIncident({
    title: decision.title,
    type: decision.type,
    status: incidentStatus,
    priority: decision.priority,
    initial_priority: decision.priority,
    location: decision.location,
    coordinates: coords,
    description: decision.structured_summary,
    ai_report: "",
    confidence: decision.confidence_score,
    caller_count: 1,
    risk_index: decision.severity_level,
    severity_score: severity.score,
    icon: getIconForType(decision.type),
    raw_logs: [logEntry],
  });

  const report = await generateReport(decision.title, decision.location, [logEntry], [], []);

  await updateIncident(newRow.id, { ai_report: report });

  return {
    ...decision,
    new_incident_id: newRow.id,
    ai_report: report,
    ai_suggestion: aiSuggestion,
    status: incidentStatus,
    message:
      incidentStatus === "pending_triage"
        ? `Created incident in triage queue (Sentinel Assist): ${decision.title}`
        : `Created new incident: ${decision.title}`,
  };
}
