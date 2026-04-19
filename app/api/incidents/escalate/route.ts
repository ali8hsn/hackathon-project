import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../../_lib/mongodb";
import { findActiveForTrendAnalysis, updateManyByIds } from "../../../_lib/incidents-repo";
import { analyzeTrendEscalation } from "../../../_lib/sentinel-ai";

export async function POST(request: NextRequest) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  let body: { incident_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const incidents = await findActiveForTrendAnalysis(body.incident_ids);

    if (incidents.length < 2) {
      return Response.json({
        should_escalate: false,
        reason: "Not enough incidents to detect a trend pattern",
      });
    }

    const analysisInput = incidents.map((inc) => ({
      title: inc.title,
      type: inc.type,
      location: inc.location,
      priority: inc.priority,
      description: inc.description,
      caller_count: inc.caller_count,
    }));

    const result = await analyzeTrendEscalation(analysisInput);

    if (result.should_escalate && result.escalate_indices.length > 0) {
      const idsToEscalate = result.escalate_indices
        .filter((idx: number) => idx >= 0 && idx < incidents.length)
        .map((idx: number) => incidents[idx].id);

      if (idsToEscalate.length > 0) {
        await updateManyByIds(idsToEscalate, {
          priority: result.new_priority,
          risk_index: result.new_severity,
        });
      }
    }

    return Response.json({
      ...result,
      incidents_analyzed: incidents.length,
      incident_ids: incidents.map((inc) => inc.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
