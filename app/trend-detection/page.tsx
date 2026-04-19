"use client";

import { useState, useEffect, useCallback } from "react";
import MapView from "../_components/MapView";

interface BackendIncident {
  id: string;
  title: string;
  type: string;
  location: string;
  coordinates: { lat: number; lng: number };
  priority: string;
  initialPriority: string;
  description: string;
  callerCount: number;
  icon: string;
  elapsedTime: string;
}

export default function TrendDetectionPage() {
  const [lowPriorityIncidents, setLowPriorityIncidents] = useState<BackendIncident[]>([]);
  const [escalatedIncidents, setEscalatedIncidents] = useState<BackendIncident[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [escalationResult, setEscalationResult] = useState<{
    should_escalate: boolean;
    reason: string;
    pattern_summary: string;
    new_priority?: string;
  } | null>(null);

  // Fetch incidents from backend
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents?status=active");
      if (res.ok) {
        const data = await res.json();
        setLowPriorityIncidents(data.filter((i: BackendIncident) =>
          i.priority === "LOW" || i.priority === "MEDIUM"
        ));
        setEscalatedIncidents(data.filter((i: BackendIncident) =>
          i.initialPriority && i.priority !== i.initialPriority
        ));
      }
    } catch {
      // Backend unavailable
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 15000);

    // Refetch when user navigates back/forward (SPA client-side routing)
    window.addEventListener("popstate", fetchIncidents);

    return () => {
      clearInterval(interval);
      window.removeEventListener("popstate", fetchIncidents);
    };
  }, [fetchIncidents]);

  const handleAnalyzeEscalation = useCallback(async () => {
    setIsAnalyzing(true);
    setEscalationResult(null);
    try {
      const res = await fetch("/api/incidents/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        setEscalationResult(result);
        // Refetch to see updated priorities
        const refetch = await fetch("/api/incidents?status=active");
        if (refetch.ok) {
          const data = await refetch.json();
          setLowPriorityIncidents(data.filter((i: BackendIncident) =>
            i.priority === "LOW" || i.priority === "MEDIUM"
          ));
          setEscalatedIncidents(data.filter((i: BackendIncident) =>
            i.initialPriority && i.priority !== i.initialPriority
          ));
        }
      }
    } catch {
      // Error
    }
    setIsAnalyzing(false);
  }, []);

  // Build map URL centered on incidents if we have coordinates, otherwise Austin area
  const mapCenter = lowPriorityIncidents.length > 0
    ? lowPriorityIncidents[0].coordinates
    : escalatedIncidents.length > 0
      ? escalatedIncidents[0].coordinates
      : { lat: 30.2672, lng: -97.7431 };


  const totalItems = escalatedIncidents.length + lowPriorityIncidents.length;
  const isEmpty = totalItems === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-lowest">
      {/* Header */}
      <div className="flex justify-between items-end p-6 shrink-0 border-b border-outline-variant/10 bg-surface-low">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Trend Detection</h1>
          <p className="text-sm text-on-surface-variant font-medium">
            Scanning low-priority telemetry streams for emergent threat patterns.
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={handleAnalyzeEscalation}
            disabled={isAnalyzing || lowPriorityIncidents.length < 2}
            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-gradient-to-br from-primary to-on-primary-container text-on-primary rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-wait flex items-center gap-2 shadow-[0_0_12px_rgba(164,202,246,0.15)]"
          >
            <span className={`material-symbols-outlined text-sm ${isAnalyzing ? "animate-spin" : ""}`}>
              {isAnalyzing ? "progress_activity" : "query_stats"}
            </span>
            {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
          </button>
          <div className="bg-surface-lowest p-3 px-6 rounded border border-outline-variant/5">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Escalated</div>
            <div className="text-2xl font-black text-error">{escalatedIncidents.length}</div>
          </div>
          <div className="bg-surface-lowest p-3 px-6 rounded border border-outline-variant/5">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Low Priority</div>
            <div className="text-2xl font-black text-secondary">{lowPriorityIncidents.length}</div>
          </div>
        </div>
      </div>

      {/* Escalation Alert (shows after analysis) */}
      {escalationResult && (
        <div className={`mx-6 mt-4 p-4 rounded-xl border ${
          escalationResult.should_escalate
            ? "bg-error-container/20 border-error/30"
            : "bg-primary-container/20 border-primary/30"
        }`}>
          <div className="flex items-start gap-3">
            <span className={`material-symbols-outlined ${
              escalationResult.should_escalate ? "text-error" : "text-primary"
            }`} style={{ fontVariationSettings: "'FILL' 1" }}>
              {escalationResult.should_escalate ? "warning" : "check_circle"}
            </span>
            <div>
              <h3 className={`text-sm font-bold ${
                escalationResult.should_escalate ? "text-error" : "text-primary"
              }`}>
                {escalationResult.should_escalate ? "⚠️ Escalation Recommended" : "✓ No Escalation Needed"}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">{escalationResult.reason}</p>
              {escalationResult.pattern_summary && (
                <p className="text-xs text-on-surface mt-2 italic">{escalationResult.pattern_summary}</p>
              )}
              {escalationResult.should_escalate && (
                <p className="text-[10px] font-bold text-error mt-2 uppercase tracking-widest">
                  Incidents promoted to {escalationResult.new_priority} priority
                </p>
              )}
            </div>
            <button onClick={() => setEscalationResult(null)} className="ml-auto p-1 hover:bg-surface-high rounded cursor-pointer">
              <span className="material-symbols-outlined text-sm text-on-surface-variant">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main: Flagged Trends + Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Trends list */}
        <aside className="w-[420px] bg-surface-low border-r border-outline-variant/10 flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant/10 flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-error text-sm">priority_high</span>
            <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface">
              AI-Flagged Trends
            </h2>
            <span className="ml-auto text-[10px] font-bold text-on-surface-variant">{totalItems} detected</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Empty state */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/20 mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>
                  query_stats
                </span>
                <h3 className="text-sm font-bold text-on-surface mb-1">No Trends Detected</h3>
                <p className="text-xs text-on-surface-variant max-w-[280px]">
                  When low-priority incidents are ingested, they will appear here for AI pattern analysis.
                </p>
              </div>
            )}

            {/* Escalated trends — incidents that were reclassified */}
            {escalatedIncidents.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-error uppercase tracking-widest px-1">
                  ⚠ Escalated Trends ({escalatedIncidents.length})
                </div>
                {escalatedIncidents.map((inc) => {
                  const isHigh = inc.priority === "HIGH";
                  return (
                    <a
                      key={inc.id}
                      href={`/situation-sheet/${inc.id}`}
                      className={`block w-full text-left p-4 rounded-xl border transition-all ${
                        isHigh
                          ? "bg-error-container hover:bg-error-container/80 border-error/20"
                          : "bg-tertiary-container hover:bg-tertiary-container/80 border-tertiary/20"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${
                          isHigh ? "text-on-error-container/70" : "text-on-tertiary-container/70"
                        }`}>
                          {inc.id.slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-lowest/30 line-through ${
                            isHigh ? "text-on-error-container/60" : "text-on-tertiary-container/60"
                          }`}>
                            {inc.initialPriority}
                          </span>
                          <span className={`material-symbols-outlined text-xs ${
                            isHigh ? "text-on-error-container" : "text-on-tertiary-container"
                          }`}>arrow_forward</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isHigh ? "bg-error text-on-error" : "bg-tertiary text-on-tertiary"
                          }`}>
                            {inc.priority}
                          </span>
                        </div>
                      </div>
                      <h3 className={`text-sm font-bold mb-1 ${
                        isHigh ? "text-on-error-container" : "text-on-tertiary-container"
                      }`}>{inc.title}</h3>
                      <p className={`text-xs mb-2 ${
                        isHigh ? "text-on-error-container/80" : "text-on-tertiary-container/80"
                      }`}>{inc.description}</p>
                      <div className={`flex items-center gap-1 text-xs ${
                        isHigh ? "text-on-error-container/70" : "text-on-tertiary-container/70"
                      }`}>
                        <span className="material-symbols-outlined text-xs">location_on</span>
                        {inc.location}
                        <span className="ml-auto text-[10px] font-bold">{inc.callerCount} callers</span>
                      </div>
                    </a>
                  );
                })}
                <div className="h-px bg-outline-variant/10" />
              </>
            )}

            {/* Low-priority incidents */}
            {lowPriorityIncidents.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
                  Active Low-Priority ({lowPriorityIncidents.length})
                </div>
                {lowPriorityIncidents.map((inc) => (
                  <a
                    key={inc.id}
                    href={`/situation-sheet/${inc.id}`}
                    className="block w-full text-left p-4 rounded-xl bg-surface-highest hover:bg-surface-bright border border-outline-variant/10 transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono">
                        {inc.id.slice(0, 8)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        inc.priority === "MEDIUM"
                          ? "bg-tertiary-container text-on-tertiary-container"
                          : "bg-primary-container text-primary"
                      }`}>
                        {inc.priority}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-on-surface mb-1">{inc.title}</h3>
                    <p className="text-xs text-on-surface-variant mb-2">{inc.description}</p>
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-xs">location_on</span>
                      {inc.location}
                      <span className="ml-auto text-[10px] font-bold">{inc.callerCount} callers</span>
                    </div>
                  </a>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* Right: Map */}
        <div className="flex-1 relative">
          <div className="absolute top-3 left-3 z-10">
            <div className="px-3 py-1.5 bg-surface-low/90 backdrop-blur text-[10px] font-bold text-on-surface-variant uppercase tracking-widest rounded-full border border-outline-variant/20">
              Incident Coverage — Last 24h
            </div>
          </div>
          <MapView
            center={mapCenter}
            pinCount={lowPriorityIncidents.reduce((sum, i) => sum + (i.callerCount || 1), 0) + escalatedIncidents.reduce((sum, i) => sum + (i.callerCount || 1), 0)}
          />
        </div>
      </div>
    </div>
  );
}
