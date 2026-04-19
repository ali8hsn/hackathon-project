// ─── phone-calls-persist (CommonJS) ────────────────────────────────────────
// CommonJS shim for persisting Twilio sessions from server.js into Mongo.
// Mirrors app/_lib/phone-calls-repo.ts so the live monitor can hydrate
// recent calls on page reload.
//
// Failures are swallowed (warn + return) — Twilio + dispatcher experience
// must NEVER block on Mongo flakiness.

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DB_NAME || 'sentinel';

let client = null;
let connectPromise = null;
let phoneCallsCol = null;
let indexesEnsured = false;

function isConfigured() {
  return Boolean(uri && uri.length > 0);
}

async function getClient() {
  if (client) return client;
  if (!connectPromise) {
    connectPromise = MongoClient.connect(uri).then((c) => {
      client = c;
      return c;
    });
  }
  return connectPromise;
}

async function getCol() {
  if (phoneCallsCol) return phoneCallsCol;
  const c = await getClient();
  const col = c.db(dbName).collection('phone_calls');
  if (!indexesEnsured) {
    indexesEnsured = true;
    try {
      await col.createIndex({ startedAt: -1 });
      await col.createIndex({ lastSeen: -1 });
      await col.createIndex({ incidentId: 1 });
    } catch (e) {
      console.warn('[phone_calls index]', e?.message || e);
    }
  }
  phoneCallsCol = col;
  return col;
}

/** Best-effort upsert. Drops `undefined` so we don't clobber existing fields. */
async function upsertPhoneCall(snapshot) {
  if (!isConfigured() || !snapshot || !snapshot.sessionId) return;
  try {
    const col = await getCol();
    const now = Date.now();
    const set = { lastSeen: snapshot.lastSeen || now };
    const fields = [
      'twilioCallSid',
      'from',
      'endedAt',
      'ticket',
      'transcript',
      'severityScores',
      'lat',
      'lng',
      'incidentId',
      'is_demo',
    ];
    for (const f of fields) {
      if (snapshot[f] !== undefined) set[f] = snapshot[f];
    }
    const setOnInsert = {
      startedAt: snapshot.startedAt || now,
    };
    await col.updateOne(
      { _id: snapshot.sessionId },
      { $set: set, $setOnInsert: setOnInsert },
      { upsert: true }
    );
  } catch (e) {
    console.warn('[phone_calls upsert]', e?.message || e);
  }
}

async function markEnded(sessionId, endedAt) {
  if (!isConfigured() || !sessionId) return;
  try {
    const col = await getCol();
    const ts = endedAt || Date.now();
    await col.updateOne({ _id: sessionId }, { $set: { endedAt: ts, lastSeen: ts } });
  } catch (e) {
    console.warn('[phone_calls markEnded]', e?.message || e);
  }
}

async function setIncidentId(sessionId, incidentId) {
  if (!isConfigured() || !sessionId || !incidentId) return;
  try {
    const col = await getCol();
    await col.updateOne({ _id: sessionId }, { $set: { incidentId } });
  } catch (e) {
    console.warn('[phone_calls setIncidentId]', e?.message || e);
  }
}

async function listRecent(sinceMs) {
  if (!isConfigured()) return [];
  try {
    const col = await getCol();
    const docs = await col
      .find({ startedAt: { $gte: sinceMs } })
      .sort({ startedAt: -1 })
      .limit(200)
      .toArray();
    return docs.map((d) => ({ ...d, sessionId: String(d._id) }));
  } catch (e) {
    console.warn('[phone_calls listRecent]', e?.message || e);
    return [];
  }
}

module.exports = {
  isConfigured,
  upsertPhoneCall,
  markEnded,
  setIncidentId,
  listRecent,
};
