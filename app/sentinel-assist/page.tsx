"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppState } from "../_lib/store";
import Link from "next/link";

interface TriageIncident {
  id: string;
  title: string;
  type: string;
  location: string;
  priority: string;
  description: string;
  callerCount: number;
  elapsedTime: string;
  icon: string;
  confidenceScore: number;
  aiReport: string;
  transcript: Array<{ time: string; speaker: string; text: string }>;
}

export default function SentinelAssistPage() {
  const { sentinelAssistEnabled } = useAppState();
  const [triageQueue, setTriageQueue] = useState<TriageIncident[]>([]);
  const [autoFlagged, setAutoFlagged] = useState<TriageIncident[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending triage incidents
  const fetchTriageQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents?assist_pending=true");
      if (res.ok) {
        const data = await res.json();
        setTriageQueue(data);
      }
    } catch {
      // Backend unavailable
    }
  }, []);

  // Fetch auto-flagged HIGH priority incidents
  const fetchAutoFlagged = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents?status=active&priority=HIGH");
      if (res.ok) {
        const data = await res.json();
        setAutoFlagged(data);
      }
    } catch {
      // Backend unavailable
    }
  }, []);

  useEffect(() => {
    // Defer initial fetch to next frame to satisfy
    // react-hooks/set-state-in-effect (the fetchers internally call setState).
    const raf = requestAnimationFrame(() => {
      fetchTriageQueue();
      fetchAutoFlagged();
    });
    const interval = setInterval(() => {
      fetchTriageQueue();
      fetchAutoFlagged();
    }, 8000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  }, [fetchTriageQueue, fetchAutoFlagged]);

  const handleTriage = useCallback(async (id: string, action: "approve" | "reject" | "escalate") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/incidents/${id}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchTriageQueue();
        await fetchAutoFlagged();
      }
    } catch {
      // Error
    }
    setProcessingId(null);
  }, [fetchTriageQueue, fetchAutoFlagged]);

  const isEmpty = triageQueue.length === 0 && autoFlagged.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-low">
      {/* Header — fixed */}
      <header className="p-8 pb-6 shrink-0">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
              <span className="text-brand">Siren</span> · AI triage
            </h1>
            <p className="text-on-surface-variant text-sm max-w-xl">
              {sentinelAssistEnabled
                ? "AI assist is active. Incoming incidents are triaged automatically — high-priority cases are auto-flagged."
                : "AI assist is off. New incidents still appear on Situations without the triage queue."
              }
            </p>
          </div>
          <div className="flex gap-4">
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              sentinelAssistEnabled
                ? "bg-tertiary-container border border-tertiary/20"
                : "bg-surface border border-outline-variant/10"
            }`}>
              <span className={`w-2 h-2 rounded-full ${sentinelAssistEnabled ? "bg-tertiary animate-pulse" : "bg-on-surface-variant/30"}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                sentinelAssistEnabled ? "text-tertiary" : "text-on-surface-variant"
              }`}>
                {sentinelAssistEnabled ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="bg-surface text-right px-4 py-2 rounded-lg border border-outline-variant/10">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Queue</div>
              <div className="text-xl font-black text-primary">{triageQueue.length}</div>
            </div>
            <div className="bg-surface text-right px-4 py-2 rounded-lg border border-outline-variant/10">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Auto-Flagged</div>
              <div className="text-xl font-black text-error">{autoFlagged.length}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8">
        {/* EMPTY STATE */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-6" style={{ fontVariationSettings: "'FILL' 1" }}>
              psychology
            </span>
            <h2 className="text-xl font-bold text-on-surface mb-2">No Incidents in Triage</h2>
            <p className="text-sm text-on-surface-variant max-w-md">
              {sentinelAssistEnabled
                ? "Siren is listening for new incidents. AI triage will surface items here for review."
                : "Turn on AI assist from the top bar to enable automated triage on incoming incidents."
              }
            </p>
          </div>
        )}

        {/* AUTO-FLAGGED CRITICAL ALERTS */}
        {autoFlagged.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-error">emergency</span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-error">
                Auto-Flagged — Requires Immediate Attention
              </h2>
            </div>
            <div className="space-y-4">
              {autoFlagged.map((incident) => (
                <div key={incident.id} className="relative group">
                  <div className="absolute -inset-1 bg-error/10 rounded-xl blur-lg opacity-75 group-hover:opacity-100 transition duration-1000" />
                  <div className="relative bg-surface-highest border border-error/30 rounded-xl p-6 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="bg-error-container text-on-error-container text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                          High Priority — Auto-Flagged
                        </span>
                        <span className="text-on-surface-variant font-mono text-xs">{incident.id.slice(0, 8)}</span>
                      </div>
                      <h2 className="text-2xl font-black text-on-surface mb-2">{incident.title}</h2>
                      <div className="flex items-center gap-1 text-sm text-on-surface-variant mb-3">
                        <span className="material-symbols-outlined text-sm">location_on</span>
                        {incident.location}
                      </div>
                      <div className="bg-surface-lowest/50 p-4 rounded-lg mb-3">
                        <div className="text-[10px] text-primary font-bold uppercase tracking-tight mb-2">
                          AI Analysis
                        </div>
                        <p className="text-sm text-on-surface leading-relaxed">{incident.description}</p>
                      </div>
                      {incident.transcript.length > 0 && (
                        <div className="text-xs text-on-surface-variant italic">
                          Latest: &ldquo;{incident.transcript[incident.transcript.length - 1]?.text}&rdquo;
                        </div>
                      )}
                    </div>
                    <div className="w-full md:w-64 flex flex-col justify-between items-end border-l border-outline-variant/10 pl-6 gap-4">
                      <div className="w-full text-right">
                        <div className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">
                          AI Confidence
                        </div>
                        <div className="text-3xl font-black text-error">{incident.confidenceScore}%</div>
                      </div>
                      <div className="w-full space-y-3">
                        <Link
                          href={`/situation-sheet/${incident.id}`}
                          className="block w-full bg-error text-on-error font-black py-3 rounded-lg text-sm tracking-widest shadow-lg shadow-error/20 active:scale-[0.98] transition-all cursor-pointer text-center"
                        >
                          VIEW SITUATION
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TRIAGE QUEUE */}
        {triageQueue.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">psychology</span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface">
                AI Triage Queue — Awaiting Review
              </h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {triageQueue.map((incident) => (
                <div
                  key={incident.id}
                  className="bg-surface border border-outline-variant/10 rounded-xl p-5 hover:bg-surface-high transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                        <span className="material-symbols-outlined text-xl text-primary">psychology</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-on-surface text-sm">{incident.title}</h3>
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                          {incident.type} • {incident.elapsedTime} ago
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                      incident.priority === "HIGH"
                        ? "bg-error-container text-on-error-container"
                        : incident.priority === "MEDIUM"
                          ? "bg-tertiary-container text-on-tertiary-container"
                          : "bg-primary-container text-primary"
                    }`}>
                      AI suggests: {incident.priority}
                    </span>
                  </div>

                  <div className="bg-surface-lowest p-4 rounded-lg mb-4 border-l-2 border-primary/40">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-primary uppercase">AI Reasoning</span>
                      <span className="text-[10px] font-bold text-on-surface-variant">
                        Confidence: {incident.confidenceScore}%
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{incident.description}</p>
                  </div>

                  {incident.transcript.length > 0 && (
                    <div className="bg-surface-lowest/50 p-3 rounded-lg mb-4">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">Transcript</span>
                      <p className="text-xs text-on-surface-variant italic mt-1">
                        &ldquo;{incident.transcript[0]?.text}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTriage(incident.id, "escalate")}
                      disabled={processingId === incident.id}
                      className="flex-1 bg-error text-on-error font-bold py-2.5 rounded-lg text-[10px] tracking-widest hover:bg-error/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                    >
                      ESCALATE
                    </button>
                    <button
                      onClick={() => handleTriage(incident.id, "approve")}
                      disabled={processingId === incident.id}
                      className="flex-1 bg-primary-container text-primary font-bold py-2.5 rounded-lg text-[10px] tracking-widest hover:bg-primary-container/80 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => handleTriage(incident.id, "reject")}
                      disabled={processingId === incident.id}
                      className="px-4 py-2.5 border border-outline-variant/30 text-on-surface-variant font-bold rounded-lg text-[10px] tracking-widest hover:bg-surface-highest transition-all cursor-pointer disabled:opacity-50"
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
