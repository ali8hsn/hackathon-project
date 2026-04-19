"use client";

// ─── Live Caller Queue ──────────────────────────────────────────────────────
// Shows calls currently being processed by Siren intake.
// Fields populate over time as the AI extracts them from the transcript.
//
// Triage queue ordering:
//   We score every active caller and sort high→low so the dispatcher always
//   knows which call to pick up next. Score blends priority bucket (the AI's
//   coarse HIGH/MEDIUM/LOW signal) with seconds on hold, so within a tier the
//   caller who has been waiting longest floats up. The top-ranked card glows
//   amber; the rest are visually muted so the eye lands on #1 first.

import { useEffect, useMemo, useState } from "react";
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
  channel?: "phone" | "browser";
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

// Pick-next score. Bigger = take this call first.
//   • Priority weight dominates so a HIGH always beats a MEDIUM regardless of
//     time waited — that matches operator intuition.
//   • Within the same priority bucket, +1 per second on hold so the longest-
//     waiting caller floats up. A "ringing" call gets a small bonus so brand-
//     new connections don't sit at the bottom on tie-breakers.
function pickNextScore(c: LiveCaller): number {
  const priorityWeight =
    c.priority === "HIGH"
      ? 10000
      : c.priority === "MEDIUM"
        ? 5000
        : c.priority === "LOW"
          ? 1000
          : 2500; // unknown → between MEDIUM and LOW
  const elapsed = Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000));
  const ringingBonus = c.status === "ringing" ? 50 : 0;
  return priorityWeight + elapsed + ringingBonus;
}

export default function LiveCallerQueue({
  callers,
  title = "Active Call Queue",
  subtitle,
  demoActive,
}: Props) {
  // tick every second so elapsed counters + queue ranks stay current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Rank callers by pick-next score so the dispatcher sees a clear ordering.
  // Recompute every tick because elapsed seconds feed the score (within a
  // priority bucket the longest-waiting caller floats up).
  const ranked = useMemo(() => {
    const scored = callers.map((c) => ({ caller: c, score: pickNextScore(c) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s, i) => ({ caller: s.caller, rank: i + 1 }));
  }, [callers, tick]);

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
          {ranked.map(({ caller, rank }) => (
            <CallerCard
              key={caller.id}
              caller={caller}
              rank={rank}
              total={ranked.length}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CallerCard({
  caller,
  rank,
  total,
}: {
  caller: LiveCaller;
  rank: number;
  total: number;
}) {
  const isReady = caller.status === "ready";
  const isRinging = caller.status === "ringing";
  const isTop = rank === 1;

  // Top-rank card glows amber so it visually pops out of the grid; the rest
  // get a slightly desaturated background + dimmed border so the eye lands
  // on #1 first. Border colour also stays in sync with `ready` state.
  // Top-rank card glows amber to grab the eye. Non-top cards stay readable —
  // we mute via background/border tints rather than container opacity, which
  // would also dim the text and tank contrast.
  const cardStyle: React.CSSProperties = isTop
    ? {
        background:
          "linear-gradient(180deg, rgba(245,158,11,0.12), rgba(24,24,34,0.9))",
        borderColor: "rgba(245,158,11,0.55)",
        boxShadow:
          "0 0 0 1px rgba(245,158,11,0.18), 0 14px 40px -18px rgba(245,158,11,0.45)",
      }
    : {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0))",
        borderColor: isReady
          ? "rgba(232,40,26,0.22)"
          : "rgba(255,255,255,0.08)",
      };

  // overflow-visible so the #1 card's pulsing halo can spill outside the
  // rounded border without being clipped at the corners.
  return (
    <div
      className="relative rounded-2xl border px-5 py-4 transition-all"
      style={cardStyle}
    >
      {/* Top row: rank badge ─ status/phone ─ priority + elapsed */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-start mb-3">
        <RankBadge rank={rank} total={total} isTop={isTop} />

        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusPill status={caller.status} />
            {caller.channel === "browser" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-tertiary-container/40 text-tertiary border border-tertiary/30">
                Browser
              </span>
            )}
            {caller.language && caller.language !== "en" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-surface-high text-on-surface-variant">
                {caller.language.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-[13px] font-mono font-semibold text-on-surface">
            {caller.phone}
          </p>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          {caller.priority && <PriorityPill priority={caller.priority} />}
          <div>
            <p
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{
                color: isTop ? "#fbbf24" : "rgba(255,255,255,0.5)",
              }}
            >
              On call
            </p>
            <p
              className="text-base font-mono font-black tabular-nums leading-none mt-1"
              style={{
                color: isTop ? "#fbbf24" : "rgba(255,255,255,0.78)",
              }}
            >
              {secondsSince(caller.startedAt)}
            </p>
          </div>
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

// Big "pick this one next" badge. #1 is a vivid amber chip with a pulsing
// halo so it's the first thing a dispatcher's eye catches; ranks 2..N are a
// muted dark chip with dim text so they recede into the background.
function RankBadge({
  rank,
  total,
  isTop,
}: {
  rank: number;
  total: number;
  isTop: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0 w-12 pt-0.5">
      <div className="relative">
        {isTop && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-40"
            style={{ background: "#f59e0b" }}
            aria-hidden
          />
        )}
        <span
          className="relative inline-flex items-center justify-center h-10 w-10 rounded-full font-display font-black tabular-nums"
          style={
            isTop
              ? {
                  background: "#fbbf24",
                  color: "#1a0f00",
                  boxShadow:
                    "0 0 0 2px rgba(245,158,11,0.45), 0 6px 18px -4px rgba(245,158,11,0.55)",
                  fontSize: 19,
                  letterSpacing: -0.5,
                }
              : {
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 16,
                }
          }
          title={
            isTop
              ? "Take this call first — highest pick-next score"
              : `Position ${rank} of ${total} in the triage queue`
          }
        >
          {rank}
        </span>
      </div>
      <span
        className="text-[8.5px] font-bold uppercase tracking-[0.16em]"
        style={{
          color: isTop ? "#fbbf24" : "rgba(255,255,255,0.35)",
        }}
      >
        {isTop ? "Next up" : `#${rank}`}
      </span>
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
