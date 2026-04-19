"use client";

// ─── Siren AI — homepage ──────────────────────────────────────────────────
// Harmonic-style scroll-into-color:
//   1. Cream hero (editorial serif headline + CTAs)
//   2. Violet → ink transition curtain with a tagline
//   3. Dark dispatch console (severity-sorted feed + right-side map)
//
// Layout uses stacked <section>s; scroll flows top → bottom through the
// colour stages. Inline styles are used for critical gradients/colours to
// bypass any Tailwind class-generation concerns.

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Link from "next/link";
import type { Incident } from "./_lib/types";
import MapView, { type MapPin } from "./_components/MapView";
import LiveCallerQueue, {
  type LiveCaller,
} from "./_components/LiveCallerQueue";
import { useLivePhoneCallers } from "./_components/useLivePhoneCallers";
import { useHighPriorityChime } from "./_components/useHighPriorityChime";
import { useDemo } from "./_components/DemoHost";
import { useLiveClusters } from "./_components/useLiveClusters";
import ClusterCards from "./_components/ClusterCards";

// ─── Severity model ───────────────────────────────────────────────────────
// Prefer the AI-detected severity stored on the incident (Gemini scorer in
// app/_lib/gemini-severity.ts). Fall back to a deterministic heuristic for
// older rows that haven't been backfilled yet.
function severityScore(i: Incident): number {
  if (typeof i.severityScore === "number" && i.severityScore > 0) {
    return Math.max(1, Math.min(10, Math.round(i.severityScore)));
  }
  const base =
    i.priority === "HIGH" ? 9 : i.priority === "MEDIUM" ? 6 : 3;
  const casualtyBump = Math.min(2, Math.floor((i.casualties ?? 0) / 2));
  const low =
    i.priority === "LOW" ||
    (i.confidenceScore && i.confidenceScore < 35) ? 1 : 0;
  return Math.max(1, Math.min(10, base + casualtyBump - low));
}

function severityHex(score: number): string {
  const ramp: Record<number, string> = {
    1: "#2dd4bf",
    2: "#4ade80",
    3: "#a3e635",
    4: "#facc15",
    5: "#fb923c",
    6: "#f97316",
    7: "#ef4444",
    8: "#dc2626",
    9: "#b91c1c",
    10: "#7f1d1d",
  };
  return ramp[Math.max(1, Math.min(10, Math.round(score)))];
}

function jotNotes(incident: Incident): string[] {
  const out: string[] = [];
  if (incident.casualties > 0) {
    out.push(
      `${incident.casualties} reported ${incident.casualties === 1 ? "victim" : "victims"}`
    );
  }
  const hazards = (incident.aggregatedDetails ?? [])
    .filter((d) => /hazard|risk|danger/i.test(d.label || ""))
    .map((d) => d.value)
    .slice(0, 2);
  out.push(...hazards);
  if (incident.unitsAssigned?.length) {
    out.push(`Units: ${incident.unitsAssigned.slice(0, 3).join(", ")}`);
  }
  if (out.length < 2 && incident.description) {
    const clean = incident.description
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    out.push(clean.length > 140 ? `${clean.slice(0, 137)}…` : clean);
  }
  return out.slice(0, 3);
}

