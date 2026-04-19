import { MongoClient, type Collection, type Db, type Document as MongoDocument } from "mongodb";

/** String _id (UUID) incident documents */
export type IncidentDoc = MongoDocument & { _id: string };

const uri = process.env.MONGODB_URI;
let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

let indexesEnsured: Promise<void> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(uri && uri.length > 0);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (client) return client;
  if (!connectPromise) {
    connectPromise = MongoClient.connect(uri).then((c) => {
      client = c;
      return c;
    });
  }
  return connectPromise;
}

export function getDb(): Promise<Db> {
  return getMongoClient().then((c) => c.db(process.env.MONGODB_DB_NAME || "siren"));
}

export async function getIncidentsCollection(): Promise<Collection<IncidentDoc>> {
  const db = await getDb();
  const col = db.collection<IncidentDoc>("incidents");
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      await col.createIndex({ status: 1, updated_at: -1 });
      await col.createIndex({ priority: 1 });
      await col.createIndex({ created_at: -1 });
    })();
  }
  await indexesEnsured;
  return col;
}

// ─── phone_calls (live + historical Twilio sessions) ─────────────────────
// Separate from `incidents` so the /phone-calls monitor can show recent
// calls without polluting the incidents/reports table. Calls promoted to
// proper incidents (HIGH severity, or part of a 2+ caller cluster) keep
// a back-reference via `incidentId`.
export type PhoneCallDoc = MongoDocument & { _id: string };

let phoneCallsIndexesEnsured: Promise<void> | null = null;
export async function getPhoneCallsCollection(): Promise<Collection<PhoneCallDoc>> {
  const db = await getDb();
  const col = db.collection<PhoneCallDoc>("phone_calls");
  if (!phoneCallsIndexesEnsured) {
    phoneCallsIndexesEnsured = (async () => {
      await col.createIndex({ startedAt: -1 });
      await col.createIndex({ lastSeen: -1 });
      await col.createIndex({ incidentId: 1 });
    })();
  }
  await phoneCallsIndexesEnsured;
  return col;
}
