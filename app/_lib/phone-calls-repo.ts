// ─── phone_calls repo ──────────────────────────────────────────────────────
// Persists live Twilio sessions to Mongo so the /phone-calls monitor and
// homepage can hydrate recent history on reload (sessions in server.js are
// in-memory only and disappear on restart).
//
// Schema is intentionally loose — a Twilio session collects fields over time
// (ticket, severity, transcript chunks). We always upsert with the latest
// snapshot rather than keeping per-event rows.

import {
  getPhoneCallsCollection,
  isMongoConfigured,
  type PhoneCallDoc,
} from "./mongodb";

export interface PhoneCallTicket {
  incidentId?: string | null;
  priority?: string | null;
  type?: string | null;
  location?: string | null;
  victims?: number | string | null;
  injuries?: string | null;
  hazards?: string | null;
  callerName?: string | null;
  language?: string | null;
}

export interface PhoneCallSeverity {
  lifeThreat?: number;
  urgency?: number;
  locationConfidence?: number;
  infoCompleteness?: number;
}

export interface PhoneCallSnapshot {
  sessionId: string;
  twilioCallSid?: string | null;
  from?: string | null;
  startedAt?: number;
  endedAt?: number | null;
  lastSeen?: number;
  ticket?: PhoneCallTicket | null;
  transcript?: Array<{ ts: number; speaker: string; text: string }>;
  severityScores?: PhoneCallSeverity | null;
  lat?: number | null;
  lng?: number | null;
  incidentId?: string | null;
  is_demo?: boolean;
}

export interface PhoneCallRow extends PhoneCallSnapshot {
  startedAt: number;
  lastSeen: number;
}

function docToRow(doc: PhoneCallDoc): PhoneCallRow {
  const sessionId = String(doc._id);
  const startedAt =
    typeof doc.startedAt === "number" ? doc.startedAt : Date.now();
  const lastSeen =
    typeof doc.lastSeen === "number" ? doc.lastSeen : startedAt;
  return {
    sessionId,
    twilioCallSid: (doc.twilioCallSid as string | null) ?? null,
    from: (doc.from as string | null) ?? null,
    startedAt,
    endedAt: (doc.endedAt as number | null) ?? null,
    lastSeen,
    ticket: (doc.ticket as PhoneCallTicket | null) ?? null,
    transcript:
      (doc.transcript as Array<{ ts: number; speaker: string; text: string }>) ??
      [],
    severityScores: (doc.severityScores as PhoneCallSeverity | null) ?? null,
    lat: typeof doc.lat === "number" ? doc.lat : null,
    lng: typeof doc.lng === "number" ? doc.lng : null,
    incidentId: (doc.incidentId as string | null) ?? null,
    is_demo: Boolean(doc.is_demo),
  };
}

/**
 * Upsert a snapshot for a session. Caller passes only the fields they
 * know about; existing fields are preserved via $set, and `lastSeen` is
 * always bumped.
 */
export async function upsertPhoneCall(
  snapshot: PhoneCallSnapshot
): Promise<void> {
  if (!isMongoConfigured()) return;
  const col = await getPhoneCallsCollection();
  const now = Date.now();
  const set: Record<string, unknown> = {
    lastSeen: snapshot.lastSeen ?? now,
  };
  // Avoid overwriting fields with undefined.
  const fields: Array<keyof PhoneCallSnapshot> = [
    "twilioCallSid",
    "from",
    "endedAt",
    "ticket",
    "transcript",
    "severityScores",
    "lat",
    "lng",
    "incidentId",
    "is_demo",
  ];
  for (const f of fields) {
    const v = snapshot[f];
    if (v !== undefined) set[f] = v;
  }
  const setOnInsert: Record<string, unknown> = {
    startedAt: snapshot.startedAt ?? now,
  };
  await col.updateOne(
    { _id: snapshot.sessionId },
    { $set: set, $setOnInsert: setOnInsert },
    { upsert: true }
  );
}

export async function markPhoneCallEnded(
  sessionId: string,
  endedAt: number = Date.now()
): Promise<void> {
  if (!isMongoConfigured()) return;
  const col = await getPhoneCallsCollection();
  await col.updateOne(
    { _id: sessionId },
    { $set: { endedAt, lastSeen: endedAt } }
  );
}

export async function setPhoneCallIncidentId(
  sessionId: string,
  incidentId: string
): Promise<void> {
  if (!isMongoConfigured()) return;
  const col = await getPhoneCallsCollection();
  await col.updateOne({ _id: sessionId }, { $set: { incidentId } });
}

export async function listRecentPhoneCalls(
  sinceMs: number
): Promise<PhoneCallRow[]> {
  if (!isMongoConfigured()) throw new Error("MongoDB not configured");
  const col = await getPhoneCallsCollection();
  const docs = await col
    .find({ startedAt: { $gte: sinceMs } })
    .sort({ startedAt: -1 })
    .limit(200)
    .toArray();
  return docs.map(docToRow);
}
