"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Incident } from "./_lib/types";

function getPriorityColor(priority: string) {
  switch (priority) {
    case "HIGH":
      return { dot: "bg-error", text: "text-error", border: "border-error/20", badge: "bg-error-container text-on-error-container" };
    case "MEDIUM":
      return { dot: "bg-tertiary", text: "text-tertiary", border: "border-tertiary/20", badge: "bg-tertiary-container text-on-tertiary-container" };
    default:
      return { dot: "bg-primary", text: "text-primary", border: "border-primary/20", badge: "bg-primary-container text-primary" };
  }
}

export default function MonitorPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    async function fetchIncidents() {
      try {
        const res = await fetch("/api/incidents");
        if (res.ok) {
          const data = await res.json();
          setIncidents(data);
          setIsLive(true);
        }
      } catch {
        // Backend not available
      }
    }
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, []);

  const highCount = incidents.filter((i) => i.priority === "HIGH").length;
  const medCount = incidents.filter((i) => i.priority === "MEDIUM").length;

  return (
    <div className="flex-1 bg-surface-lowest overflow-y-auto h-full p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black tracking-tight text-on-surface">
              Active Situations
            </h1>
            {isLive && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-container/30 border border-primary/20 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Live</span>
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant">
            Siren · {incidents.length} active situations on the board.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="flex gap-4 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-low rounded-lg border border-outline-variant/10">
            <span className="w-2 h-2 rounded-full bg-error" />
            <span className="text-xs font-bold text-on-surface-variant uppercase">Critical: {highCount}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-low rounded-lg border border-outline-variant/10">
            <span className="w-2 h-2 rounded-full bg-tertiary" />
            <span className="text-xs font-bold text-on-surface-variant uppercase">Medium: {medCount}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-low rounded-lg border border-outline-variant/10">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs font-bold text-on-surface-variant uppercase">Total: {incidents.length}</span>
          </div>
        </div>

        {/* Empty State */}
        {incidents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-6" style={{ fontVariationSettings: "'FILL' 1" }}>
              shield
            </span>
            <h2 className="text-xl font-bold text-on-surface mb-2">No Active Situations</h2>
            <p className="text-sm text-on-surface-variant max-w-md">
              When incidents are reported, they will appear here for monitoring. Use the API to ingest transcripts or run a seed script.
            </p>
          </div>
        )}

        {/* Situation Cards */}
        <div className="space-y-4">
          {incidents.map((incident) => {
            const colors = getPriorityColor(incident.priority);
            return (
              <Link
                key={incident.id}
                href={`/situation-sheet/${incident.id}`}
                className={`block p-6 rounded-xl bg-surface-low border ${colors.border} hover:bg-surface-high transition-all group cursor-pointer`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-5">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl ${incident.priority === "HIGH" ? "bg-error-container" : "bg-surface-highest"} flex items-center justify-center shrink-0`}>
                      <span
                        className={`material-symbols-outlined text-2xl ${incident.priority === "HIGH" ? "text-error" : "text-primary"}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {incident.icon}
                      </span>
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${colors.badge}`}>
                          {incident.priority}
                        </span>
                        <span className="text-xs text-on-surface-variant font-mono">{incident.id.slice(0, 8)}</span>
                      </div>
                      <h2 className="text-lg font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
                        {incident.title}
                      </h2>
                      <div className="flex items-center gap-1 text-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">location_on</span>
                        {incident.location}
                      </div>
                    </div>
                  </div>

                  {/* Right stats */}
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold">Callers</p>
                      <p className="text-xl font-black text-on-surface">{incident.callerCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-on-surface-variant uppercase font-bold">Elapsed</p>
                      <p className="text-xl font-black text-on-surface font-mono">{incident.elapsedTime}</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
