"use client";

// ─── ClusterCards ───────────────────────────────────────────────────────────
// Renders one violet card per active mass-event cluster (>= 2 callers
// reporting the same type+location). Each card has a "Merge into one
// incident" button gated by a confirmation step so a misclick during the
// demo doesn't pollute Mongo. Lives directly above the LiveCallerQueue on
// the homepage so dispatchers see clusters before individual callers.

import { useState } from "react";
import type { LiveCluster } from "./useLiveClusters";

interface Props {
  clusters: LiveCluster[];
  onMerge: (key: string, sessionIds: string[]) => Promise<{
    ok: boolean;
    incidentId?: string | null;
    error?: string;
  }>;
}

export default function ClusterCards({ clusters, onMerge }: Props) {
  if (!clusters || clusters.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {clusters.map((c) => (
        <ClusterCard key={c.key} cluster={c} onMerge={onMerge} />
      ))}
    </div>
  );
}

function ClusterCard({
  cluster,
  onMerge,
}: {
  cluster: LiveCluster;
  onMerge: Props["onMerge"];
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleMerge() {
    setBusy(true);
    setErr(null);
    const result = await onMerge(cluster.key, cluster.sessionIds);
    setBusy(false);
    if (result.ok) {
      setDone(result.incidentId ?? "merged");
    } else {
      setErr(result.error ?? "merge failed");
      setConfirming(false);
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl"
      style={{
        background:
          "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(91,33,182,0.28) 100%)",
        border: "1px solid rgba(167,139,250,0.45)",
        boxShadow: "0 12px 32px -16px rgba(124,58,237,0.55)",
      }}
    >
      {/* Pulsing siren accent stripe */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{
          background:
            "linear-gradient(180deg,#a78bfa 0%,#7c3aed 50%,#5b21b6 100%)",
          animation: "siren-cluster-pulse 1.6s ease-in-out infinite",
        }}
      />
      <div className="pl-5 pr-4 py-4 flex items-start gap-3">
        <span
          className="material-symbols-outlined text-[26px] mt-0.5"
          style={{ color: "#ddd6fe", fontVariationSettings: "'FILL' 1" }}
        >
          campaign
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: "#ddd6fe" }}
            >
              Mass event detected
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[9.5px] font-black tracking-wider"
              style={{
                background: "rgba(255,255,255,0.18)",
                color: "#ffffff",
              }}
            >
              {cluster.callerCount} CALLERS
            </span>
          </div>
          <p
            className="text-[15px] font-extrabold leading-tight truncate"
            style={{ color: "#ffffff" }}
          >
            {cluster.type}
          </p>
          <p
            className="text-[12px] mt-0.5 truncate"
            style={{ color: "rgba(237,233,254,0.85)" }}
          >
            near {cluster.location}
          </p>
          {done ? (
            <p
              className="text-[11px] mt-2 font-semibold"
              style={{ color: "#bbf7d0" }}
            >
              Merged into single incident{done !== "merged" ? ` (${done.slice(0, 8)}…)` : ""}
            </p>
          ) : err ? (
            <p
              className="text-[11px] mt-2 font-semibold"
              style={{ color: "#fecaca" }}
            >
              {err}
            </p>
          ) : null}
        </div>
        {!done && (
          <div className="flex flex-col items-end gap-1.5">
            {confirming ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.20)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors"
                  style={{
                    background: "#ffffff",
                    color: "#5b21b6",
                  }}
                >
                  {busy ? "Merging…" : "Confirm merge"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors"
                style={{
                  background: "#ffffff",
                  color: "#5b21b6",
                }}
              >
                <span className="material-symbols-outlined text-[15px]">
                  merge
                </span>
                Merge into one incident
              </button>
            )}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes siren-cluster-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