function formatTime(incident: Incident): string {
  if (incident.elapsedTime && /[0-9]/.test(incident.elapsedTime)) {
    const [mins, secs] = incident.elapsedTime.split(":").map(Number);
    if (!Number.isNaN(mins)) {
      if (mins < 1 && !Number.isNaN(secs)) return `${secs || 0}s ago`;
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m ago`;
    }
    return incident.elapsedTime;
  }
  return "just now";
}

// ─── Reveal hook ──────────────────────────────────────────────────────────
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // "Live only" demo mode hides the saved-incident feed + map pins so the
  // dashboard cleanly showcases inbound Twilio callers as they arrive.
  // Persisted to localStorage so a presenter doesn't have to re-toggle on
  // every refresh during the hookathon demo.
  const [liveOnly, setLiveOnly] = useState(false);
  useEffect(() => {
    try {
      setLiveOnly(localStorage.getItem("siren.liveOnly") === "1");
    } catch {
      // ignore (private mode, etc.)
    }
  }, []);
  const toggleLiveOnly = useCallback(() => {
    setLiveOnly((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("siren.liveOnly", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const { callers: liveCallers, pins: livePins } = useLivePhoneCallers();
  const { clusters, mergeCluster } = useLiveClusters();
  const demo = useDemo();

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
        /* offline */
      }
    }
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, []);

  const sorted = useMemo(() => {
    return incidents
      .map((i) => ({ incident: i, score: severityScore(i) }))
      .sort((a, b) => b.score - a.score);
  }, [incidents]);

  // Keys for the chime hook — only HIGH/CRITICAL items are eligible to ding.
  const highCallerKeys = useMemo(
    () =>
      liveCallers
        .filter((c) => c.priority === "HIGH")
        .map((c) => c.id),
    [liveCallers]
  );
  const highIncidentKeys = useMemo(
    () =>
      incidents
        .filter((i) => i.priority === "HIGH")
        .map((i) => i.id),
    [incidents]
  );
  useHighPriorityChime({
    liveCallerKeys: highCallerKeys,
    incidentKeys: highIncidentKeys,
  });

  const pins = useMemo<MapPin[]>(() => {
    // Live phone calls render in amber so dispatchers visually distinguish
    // an active caller from a saved incident. They drop off the map when
    // session_end fires and reappear (with severity color) once the call
    // is persisted to MongoDB on the next /api/incidents poll.
    const phonePins: MapPin[] = livePins.map((p) => ({
      id: `live:${p.sessionId}`,
      lat: p.lat,
      lng: p.lng,
      label: p.phone,
      sublabel: p.ticket?.type || p.ticket?.location || undefined,
      color: "#f59e0b",
      active: true,
    }));
    if (liveOnly) return phonePins;
    const incidentPins: MapPin[] = sorted
      .filter(({ incident }) => {
        const { lat, lng } = incident.coordinates || {};
        return (
          typeof lat === "number" &&
          typeof lng === "number" &&
          lat !== 0 &&
          lng !== 0
        );
      })
      .map(({ incident, score }) => ({
        id: incident.id,
        lat: incident.coordinates.lat,
        lng: incident.coordinates.lng,
        label: incident.title,
        severity: score,
        active: hoveredId === incident.id,
      }));
    return [...incidentPins, ...phonePins];
  }, [sorted, hoveredId, livePins, liveOnly]);

  const highCount = incidents.filter((i) => i.priority === "HIGH").length;
  const medCount = incidents.filter((i) => i.priority === "MEDIUM").length;
  const lowCount = incidents.filter((i) => i.priority === "LOW").length;

  const handlePinClick = useCallback((pin: MapPin) => {
    const el = document.getElementById(`incident-${pin.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const scrollToConsole = useCallback(() => {
    const el = document.getElementById("console");
    el?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      {/* ── HERO (cream) ───────────────────────────────────────────── */}
      <section
        className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-8 py-24 overflow-hidden"
        style={{ background: "#faf7f2", color: "#0a0a0f" }}
      >
        {/* Subtle grid texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(10,10,15,1) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,15,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />

        <div className="relative max-w-4xl text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.28em] mb-6 flex items-center justify-center gap-3"
            style={{ color: "rgba(10,10,15,0.5)" }}
          >
            <span
              className="h-px w-8"
              style={{ background: "rgba(10,10,15,0.2)" }}
            />
            Siren AI · Dispatch console
            {isLive && (
              <span
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: "rgba(167,139,250,0.4)",
                  background: "rgba(167,139,250,0.08)",
                  color: "#7c3aed",
                }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                    style={{ background: "#7c3aed" }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: "#7c3aed" }}
                  />
                </span>
                Live
              </span>
            )}
            <span
              className="h-px w-8"
              style={{ background: "rgba(10,10,15,0.2)" }}
            />
          </p>

          <h1
            className="font-display tracking-tight"
            style={{
              fontSize: "clamp(48px, 9vw, 112px)",
              lineHeight: "0.95",
              color: "#0a0a0f",
            }}
          >
            Every 911 call,
            <br />
            <span style={{ fontStyle: "italic", color: "#6d28d9" }}>
              treated with the same care.
            </span>
          </h1>

          <p
            className="mt-8 mx-auto text-[17px] leading-relaxed max-w-xl"
            style={{ color: "rgba(10,10,15,0.65)" }}
          >
            Siren AI stays on the line with every caller — listening, taking
            notes, and surfacing context so no one waits alone for help.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => demo.openDemo()}
              className="group relative flex items-center gap-2 pl-5 pr-6 py-3 rounded-full transition-all overflow-hidden"
              style={{
                background: "#0a0a0f",
                color: "white",
                boxShadow: "0 8px 28px rgba(10,10,15,0.25)",
              }}
            >
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background:
                    "linear-gradient(90deg, #a78bfa 0%, #7c3aed 100%)",
                }}
              />
              <span
                className="material-symbols-outlined text-[18px] relative"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                play_circle
              </span>
              <span className="relative text-[13px] font-semibold">
                Play demo
              </span>
            </button>
            <button
              onClick={scrollToConsole}
              className="flex items-center gap-2 pl-5 pr-5 py-3 rounded-full border transition-colors text-[13px] font-semibold"
              style={{
                borderColor: "rgba(10,10,15,0.18)",
                color: "#0a0a0f",
                background: "rgba(255,255,255,0.4)",
              }}
            >
              See the console
              <span className="material-symbols-outlined text-[18px]">
                arrow_downward
              </span>
            </button>
          </div>

          {/* Trust strip */}
          <div
            className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[11px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: "rgba(10,10,15,0.4)" }}
          >
            <span
              className="text-[9.5px] font-bold tracking-[0.24em]"
              style={{ color: "rgba(10,10,15,0.35)" }}
            >
              Built for 911 PSAPs
            </span>
            <div
              className="h-3 w-px"
              style={{ background: "rgba(10,10,15,0.15)" }}
            />
            <span>Every caller heard</span>
            <div
              className="h-3 w-px"
              style={{ background: "rgba(10,10,15,0.15)" }}
            />
            <span>24/7 listening</span>
            <div
              className="h-3 w-px"
              style={{ background: "rgba(10,10,15,0.15)" }}
            />
            <span>Multi-caller fusion</span>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
          style={{ color: "rgba(10,10,15,0.4)" }}
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.22em]">
            Scroll
          </span>
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ animation: "siren-float 2s ease-in-out infinite" }}
          >
            keyboard_arrow_down
          </span>
        </div>
      </section>

      {/* ── TRANSITION (cream → violet → ink) ──────────────────────── */}
      <section
        className="relative flex items-center justify-center px-8 overflow-hidden"
        style={{
          minHeight: "60vh",
          background:
            "linear-gradient(to bottom, #faf7f2 0%, #ddd6fe 22%, #8b5cf6 58%, #2e1065 82%, #0a0a0f 100%)",
        }}
      >
        {/* Floating orbs */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 30%, rgba(255,255,255,0.25), transparent 40%), radial-gradient(circle at 15% 70%, rgba(167,139,250,0.4), transparent 45%)",
          }}
        />
        <TransitionContent />
      </section>

      {/* ── DASHBOARD (ink) ─────────────────────────────────────────── */}
      <section
        id="console"
        className="min-h-screen px-8 py-14"
        style={{ background: "#0a0a0f" }}
      >
        <div className="mx-auto max-w-[1600px]">
          <DashboardHeader
            totalOpen={incidents.length}
            highCount={highCount}
            medCount={medCount}
            lowCount={lowCount}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px] gap-6 items-start">
            {/* FEED */}
            <div>
              {clusters.length > 0 && (
                <div className="mb-6">
                  <ClusterCards
                    clusters={clusters}
                    onMerge={mergeCluster}
                  />
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                >
                  Twilio
                  {liveCallers.length > 0 ? ` · ${liveCallers.length} live` : ""}
                </span>
                <Link
                  href="/phone-calls"
                  className="group inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
                  style={{ color: "rgba(167,139,250,0.85)" }}
                >
                  View live phone monitor
                  <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">
                    arrow_forward
                  </span>
                </Link>
              </div>
              {liveCallers.length > 0 && (
                <div className="mb-6">
                  <LiveCallerQueue
                    callers={liveCallers}
                    title="Live calls"
                    subtitle="Twilio numbers · streaming as the AI extracts details"
                  />
                </div>
              )}
              {liveOnly ? (
                <div
                  className="rounded-2xl border px-5 py-4 flex items-center gap-3"
                  style={{
                    borderColor: "rgba(245,158,11,0.28)",
                    background: "rgba(245,158,11,0.06)",
                  }}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: "#f59e0b" }}
                  >
                    bolt
                  </span>
                  <div className="flex-1">
                    <p
                      className="text-[11px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: "#fbbf24" }}
                    >
                      Live-only demo mode
                    </p>
                    <p
                      className="text-[12px] mt-0.5"
                      style={{ color: "rgba(255,255,255,0.7)" }}
                    >
                      Showing only inbound Twilio calls. Saved incidents hidden
                      for the demo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleLiveOnly}
                    className="text-[10.5px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-lg border"
                    style={{
                      color: "rgba(255,255,255,0.85)",
                      borderColor: "rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    Show all
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="h-px flex-1"
                      style={{
                        background:
                          "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)",
                      }}
                    />
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.22em]"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      Active situations · {sorted.length}
                      {liveCallers.length > 0
                        ? ` · ${liveCallers.length} live`
                        : ""}
                    </span>
                    <span
                      className="h-px flex-1"
                      style={{
                        background:
                          "linear-gradient(to right, rgba(255,255,255,0.1), transparent, transparent)",
                      }}
                    />
                  </div>

                  {sorted.length === 0 ? (
                    <EmptyFeed onPlayDemo={() => demo.openDemo()} />
                  ) : (
                    <ul className="space-y-3">
                      {sorted.map(({ incident, score }, idx) => (
                        <IncidentBlock
                          key={incident.id}
                          incident={incident}
                          score={score}
                          index={idx}
                          isHovered={hoveredId === incident.id}
                          onHover={setHoveredId}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* MAP */}
            <aside className="xl:sticky xl:top-24">
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
                        color: liveOnly ? "#f59e0b" : "#a78bfa",
                      }}
                    >
                      location_on
                    </span>
                    <p
                      className="text-[11px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: "white" }}
                    >
                      Caller map
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleLiveOnly}
                      title={
                        liveOnly
                          ? "Showing only live Twilio calls — click to also show saved incidents"
                          : "Show only live Twilio calls (hide saved incidents)"
                      }
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9.5px] font-bold uppercase tracking-[0.16em] transition-colors"
                      style={{
                        color: liveOnly ? "#f59e0b" : "rgba(255,255,255,0.65)",
                        borderColor: liveOnly
                          ? "rgba(245,158,11,0.45)"
                          : "rgba(255,255,255,0.16)",
                        background: liveOnly
                          ? "rgba(245,158,11,0.10)"
                          : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: liveOnly ? "#f59e0b" : "rgba(255,255,255,0.4)",
                          boxShadow: liveOnly ? "0 0 8px #f59e0b" : "none",
                        }}
                      />
                      {liveOnly ? "Live only" : "Demo: live only"}
                    </button>
                    <p
                      className="text-[10px] font-mono"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      {pins.length} pin{pins.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="relative h-[560px]">
                  <MapView pins={pins} onPinClick={handlePinClick} />
                </div>
                <div
                  className="px-5 py-3 border-t flex items-center justify-between"
                  style={{
                    borderColor: "rgba(255,255,255,0.06)",
                    background: "rgba(10,10,15,0.4)",
                  }}
                >
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    Severity
                  </p>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                      <span
                        key={s}
                        title={`Severity ${s}`}
                        className="h-3 w-3 rounded-sm"
                        style={{ background: severityHex(s) }}
                      />
                    ))}
                  </div>
                  <div
                    className="flex items-center gap-1 text-[9.5px]"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    <span>1</span>
                    <span>→</span>
                    <span style={{ color: "#ff3a3a", fontWeight: 700 }}>
                      10
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Demo overlay is mounted at layout level via <DemoHost /> so it
          survives client-side navigations triggered by the demo itself. */}
    </div>
  );
}

