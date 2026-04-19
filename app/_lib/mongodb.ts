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
  return getMongoClient().then((c) => c.db(process.env.MONGODB_DB_NAME || "sentinel"));
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
