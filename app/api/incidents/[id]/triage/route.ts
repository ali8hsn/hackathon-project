import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../../../_lib/mongodb";
import { updateIncident } from "../../../../_lib/incidents-repo";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isMongoConfigured()) {
    return Response.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  const { id } = await params;
  let body: { action: "approve" | "reject" | "escalate"; priority?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.action) {
    return Response.json({ error: "action field is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  switch (body.action) {
    case "approve":
      updates.status = "active";
      if (body.priority) updates.priority = body.priority;
      break;
    case "reject":
      updates.status = "resolved";
      break;
    case "escalate":
      updates.status = "active";
      updates.priority = "HIGH";
      break;
  }

  const data = await updateIncident(id, updates);
  if (!data) {
    return Response.json({ error: "Incident not found" }, { status: 404 });
  }

  return Response.json({
    id: data.id,
    status: data.status,
    priority: data.priority,
    message: `Incident ${body.action}d successfully`,
  });
}
