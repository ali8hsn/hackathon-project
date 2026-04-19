import type { IncidentRow } from "./incidents-repo";
import type { MatchResult } from "./haashir-ai";

function scoreOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.sqrt(wa.size * wb.size);
}

/** Rank recent incidents by cheap text overlap for Claude routing context. */
export function buildMatchResults(
  transcript: string,
  rows: IncidentRow[],
  take = 5
): MatchResult[] {
  const scored = rows.map((row) => ({
    row,
    similarity: scoreOverlap(
      transcript,
      `${row.title} ${row.description} ${row.location}`
    ),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, take).map(({ row, similarity }) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    location: row.location,
    description: row.description,
    similarity: Math.min(1, similarity + 0.05),
  }));
}
