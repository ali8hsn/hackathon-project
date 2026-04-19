// ─── Shared Types ────────────────────────────────────────────────────────────
// Types used across frontend pages. No mock data or imports.

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Incident {
  id: string;
  title: string;
  type: string;
  location: string;
  coordinates: { lat: number; lng: number };
  priority: Priority;
  initialPriority?: string;
  description: string;
  callerCount: number;
  elapsedTime: string;
  casualties: number;
  riskIndex: string;
  severityScore?: number;
  unitsAssigned: string[];
  icon: string;
  confidenceScore: number;
  aiReport: string;
  status?: string;
  aggregatedDetails: { label: string; value: string; icon: string; color?: string }[];
  conflicts: { field: string; callerA: { id: string; statement: string }; callerB: { id: string; statement: string } }[];
  confidenceLevels: { label: string; value: number; color: string }[];
  transcript: { time: string; speaker: string; text: string; isAI?: boolean; isLive?: boolean }[];
  /** True when this row was created by a `seed-*` script or a ScenarioLab
   *  injection — used by the Reports page Demo/Live toggle to filter out
   *  fake data when dispatchers want to see only real incidents. */
  isDemo?: boolean;
}