// ─── Transition content ───────────────────────────────────────────────────
function TransitionContent() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal relative max-w-3xl text-center">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.28em] mb-5"
        style={{ color: "rgba(255,255,255,0.8)" }}
      >
        Meet the console
      </p>
      <h2
        className="font-display tracking-tight"
        style={{
          fontSize: "clamp(32px, 5vw, 56px)",
          lineHeight: "1.05",
          color: "white",
        }}
      >
        Dispatchers can&apos;t read minds.{" "}
        <span style={{ fontStyle: "italic", color: "#ddd6fe" }}>
          But they can read Siren.
        </span>
      </h2>
      <p
        className="mt-6 mx-auto text-[15px] leading-relaxed max-w-xl"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        A single glance surfaces severity, location, and the caller&apos;s own
        words — sorted by urgency so the worst fire gets picked up first.
      </p>
    </div>
  );
}

// ─── Dashboard header ─────────────────────────────────────────────────────
function DashboardHeader({
  totalOpen,
  highCount,
  medCount,
  lowCount,
}: {
  totalOpen: number;
  highCount: number;
  medCount: number;
  lowCount: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal flex flex-wrap items-end justify-between gap-6 mb-8"
    >
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.24em] mb-2.5"
          style={{ color: "#a78bfa" }}
        >
          Dispatch queue
        </p>
        <h2
          className="font-display tracking-tight"
          style={{
            fontSize: "clamp(32px, 4vw, 48px)",
            lineHeight: "1",
            color: "white",
          }}
        >
          Sorted by{" "}
          <span style={{ fontStyle: "italic", color: "#a78bfa" }}>
            severity.
          </span>
        </h2>
        <p
          className="mt-3 text-[13.5px] max-w-xl"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          {totalOpen} open {totalOpen === 1 ? "situation" : "situations"} — the
          highest-severity calls rise to the top automatically.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <StatChip count={highCount} label="High" score={9} />
        <StatChip count={medCount} label="Medium" score={6} />
        <StatChip count={lowCount} label="Low" score={3} />
      </div>
    </div>
  );
}

