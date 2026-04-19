import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../../_lib/mongodb";
import { findIncidentById, updateIncident, transformDbToFrontend } from "../../../_lib/incidents-repo";
import { generateReport } from "../../../_lib/sentinel-ai";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  const { id } = await params;
  const data = await findIncidentById(id);
  if (!data) {
    return Response.json({ error: "Incident not found" }, { status: 404 });
  }

  return Response.json(transformDbToFrontend(data));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updateFields: Record<string, unknown> = {};

  if ("aiReport" in body) updateFields.ai_report = body.aiReport;
  if ("status" in body) updateFields.status = body.status;
  if ("priority" in body) updateFields.priority = body.priority;
  if ("title" in body) updateFields.title = body.title;
  if ("description" in body) updateFields.description = body.description;
  if ("unitsAssigned" in body) updateFields.units_assigned = body.unitsAssigned;
  if ("casualties" in body) updateFields.casualties = body.casualties;

  if (body.regenerateReport === true) {
    const incident = await findIncidentById(id);
    if (incident) {
      try {
        const report = await generateReport(
          incident.title,
          incident.location,
          (incident.raw_logs as Array<{ time: string; speaker: string; text: string }>) ?? [],
          (incident.aggregated_details as Record<string, unknown>[]) ?? [],
          (incident.conflicts as Record<string, unknown>[]) ?? []
        );
        updateFields.ai_report = report;
      } catch (err) {
        console.error("Report generation error:", err);
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const data = await updateIncident(id, updateFields);
  if (!data) {
    return Response.json({ error: "Incident not found" }, { status: 404 });
  }

  return Response.json(transformDbToFrontend(data));
}
