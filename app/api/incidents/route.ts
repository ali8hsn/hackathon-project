import { NextRequest } from "next/server";
import { isMongoConfigured } from "../../_lib/mongodb";
import { listIncidents, transformDbToFrontend } from "../../_lib/incidents-repo";
import { ingestTranscript } from "../../_lib/incident-ingest";

export async function GET(request: NextRequest) {
  if (!isMongoConfigured()) {
    return Response.json(
      { error: "MongoDB not configured — set MONGODB_URI in .env" },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const assistPending = searchParams.get("assist_pending");

  try {
    const rows = await listIncidents({
      status,
      priority,
      assistPending: assistPending === "true",
    });
    return Response.json(rows.map((r) => transformDbToFrontend(r)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isMongoConfigured()) {
    return Response.json(
      { error: "MongoDB not configured — set MONGODB_URI in .env" },
      { status: 503 }
    );
  }

  let body: {
    transcript: string;
    caller_id?: string;
    location_hint?: string;
    coordinates?: { lat: number; lng: number };
    haashir_assist_enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.transcript || body.transcript.trim().length === 0) {
    return Response.json({ error: "transcript field is required" }, { status: 400 });
  }

  try {
    const result = await ingestTranscript(body);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
