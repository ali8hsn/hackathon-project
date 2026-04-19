// ─── livePhoneClusters ─────────────────────────────────────────────────────
// Groups live Twilio callers (LivePhonePin) into "joined" clusters when they
// look like they're reporting the same incident. We use two signals:
//
//   1. Shared incident id  — the server has already linked them via
//      _lib/incident-ingest.ts. Strongest signal; clusters immediately.
//   2. Geographic + topic co-location — pins within ~500 m of each other
//      that share the first meaningful word of `ticket.type` (e.g. "fire",
//      "collision", "shooting"). This catches the case where two callers
//      both dialled 911 about the same crash before the server has linked
//      them to a single incident.
//
// Singletons are returned as 1-element clusters so the UI can render them
// uniformly (single bubble vs joined bubble is just a `count >= 2` check).

import type { LivePhonePin } from "./useLivePhoneCallers";

export interface LivePhoneCluster {
  /** Stable id derived from the cluster key — usable as a React key. */
  id: string;
  /** Centroid lat (mean of member coords). */
  lat: number;
  /** Centroid lng (mean of member coords). */
  lng: number;
  /** Most representative incident type across members (longest non-empty). */
  type: string | null;
  /** Most representative location string across members. */
  location: string | null;
  /** Members, sorted by sessionId for stable rendering. */
  pins: LivePhonePin[];
}

// First non-empty token of a free-text incident type, lower-cased. We strip
// punctuation so "Structure fire — residential" and "structure fire" both
// bucket under "structure". Empty/short tickets fall back to "unknown" so
// they only join other unknown-type pins at the same spot.
function topicToken(typeText: string | null | undefined): string {
  const t = (typeText || "").toLowerCase().trim();
  if (!t) return "unknown";
  const tokens = t
    .replace(/[—\-:.,/()]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Skip generic leading words so "medical emergency" and "medical event"
  // both bucket on "medical" rather than on a meaningless first word.
  for (const tok of tokens) {
    if (tok.length >= 4) return tok;
  }
  return tokens[0] || "unknown";
}

// ~500 m grid in latitude (1° lat ≈ 111 km, so 0.005° ≈ 555 m). Lng is
// approximated the same way; this slightly over-clusters at low latitudes
// but is plenty for "are these two pins next to each other" purposes.
function gridBucket(lat: number, lng: number): string {
  const la = Math.round(lat * 200);
  const ln = Math.round(lng * 200);
  return `${la}:${ln}`;
}

function clusterKey(pin: LivePhonePin): string {
  const incId = pin.ticket?.incidentId;
  if (incId && typeof incId === "string" && incId.trim().length > 0) {
    return `inc:${incId}`;
  }
  return `geo:${gridBucket(pin.lat, pin.lng)}:${topicToken(pin.ticket?.type)}`;
}

export function clusterLivePhonePins(
  pins: LivePhonePin[]
): LivePhoneCluster[] {
  const groups = new Map<string, LivePhonePin[]>();
  for (const p of pins) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
    const k = clusterKey(p);
    const arr = groups.get(k);
    if (arr) arr.push(p);
    else groups.set(k, [p]);
  }

  const out: LivePhoneCluster[] = [];
  for (const [key, members] of groups) {
    const sorted = [...members].sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId)
    );
    const lat =
      sorted.reduce((acc, m) => acc + m.lat, 0) / Math.max(1, sorted.length);
    const lng =
      sorted.reduce((acc, m) => acc + m.lng, 0) / Math.max(1, sorted.length);
    const type =
      sorted
        .map((m) => (m.ticket?.type || "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] || null;
    const location =
      sorted
        .map((m) => (m.ticket?.location || "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] || null;
    out.push({
      id: key,
      lat,
      lng,
      type,
      location,
      pins: sorted,
    });
  }

  // Biggest joined groups first so the UI surfaces mass events at the top.
  out.sort((a, b) => b.pins.length - a.pins.length);
  return out;
}