// ─── Incident block card ──────────────────────────────────────────────────
function IncidentBlock({
  incident,
  score,
  index,
  isHovered,
  onHover,
}: {
  incident: Incident;
  score: number;
  index: number;
  isHovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const ref = useReveal<HTMLLIElement>();
  const hex = severityHex(score);
  const notes = jotNotes(incident);
  const tintStrength = Math.max(0.14, Math.min(0.42, score / 22));

  const tintHex = Math.round(tintStrength * 255)
    .toString(16)
    .padStart(2, "0");

  return (
    <li
      ref={ref}
      id={`incident-${incident.id}`}
      className="reveal"
      style={{ animationDelay: `${Math.min(index * 60, 400)}ms` }}
      onMouseEnter={() => onHover(incident.id)}
      onMouseLeave={() => onHover(null)}
    >
      <Link
        href={`/situation-sheet/${incident.id}`}
        className="group relative block rounded-2xl border p-5 transition-all duration-300"
        style={{
          background: `linear-gradient(135deg, ${hex}${tintHex} 0%, rgba(24,24,34,0.9) 70%)`,
          borderColor: isHovered ? `${hex}80` : "rgba(255,255,255,0.08)",
          boxShadow: isHovered
            ? `0 0 0 1px ${hex}66, 0 12px 40px -8px ${hex}55`
            : "0 4px 16px rgba(0,0,0,0.3)",
        }}
      >
        <span
          aria-hidden
          className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
          style={{ background: hex, boxShadow: `0 0 14px ${hex}99` }}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                background: `${hex}22`,
                borderColor: `${hex}55`,
              }}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{
                  fontVariationSettings: "'FILL' 1 'wght' 500",
                  color: hex,
                }}
              >
                {incident.icon || "emergency"}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <PriorityBadge priority={incident.priority} />
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  · {formatTime(incident)}
                </span>
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  · #{incident.id.slice(0, 6)}
                </span>
              </div>
              <h3
                className="text-[17px] font-bold leading-tight tracking-tight truncate transition-colors"
                style={{ color: isHovered ? "white" : "#e8e6ef" }}
              >
                {incident.title}
              </h3>
              <div
                className="flex items-center gap-1.5 mt-1 text-[13px]"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                <span className="material-symbols-outlined text-[14px]">
                  location_on
                </span>
                <span className="truncate">{incident.location}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Severity
            </span>
            <div className="flex items-baseline gap-0.5">
              <span
                className="font-display font-black"
                style={{
                  fontSize: "38px",
                  lineHeight: 1,
                  color: hex,
                  textShadow: `0 0 20px ${hex}66`,
                }}
              >
                {score}
              </span>
              <span
                className="text-[12px] font-bold"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                /10
              </span>
            </div>
          </div>
        </div>

        {notes.length > 0 && (
          <div
            className="mt-4 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-1.5"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            {notes.map((n, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 text-[12px]"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                <span
                  className="h-1 w-1 rounded-full shrink-0"
                  style={{ background: hex }}
                />
                <span className="truncate max-w-[320px]">{n}</span>
              </span>
            ))}
          </div>
        )}

        <span className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1">
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: hex }}
          >
            arrow_forward
          </span>
        </span>
      </Link>
    </li>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: "HIGH" | "MEDIUM" | "LOW";
}) {
  const styles =
    priority === "HIGH"
      ? { background: "#ff3a3a", color: "white" }
      : priority === "MEDIUM"
        ? {
            background: "rgba(251,191,36,0.14)",
            color: "#fbbf24",
            border: "1px solid rgba(251,191,36,0.3)",
          }
        : {
            background: "rgba(148,163,184,0.14)",
            color: "rgba(255,255,255,0.6)",
          };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.18em]"
      style={styles}
    >
      {priority}
    </span>
  );
}

