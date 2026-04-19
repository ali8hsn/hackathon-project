"use client";

// ─── /phone-calls — Twilio monitor ──────────────────────────────────────────
// One canonical place to verify the Twilio plumbing end-to-end:
//   • Status header  — WS connected, last Twilio webhook seen, active calls,
//     deploy SHA. Answers "is it working?" without scrolling.
//   • Live caller cards — reused LiveCallerQueue so we don't fork the format
//     the homepage already uses; this page just gives them the spotlight.
//   • Event feed — every phone-channel WebSocket frame, color-coded by type,
//     pause/resume + clear, capped at 200 lines so it stays responsive.

import { useEffect, useMemo, useState } from "react";
import LiveCallerQueue from "../_components/LiveCallerQueue";
import { useLivePhoneCallers } from "../_components/useLivePhoneCallers";
import {
  usePhoneMonitor,
  type MonitorEvent,
  type MonitorEventType,
} from "../_components/usePhoneMonitor";

interface ServerStatus {
  status?: string;
  anthropic?: boolean;
  aiActive?: boolean;
  activeSessions?: number;
  lastTwilioWebhookAt?: number | null;
}

interface VersionInfo {
  shortSha?: string;
  deployedAt?: string | null;
}

function relativeTime(ms: number | null | undefined, now: number): string {
  if (!ms) return "never";
  const delta = Math.max(0, Math.floor((now - ms) / 1000));
  if (delta < 2) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const m = Math.floor(delta / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatHms(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

const TYPE_COLORS: Record<MonitorEventType, string> = {
  session_start: "#a78bfa",
  transcription: "#e8e6ef",
  ai_analysis: "#c4b5fd",
  report_ready: "#86efac",
  session_end: "rgba(255,255,255,0.45)",
  ai_skipped: "#fbbf24",
  cluster_update: "#a78bfa",
  cluster_merged: "#f472b6",
  other: "rgba(255,255,255,0.55)",
};

export default function PhoneCallsPage() {
  const { callers, wsConnected: callersWs } = useLivePhoneCallers();
  const monitor = usePhoneMonitor();

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick the relative-time pills every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll server status every 5s for lastTwilioWebhookAt and aiActive.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch("/api/aria/status", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as ServerStatus;
        if (!cancelled) setServerStatus(data);
      } catch {
        // Network blip; pill keeps last value.
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // One-shot deploy info.
  useEffect(() => {
    fetch("/api/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v && setVersion(v))
      .catch(() => {
        // Keep version null; the pill renders "—".
      });
  }, []);

  // Prefer the freshest of (server-reported timestamp) and (latest WS event)
  // so the pill reacts instantly when a webhook fires, not just on the next poll.
  const lastWebhookEffective = useMemo(() => {
    const a = serverStatus?.lastTwilioWebhookAt ?? null;
    const b = monitor.lastEventAt ?? null;
    if (a && b) return Math.max(a, b);
    return a ?? b ?? null;
  }, [serverStatus?.lastTwilioWebhookAt, monitor.lastEventAt]);

  const wsConnected = callersWs || monitor.wsConnected;

  return (
    <div className="h-full overflow-y-auto bg-surface-lowest">
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary-dim mb-2">
            Twilio
          </p>
          <h1 className="font-display text-[44px] leading-[0.95] tracking-tight text-on-surface">
            Phone{" "}
            <span className="italic bg-gradient-to-r from-primary-dim via-primary to-brand bg-clip-text text-transparent">
              calls.
            </span>
          </h1>
          <p className="mt-3 text-[13.5px] text-on-surface-variant max-w-2xl">
            Live monitor for inbound Twilio calls. Watch the status strip to
            confirm the box is receiving webhooks, the cards to follow each
            caller as the AI extracts details, and the event feed to debug
            anything that looks off.
          </p>
        </div>

        {/* Status header strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatusPill
            label="WebSocket"
            value={wsConnected ? "Connected" : "Reconnecting…"}
            tone={wsConnected ? "ok" : "warn"}
          />
          <StatusPill
            label="Last Twilio webhook"
            value={relativeTime(lastWebhookEffective, now)}
            tone={
              !lastWebhookEffective
                ? "muted"
                : now - lastWebhookEffective < 60_000
                  ? "ok"
                  : now - lastWebhookEffective < 5 * 60_000
                    ? "warn"
                    : "muted"
            }
          />
          <StatusPill
            label="Active calls"
            value={String(callers.length)}
            tone={callers.length > 0 ? "ok" : "muted"}
          />
          <StatusPill
            label="Deploy"
            value={version?.shortSha || "—"}
            tone="muted"
          />
        </div>

        {/* Cards section */}
        <section className="mb-8">
          {callers.length > 0 ? (
            <LiveCallerQueue
              callers={callers}
              title="Active phone calls"
              subtitle="Twilio numbers · streaming as the AI extracts details"
            />
          ) : (
            <EmptyCallsCard />
          )}
        </section>

        {/* Event feed */}
        <EventFeed monitor={monitor} now={now} />
      </div>
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "muted";

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const styles =
    tone === "ok"
      ? {
          color: "#86efac",
          background: "rgba(34,197,94,0.08)",
          borderColor: "rgba(34,197,94,0.28)",
        }
      : tone === "warn"
        ? {
            color: "#fbbf24",
            background: "rgba(251,191,36,0.08)",
            borderColor: "rgba(251,191,36,0.28)",
          }
        : {
            color: "rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.12)",
          };

  return (
    <div
      className="px-4 py-3 rounded-xl border flex flex-col gap-1"
      style={{
        background: styles.background,
        borderColor: styles.borderColor,
      }}
    >
      <span
        className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {label}
      </span>
      <span
        className="text-[16px] font-semibold tabular-nums"
        style={{ color: styles.color }}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyCallsCard() {
  return (
    <div
      className="rounded-2xl border px-6 py-8 text-center"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <span
        className="material-symbols-outlined text-[28px] mb-2 inline-block"
        style={{ color: "rgba(167,139,250,0.7)" }}
      >
        ring_volume
      </span>
      <p className="text-[14px] font-semibold text-on-surface mb-1">
        No live Twilio calls
      </p>
      <p className="text-[12px] text-on-surface-variant max-w-md mx-auto">
        Place a real call to your Twilio number and the live caller card will
        appear here as the AI starts extracting details.
      </p>
    </div>
  );
}

function EventFeed({
  monitor,
  now,
}: {
  monitor: ReturnType<typeof usePhoneMonitor>;
  now: number;
}) {
  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "rgba(10,10,15,0.55)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Event feed
          </span>
          <span
            className="text-[10.5px] tabular-nums"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            {monitor.events.length} / 200
            {monitor.lastEventAt
              ? ` · last ${relativeTime(monitor.lastEventAt, now)}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => monitor.setPaused(!monitor.paused)}
            className="px-3 py-1.5 rounded-lg border text-[10.5px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              color: monitor.paused ? "#fbbf24" : "rgba(255,255,255,0.7)",
              borderColor: monitor.paused
                ? "rgba(251,191,36,0.4)"
                : "rgba(255,255,255,0.14)",
              background: monitor.paused
                ? "rgba(251,191,36,0.08)"
                : "rgba(255,255,255,0.03)",
            }}
          >
            {monitor.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={monitor.clear}
            className="px-3 py-1.5 rounded-lg border text-[10.5px] font-semibold uppercase tracking-wider"
            style={{
              color: "rgba(255,255,255,0.6)",
              borderColor: "rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className="font-mono text-[11.5px] leading-relaxed max-h-[420px] overflow-y-auto"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        {monitor.events.length === 0 ? (
          <div
            className="px-5 py-10 text-center text-[12px]"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Listening on /ws-aria. Events will stream here as Twilio calls
            arrive.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {monitor.events.map((ev) => (
              <FeedRow key={ev.id} event={ev} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FeedRow({ event }: { event: MonitorEvent }) {
  return (
    <li
      className="grid grid-cols-[110px_88px_140px_minmax(0,1fr)] gap-3 px-5 py-2 hover:bg-white/[0.02] transition-colors"
      style={{ borderColor: "rgba(255,255,255,0.04)" }}
    >
      <span style={{ color: "rgba(255,255,255,0.45)" }}>
        {formatHms(event.ts)}
      </span>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>
        {event.sessionId ? event.sessionId.slice(0, 8) : "—"}
      </span>
      <span
        className="font-bold uppercase tracking-wider text-[10.5px] self-center"
        style={{ color: TYPE_COLORS[event.type] }}
      >
        {event.type}
      </span>
      <span className="truncate" title={event.summary}>
        {event.summary}
      </span>
    </li>
  );
}
