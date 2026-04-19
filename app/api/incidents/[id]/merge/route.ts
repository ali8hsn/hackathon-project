import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../../../_lib/mongodb";
import { findIncidentById, updateIncident } from "../../../../_lib/incidents-repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  const { id } = await params;
  let body: { merge_with: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.merge_with) {
    return Response.json({ error: "merge_with field is required" }, { status: 400 });
  }

  const primary = await findIncidentById(id);
  const secondary = await findIncidentById(body.merge_with);

  if (!primary || !secondary) {
    return Response.json({ error: "One or both incidents not found" }, { status: 404 });
  }

  const mergedLogs = [
    ...((primary.raw_logs as unknown[]) ?? []),
    ...((secondary.raw_logs as unknown[]) ?? []),
  ];

  const mergedCallerCount = (primary.caller_count ?? 0) + (secondary.caller_count ?? 0);

  await updateIncident(id, {
    raw_logs: mergedLogs,
    caller_count: mergedCallerCount,
    description: `${primary.description}\n\n[Merged from ${body.merge_with}]: ${secondary.description}`,
  });

  await updateIncident(body.merge_with, {
    status: "duplicate",
    description: `[MERGED INTO ${id}] ${secondary.description}`,
  });

  return Response.json({
    message: `Merged incident ${body.merge_with} into ${id}`,
    primary_id: id,
    merged_id: body.merge_with,
    total_callers: mergedCallerCount,
    total_logs: mergedLogs.length,
  });
}
