import { randomUUID } from "crypto";
import { getIncidentsCollection, isMongoConfigured, type IncidentDoc } from "./mongodb";

export type IncidentRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  initial_priority?: string;
  location: string;
  coordinates: { lat: number; lng: number } | Record<string, unknown>;
  description: string;
  ai_report: string;
  confidence: number;
  caller_count: number;
  risk_index: string;
  icon: string;
  raw_logs: unknown[];
  conflicts?: unknown[];
  aggregated_details?: unknown[];
  embedding?: number[];
  units_assigned?: unknown[];
  casualties?: unknown;
  confidence_levels?: unknown[];
  created_at: Date;
  updated_at: Date;
};

function docToRow(doc: IncidentDoc): IncidentRow {
  const id = String(doc._id);
  const coords = doc.coordinates;
  let coordinates: { lat: number; lng: number } = { lat: 0, lng: 0 };
  if (coords && typeof coords === "object" && "lat" in coords) {
    coordinates = { lat: Number(coords.lat) || 0, lng: Number(coords.lng) || 0 };
  }
  return {
    id,
    title: doc.title ?? "",
    type: doc.type ?? "",
    status: doc.status ?? "active",
    priority: doc.priority ?? "LOW",
    initial_priority: doc.initial_priority,
    location: doc.location ?? "",
    coordinates,
    description: doc.description ?? "",
    ai_report: doc.ai_report ?? "",
    confidence: typeof doc.confidence === "number" ? doc.confidence : 0,
    caller_count: typeof doc.caller_count === "number" ? doc.caller_count : 0,
    risk_index: doc.risk_index ?? "",
    icon: doc.icon ?? "emergency",
    raw_logs: (doc.raw_logs as unknown[]) ?? [],
    conflicts: doc.conflicts as unknown[],
    aggregated_details: doc.aggregated_details as unknown[],
    embedding: doc.embedding as number[] | undefined,
    units_assigned: doc.units_assigned as unknown[],
    casualties: doc.casualties,
    confidence_levels: doc.confidence_levels as unknown[],
    created_at: doc.created_at instanceof Date ? doc.created_at : new Date(),
    updated_at: doc.updated_at instanceof Date ? doc.updated_at : new Date(),
  };
}

export function transformDbToFrontend(row: IncidentRow | Record<string, unknown>) {
  const r = row as IncidentRow;
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    location: r.location,
    coordinates: r.coordinates ?? { lat: 0, lng: 0 },
    priority: r.priority,
    initialPriority: r.initial_priority || r.priority,
    description: r.description,
    callerCount: r.caller_count,
    elapsedTime: getElapsedTime(r.created_at),
    casualties: r.casualties,
    riskIndex: r.risk_index || "",
    unitsAssigned: r.units_assigned ?? [],
    icon: r.icon || "emergency",
    confidenceScore: Math.round((r.confidence ?? 0) * 100),
    aiReport: r.ai_report || "",
    status: r.status,
    aggregatedDetails: r.aggregated_details ?? [],
    conflicts: r.conflicts ?? [],
    confidenceLevels: r.confidence_levels ?? [],
    transcript: r.raw_logs ?? [],
  };
}

function getElapsedTime(createdAt: Date | string): string {
  const now = new Date();
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const diffMs = now.getTime() - created.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function listIncidents(filters: {
  status?: string | null;
  priority?: string | null;
  assistPending?: boolean;
}): Promise<IncidentRow[]> {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const q: Record<string, unknown> = {};
  if (filters.assistPending) {
    q.status = "pending_triage";
  } else if (filters.status) {
    q.status = filters.status;
  } else {
    q.status = "active";
  }
  if (filters.priority) {
    q.priority = filters.priority;
  }
  const cursor = col.find(q).sort({ created_at: -1 });
  const docs = await cursor.toArray();
  return docs.map((d) => docToRow(d));
}

export async function findIncidentById(id: string): Promise<IncidentRow | null> {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const doc = await col.findOne({ _id: id });
  if (!doc) return null;
  return docToRow(doc);
}

export async function findRecentForMatching(limit: number): Promise<IncidentRow[]> {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const docs = await col
    .find({ status: { $in: ["active", "pending_triage"] } })
    .sort({ updated_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => docToRow(d));
}

export async function insertIncident(
  payload: Omit<IncidentRow, "id" | "created_at" | "updated_at">
) {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const id = randomUUID();
  const now = new Date();
  const doc = {
    _id: id,
    title: payload.title,
    type: payload.type,
    status: payload.status,
    priority: payload.priority,
    initial_priority: payload.initial_priority ?? payload.priority,
    location: payload.location,
    coordinates: payload.coordinates,
    description: payload.description,
    ai_report: payload.ai_report ?? "",
    confidence: payload.confidence,
    caller_count: payload.caller_count,
    risk_index: payload.risk_index,
    icon: payload.icon,
    raw_logs: payload.raw_logs,
    conflicts: payload.conflicts,
    aggregated_details: payload.aggregated_details,
    embedding: payload.embedding,
    units_assigned: payload.units_assigned,
    casualties: payload.casualties,
    confidence_levels: payload.confidence_levels,
    created_at: now,
    updated_at: now,
  } satisfies IncidentDoc;
  await col.insertOne(doc);
  const row = await findIncidentById(id);
  if (!row) throw new Error("Insert failed");
  return row;
}

export async function updateIncident(id: string, patch: Record<string, unknown>) {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const p = { ...patch, updated_at: new Date() };
  const r = await col.updateOne({ _id: id }, { $set: p });
  if (r.matchedCount === 0) return null;
  return findIncidentById(id);
}

export async function updateManyByIds(ids: string[], patch: Record<string, unknown>) {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const p = { ...patch, updated_at: new Date() };
  await col.updateMany({ _id: { $in: ids } }, { $set: p });
}

/** Low/MEDIUM active incidents for trend escalation analysis */
export async function findActiveForTrendAnalysis(incidentIds?: string[]): Promise<IncidentRow[]> {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getIncidentsCollection();
  const q: Record<string, unknown> = { status: "active" };
  if (incidentIds?.length) {
    q._id = { $in: incidentIds };
  } else {
    q.priority = { $in: ["LOW", "MEDIUM"] };
  }
  const docs = await col.find(q).sort({ created_at: -1 }).toArray();
  return docs.map((d) => docToRow(d));
}
