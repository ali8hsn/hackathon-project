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
import MapView, { type MapPin } from "../_components/MapView";
import { useLivePhoneCallers } from "../_components/useLivePhoneCallers";
import {
  clusterLivePhonePins,
  type LivePhoneCluster,
} from "../_components/livePhoneClusters";
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

interface PersistedPhoneCall {
  sessionId: string;
  twilioCallSid?: string | null;
  from?: string | null;
  startedAt: number;
  endedAt?: number | null;
  lastSeen?: number;
  ticket?: {
    type?: string | null;
    location?: string | null;
    priority?: string | null;
    incidentId?: string | null;
  } | null;
  incidentId?: string | null;
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
  const { callers, pins: livePins, wsConnected: callersWs } =
    useLivePhoneCallers();
  const monitor = usePhoneMonitor();

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recentCalls, setRecentCalls] = useState<PersistedPhoneCall[]>([]);

  // Hydrate the last hour of phone calls on mount so the dashboard isn't
  // empty after a reload (the WS only delivers live frames). Re-poll once
  // an hour to slide the window and prune anything older.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const since = Date.now() - 60 * 60 * 1000;
        const r = await fetch(`/api/aria/phone-calls?since=${since}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as { calls?: PersistedPhoneCall[] };
        if (cancelled) return;
        setRecentCalls(Array.isArray(data.calls) ? data.calls : []);
      } catch {
        // Silent — the page still works with WS-only state.
      }
    }
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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

  // Cluster live callers reporting the same incident (shared incidentId or
  // ~500 m + same incident-type token). Singletons stay as 1-element groups
  // so map rendering can treat both the same way.
  const clusters = useMemo<LivePhoneCluster[]>(
    () => clusterLivePhonePins(livePins),
    [livePins]
  );

  const joinedClusters = useMemo(
    () => clusters.filter((c) => c.pins.length >= 2),
    [clusters]
  );

  // History = persisted calls from the last hour that are NOT currently
  // streaming. Sorted newest first so dispatchers can scroll back through
  // recent activity even after a server restart.
  const liveSessionIds = useMemo(
    () => new Set(callers.map((c) => c.id)),
    [callers]
  );
  const recentEnded = useMemo(() => {
    const cutoff = now - 60 * 60 * 1000;
    return recentCalls
      .filter(
        (c) => !liveSessionIds.has(c.sessionId) && c.startedAt >= cutoff
      )
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50);
  }, [recentCalls, liveSessionIds, now]);

  // Map markers: one per cluster centroid. Joined clusters render as a
  // bigger amber bubble with the count baked in (MapView reads `count`).
  const mapPins = useMemo<MapPin[]>(
    () =>
      clusters.map((c) => {
        const isJoined = c.pins.length >= 2;
        const sample = c.pins[0];
        const label = isJoined
          ? `${c.pins.length} joined callers`
          : sample.phone;
        const sublabel = isJoined
          ? c.type || c.location || `${c.pins.length} callers`
          : sample.ticket?.type || sample.ticket?.location || undefined;
        return {
          id: `cluster:${c.id}`,
          lat: c.lat,
          lng: c.lng,
          label,
          sublabel,
          color: "#f59e0b",
          active: true,
          count: isJoined ? c.pins.length : undefined,
        };
      }),
    [clusters]
  );

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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
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
            label="Joined incidents"
            value={String(joinedClusters.length)}
            tone={joinedClusters.length > 0 ? "warn" : "muted"}
          />
          <StatusPill
            label="Deploy"
            value={version?.shortSha || "—"}
            tone="muted"
          />
        </div>

        {/* Live caller map */}
        <section className="mb-6">
          <div
            className="rounded-3xl overflow-hidden border"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              background: "rgba(24, 24, 34, 0.6)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{
                    fontVariationSettings: "'FILL' 1",
                    color: "#f59e0b",
                  }}
                >
                  location_on
                </span>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "white" }}
                >
                  Live caller map
                </p>
              </div>
              <p
                className="text-[10px] font-mono"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {livePins.length} live pin{livePins.length === 1 ? "" : "s"}
                {joinedClusters.length > 0
                  ? ` · ${joinedClusters.length} joined`
                  : ""}
              </p>
            </div>
            <div className="relative h-[380px]">
              <MapView pins={mapPins} />
              {mapPins.length === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ background: "rgba(10,10,15,0.35)" }}
                >
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full border"
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      borderColor: "rgba(255,255,255,0.16)",
                      background: "rgba(10,10,15,0.65)",
                    }}
                  >
                    Awaiting live calls
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Joined-incident clusters — only shown when 2+ callers look like
            they're reporting the same event. */}
        {joinedClusters.length > 0 && (
          <JoinedIncidents
            clusters={joinedClusters}
            callers={callers}
            now={now}
          />
        )}

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

        {/* Persisted recent calls (last hour) — survives server restarts. */}
        {recentEnded.length > 0 && (
          <RecentCallsSection calls={recentEnded} now={now} />
        )}

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

function JoinedIncidents({
  clusters,
  callers,
  now,
}: {
  clusters: LivePhoneCluster[];
  callers: ReturnType<typeof useLivePhoneCallers>["callers"];
  now: number;
}) {
  // Map session id → caller so we can show status / elapsed for each chip
  // without re-deriving them from the raw WS frames.
  const callerById = useMemo(() => {
    const map = new Map<string, (typeof callers)[number]>();
    for (const c of callers) map.set(c.id, c);
    return map;
  }, [callers]);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ background: "#f59e0b" }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ background: "#f59e0b" }}
              />
            </span>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-on-surface">
              Joined incidents
            </h2>
            <span
              className="text-[11px]"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {clusters.length} group{clusters.length === 1 ? "" : "s"} ·{" "}
              {clusters.reduce((acc, c) => acc + c.pins.length, 0)} callers
            </span>
          </div>
          <p
            className="text-[12px]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Multiple callers reporting the same event — merged by location +
            incident type.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clusters.map((c) => (
          <article
            key={c.id}
            className="rounded-2xl border p-4 flex flex-col gap-3"
            style={{
              background:
                "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(24,24,34,0.6))",
              borderColor: "rgba(245,158,11,0.32)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1"
                  style={{ color: "#fbbf24" }}
                >
                  Mass-event cluster
                </p>
                <p className="text-[15px] font-semibold text-on-surface truncate">
                  {c.type || "Unclassified incident"}
                </p>
                {c.location && (
                  <p
                    className="text-[12px] truncate"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    {c.location}
                  </p>
                )}
              </div>
              <span
                className="shrink-0 inline-flex items-center justify-center rounded-full h-9 min-w-9 px-2 text-[13px] font-extrabold"
                style={{
                  background: "rgba(245,158,11,0.18)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245,158,11,0.45)",
                }}
                title={`${c.pins.length} callers joined into one bubble on the map`}
              >
                ×{c.pins.length}
              </span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {c.pins.map((p) => {
                const caller = callerById.get(p.sessionId);
                const elapsed = caller
                  ? Math.max(
                      0,
                      Math.floor((now - caller.startedAt) / 1000)
                    )
                  : null;
                const status = caller?.status ?? "triaging";
                const statusColor =
                  status === "ready"
                    ? "#86efac"
                    : status === "ringing"
                      ? "#fbbf24"
                      : "#a78bfa";
                return (
                  <li
                    key={p.sessionId}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg"
                    style={{ background: "rgba(0,0,0,0.25)" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: statusColor }}
                      />
                      <span className="text-[12px] font-mono truncate text-on-surface">
                        {p.phone}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 text-[10.5px] font-mono shrink-0"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                    >
                      <span
                        className="uppercase tracking-wider"
                        style={{ color: statusColor }}
                      >
                        {status}
                      </span>
                      {elapsed != null && (
                        <span>
                          {Math.floor(elapsed / 60)}:
                          {String(elapsed % 60).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentCallsSection({
  calls,
  now,
}: {
  calls: PersistedPhoneCall[];
  now: number;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-on-surface mb-1">
            Recent calls · last hour
          </h2>
          <p
            className="text-[12px]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Persisted to Mongo so the dashboard hydrates after a reload or
            server restart.
          </p>
        </div>
        <span
          className="text-[10.5px] font-mono"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {calls.length} call{calls.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul
        className="rounded-2xl border overflow-hidden divide-y"
        style={{
          background: "rgba(24,24,34,0.5)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {calls.map((c) => {
          const ended = c.endedAt || c.lastSeen || c.startedAt;
          const duration = Math.max(0, Math.floor((ended - c.startedAt) / 1000));
          const mm = Math.floor(duration / 60);
          const ss = String(duration % 60).padStart(2, "0");
          const ago = relativeTime(c.startedAt, now);
          const incidentId = c.incidentId || c.ticket?.incidentId || null;
          return (
            <li
              key={c.sessionId}
              className="grid grid-cols-[160px_minmax(0,1fr)_120px_120px_120px] gap-3 px-4 py-2.5 text-[12px]"
              style={{ borderColor: "rgba(255,255,255,0.04)" }}
            >
              <span
                className="font-mono truncate"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {c.from || "Unknown"}
              </span>
              <span
                className="truncate text-on-surface"
                title={c.ticket?.type || ""}
              >
                {c.ticket?.type || "—"}
                {c.ticket?.location ? (
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>
                    {" · "}
                    {c.ticket.location}
                  </span>
                ) : null}
              </span>
              <span
                className="font-mono tabular-nums"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                {mm}:{ss}
              </span>
              <span
                className="font-mono"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                {ago}
              </span>
              {incidentId ? (
                <a
                  href={`/situation-sheet/${incidentId}`}
                  className="font-mono text-[11px] underline"
                  style={{ color: "#a78bfa" }}
                >
                  view incident
                </a>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