function StatChip({
  count,
  label,
  score,
}: {
  count: number;
  label: string;
  score: number;
}) {
  const hex = severityHex(score);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
      style={{
        background: "rgba(24, 24, 34, 0.6)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: hex, boxShadow: `0 0 8px ${hex}99` }}
      />
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: "rgba(255,255,255,0.65)" }}
      >
        {label}
      </span>
      <span
        className="text-[11px] font-black tabular-nums"
        style={{ color: "white" }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyFeed({ onPlayDemo }: { onPlayDemo: () => void }) {
  return (
    <div
      className="rounded-3xl border border-dashed py-16 px-8 flex flex-col items-center text-center"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(24, 24, 34, 0.4)",
      }}
    >
      <div
        className="relative h-16 w-16 rounded-full flex items-center justify-center mb-4 border"
        style={{
          background: "rgba(167,139,250,0.1)",
          borderColor: "rgba(167,139,250,0.3)",
        }}
      >
        <span
          className="material-symbols-outlined text-3xl"
          style={{
            fontVariationSettings: "'FILL' 1",
            color: "#a78bfa",
          }}
        >
          shield
        </span>
        <span className="absolute inset-0 rounded-full animate-[siren-pulse-ring_1.8s_ease-out_infinite]" />
      </div>
      <h3
        className="text-xl font-bold tracking-tight mb-2"
        style={{ color: "white" }}
      >
        All clear
      </h3>
      <p
        className="text-[13.5px] max-w-md leading-relaxed"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        No active situations. When a caller connects, Siren AI will transcribe,
        triage, and score the call here in real time.
      </p>
      <button
        onClick={onPlayDemo}
        className="mt-5 flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-bold uppercase tracking-[0.16em] transition-colors"
        style={{
          borderColor: "rgba(167,139,250,0.4)",
          background: "rgba(167,139,250,0.1)",
          color: "#c4b5fd",
        }}
      >
        <span
          className="material-symbols-outlined text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          play_circle
        </span>
        See a simulated call
      </button>
    </div>
  );
}
