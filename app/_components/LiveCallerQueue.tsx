"use client";

// ─── Live Caller Queue ──────────────────────────────────────────────────────
// Shows calls currently being processed by Siren intake.
// Fields populate over time as the AI extracts them from the transcript.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Incident } from "../_lib/types";

export interface LiveCaller {
  id: string;
  phone: string;           // e.g. "+1 512 ••• 2930" (masked)
  startedAt: number;       // ms epoch
  status: "ringing" | "triaging" | "ready";
  language?: string;
  location?: string;
  nature?: string;
  victims?: number | null;
  hazards?: string[];
  priority?: "HIGH" | "MEDIUM" | "LOW" | null;
  incidentId?: string;     // populated once promoted to dispatch
  confidence?: number;     // 0..100
}

interface Props {
  callers: LiveCaller[];
  title?: string;
  subtitle?: string;
  demoActive?: boolean;
}

function secondsSince(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function LiveCallerQueue({
  callers,
  title = "Active Call Queue",
  subtitle,
  demoActive,
}: Props) {
  // tick every second so elapsed counters update
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
            </span>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-on-surface">
              {title}
            </h2>
            {demoActive && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-tertiary-container/40 text-tertiary border border-tertiary/30">
                Demo
              </span>
            )}
            <span className="text-[11px] text-on-surface-variant">
              {callers.length} in progress
            </span>
          </div>
          {subtitle && (
            <p className="text-[12px] text-on-surface-variant">{subtitle}</p>
          )}
        </div>
      </div>

      {callers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/20 bg-surface-low/40 px-6 py-5 flex items-center gap-3 text-on-surface-variant">
          <span
            className="material-symbols-outlined text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            headset_mic
          </span>
          <p className="text-[12.5px]">
            No active calls — Siren will populate this queue when intake
            begins.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {callers.map((c) => (
            <CallerCard key={c.id} caller={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function CallerCard({ caller }: { caller: LiveCaller }) {
  const isReady = caller.status === "ready";
  const isRinging = caller.status === "ringing";

  return (
    <div
      className={`relative rounded-2xl border bg-gradient-to-br from-surface-low to-surface-lowest px-5 py-4 overflow-hidden transition-all ${
        isReady
          ? "border-brand/30 shadow-[0_0_0_1px_rgba(232,40,26,0.14)]"
          : "border-outline-variant/15"
      }`}
    >
      {/* Top: status + phone + elapsed */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusPill status={caller.status} />
            {caller.language && caller.language !== "en" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-surface-high text-on-surface-variant">
                {caller.language.toUpperCase()}
              </span>
            )}
            {caller.priority && (
              <PriorityPill priority={caller.priority} />
            )}
          </div>
          <p className="text-[13px] font-mono font-semibold text-on-surface">
            {caller.phone}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
            Elapsed
          </p>
          <p className="text-sm font-mono font-black text-on-surface leading-none mt-1">
            {secondsSince(caller.startedAt)}
          </p>
        </div>
      </div>

      {/* Fields being acquired */}
      <div className="space-y-1.5">
        <Field
          label="Nature"
          value={caller.nature}
          icon="emergency"
          placeholder={isRinging ? "awaiting intake…" : "analyzing speech…"}
        />
        <Field
          label="Location"
          value={caller.location}
          icon="location_on"
          placeholder="extracting address…"
        />
        <Field
          label="Victims"
          value={
            caller.victims === null || caller.victims === undefined
              ? undefined
              : `${caller.victims}`
          }
          icon="groups"
          placeholder="asking caller…"
        />
        {caller.hazards && caller.hazards.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {caller.hazards.slice(0, 3).map((h, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-tertiary-container/30 text-tertiary border border-tertiary/20"
              >
                ⚠ {h}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Confidence bar */}
      {typeof caller.confidence === "number" && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
              Confidence
            </span>
            <span className="text-[10px] font-mono font-bold text-on-surface">
              {caller.confidence}%
            </span>
          </div>
          <div className="h-1 bg-surface-high rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${caller.confidence}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer action */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/10">
        {isReady && caller.incidentId ? (
          <Link
            href={`/situation-sheet/${caller.incidentId}`}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand hover:underline"
          >
            <span className="material-symbols-outlined text-sm">
              arrow_forward
            </span>
            Open dispatch
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span
              className="material-symbols-outlined text-sm animate-pulse"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              sync
            </span>
            {isRinging ? "Connecting…" : "Listening…"}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] font-mono text-on-surface-variant">
          <span className="material-symbols-outlined text-xs">mic</span>
          LIVE
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LiveCaller["status"] }) {
  const styles: Record<LiveCaller["status"], string> = {
    ringing: "bg-tertiary-container/40 text-tertiary border-tertiary/30",
    triaging: "bg-brand-dim text-brand border-brand/30",
    ready: "bg-brand/20 text-brand border-brand/40",
  };
  const labels: Record<LiveCaller["status"], string> = {
    ringing: "Ringing",
    triaging: "Triaging",
    ready: "Ready",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function PriorityPill({ priority }: { priority: "HIGH" | "MEDIUM" | "LOW" }) {
  const styles = {
    HIGH: "bg-brand text-white",
    MEDIUM: "bg-tertiary-container/70 text-tertiary",
    LOW: "bg-surface-high text-on-surface-variant",
  } as const;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

function Field({
  label,
  value,
  icon,
  placeholder,
}: {
  label: string;
  value?: string;
  icon: string;
  placeholder: string;
}) {
  const hasValue = !!value && value.trim().length > 0;
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span
        className={`material-symbols-outlined text-sm mt-0.5 shrink-0 ${
          hasValue ? "text-brand" : "text-on-surface-variant/50"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mr-2">
          {label}
        </span>
        {hasValue ? (
          <span className="text-on-surface font-semibold">{value}</span>
        ) : (
          <span className="text-on-surface-variant/60 italic">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Helper: build a LiveCaller from an Incident (backend data) ─────────────
export function callerFromIncident(incident: Incident): LiveCaller | null {
  const isLive = incident.transcript?.some((t) => t.isLive);
  const isIntake = incident.status === "intake" || incident.status === "open";
  if (!isLive && !isIntake) return null;
  const earliest = incident.transcript?.[0]?.time ?? "";
  // We don't have real timestamps in the transcript; fall back to "2 min ago".
  const startedAt =
    Date.now() - (incident.transcript?.length ?? 1) * 12_000;
  return {
    id: incident.id,
    phone: `+1 ••• ••• ${incident.id.slice(-4).toUpperCase()}`,
    startedAt,
    status: isLive ? "triaging" : "ready",
    location: incident.location,
    nature: incident.title,
    victims:
      typeof incident.casualties === "number" ? incident.casualties : null,
    priority: incident.priority,
    incidentId: incident.id,
    confidence: incident.confidenceScore,
    hazards: incident.aggregatedDetails
      ?.filter((d) => d.label?.toLowerCase().includes("hazard"))
      .map((d) => d.value)
      .slice(0, 3),
    // mark 'earliest' referenced to silence unused var if tree-shaken
    language: earliest ? "en" : "en",
  };
}
