"use client";

// ─── DemoController ─────────────────────────────────────────────────────────
// Narrated walkthrough of Siren's core features. The demo physically
// traverses the site (homepage → situation sheet → phone calls → reports →
// trend detection → intake) so a viewer sees every page light up. Step
// transitions used to be driven by audio.currentTime on a pre-recorded MP3,
// but the audio playback was a "fake CLI" that added zero signal — now the
// timeline is just a wall-clock setInterval. Caller state is still emitted
// so the homepage can render LiveCallerQueue with fields populating in real
// time.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LiveCaller } from "./LiveCallerQueue";

// `route` is interpolated client-side: any "{demoId}" token gets replaced
// with the most-recent HIGH-priority incident id we resolve at demo start.
// That keeps the demo robust as new incidents arrive — no hard-coded id rot.
export const DEMO_STEPS: {
  atSec: number;
  title: string;
  body: string;
  caller?: Partial<LiveCaller>;
  route?: string;
  spotlight?:
    | "queue"
    | "report"
    | "transcripts"
    | "conflicts"
    | "haashir"
    | "trend"
    | "intake";
}[] = [
  {
    atSec: 0,
    title: "Incoming 911 call",
    body: "Caller connects. Siren auto-transcribes in the background and begins building a ticket before a dispatcher picks up.",
    spotlight: "queue",
    route: "/",
    caller: {
      status: "ringing",
      phone: "+1 512 ••• 0471",
      confidence: 8,
    },
  },
  {
    atSec: 5,
    title: "AI intake engages",
    body: "While the caller is on hold, Siren's AI agent asks calming, structured questions and streams answers into the ticket.",
    spotlight: "queue",
    route: "/",
    caller: {
      status: "triaging",
      nature: "Structure fire — residential",
      confidence: 34,
    },
  },
  {
    atSec: 11,
    title: "Location extracted",
    body: "Claude pulls the address out of the caller's speech — no dispatcher typing needed.",
    spotlight: "queue",
    route: "/",
    caller: {
      status: "triaging",
      nature: "Structure fire — residential",
      location: "2204 Rio Grande St, Austin TX",
      confidence: 56,
    },
  },
  {
    atSec: 17,
    title: "Victims and hazards flagged",
    body: "Number of people trapped and environmental hazards are detected and surfaced before the call is even transferred.",
    spotlight: "queue",
    route: "/",
    caller: {
      status: "triaging",
      nature: "Structure fire — residential, person trapped",
      location: "2204 Rio Grande St, Austin TX",
      victims: 1,
      hazards: ["Heavy smoke", "2nd-floor trapped", "Gas line adjacent"],
      priority: "HIGH",
      confidence: 78,
    },
  },
  {
    atSec: 24,
    title: "Situation sheet ready",
    body: "A complete situation sheet — with AI report, severity, dispatch recommendation — is live in under 30 seconds.",
    spotlight: "report",
    route: "/situation-sheet/{demoId}",
    caller: {
      status: "ready",
      nature: "Structure fire — person trapped, 2nd floor",
      location: "2204 Rio Grande St, Austin TX",
      victims: 1,
      hazards: ["Heavy smoke", "2nd-floor trapped", "Gas line adjacent"],
      priority: "HIGH",
      confidence: 92,
    },
  },
  {
    atSec: 32,
    title: "Phone monitor — Twilio plumbing live",
    body: "The Phone Calls monitor shows the last webhook hit, every active call on a live map, and a streaming event feed for Twilio.",
    spotlight: "report",
    route: "/phone-calls",
  },
  {
    atSec: 40,
    title: "Reports archive",
    body: "Every triaged call lands in the reports archive — sortable, searchable, with an overview map of every incident location.",
    spotlight: "report",
    route: "/reports",
  },
  {
    atSec: 47,
    title: "Trend detection",
    body: "Siren scans low-priority chatter for emerging patterns and escalates clusters before they become emergencies.",
    spotlight: "trend",
    route: "/trend-detection",
  },
  {
    atSec: 54,
    title: "Voice intake — where the calls land",
    body: "ARIA answers callers in their language, transcribes in real time, and feeds Siren the structured ticket you just saw.",
    spotlight: "intake",
    route: "/intake/",
  },
];

// Total duration of the auto-traversal, including a 6s tail on the last step.
const DEMO_TOTAL_SEC = DEMO_STEPS[DEMO_STEPS.length - 1].atSec + 6;

interface Props {
  open: boolean;
  onClose: () => void;
  onCallerUpdate?: (caller: LiveCaller | null) => void;
  onStepChange?: (spotlight: string | undefined) => void;
}

export default function DemoController({
  open,
  onClose,
  onCallerUpdate,
  onStepChange,
}: Props) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [demoIncidentId, setDemoIncidentId] = useState<string | null>(null);
  // Track the last route we pushed so we don't spam router.push on every
  // tick — only navigate when the step actually changes.
  const lastRouteRef = useRef<string | null>(null);

  // Resolve the demo's situation-sheet target on open. Pick the most-recent
  // HIGH incident; fall back to anything we can find.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/incidents")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; priority?: string }>) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const high = rows.find((r) => r.priority === "HIGH");
        setDemoIncidentId((high ?? rows[0]).id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Drive the timeline with a plain interval — no audio, no scrubber. When
  // we reach the end, hold on the last step until the user closes.
  useEffect(() => {
    if (!open || !isPlaying) return;
    const id = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.25;
        if (next >= DEMO_TOTAL_SEC) {
          setIsPlaying(false);
          return DEMO_TOTAL_SEC;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [open, isPlaying]);

  // Auto-play on open, reset on close.
  useEffect(() => {
    if (open) {
      setElapsed(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [open]);

  const currentStepIdx = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (DEMO_STEPS[i].atSec <= elapsed) idx = i;
      else break;
    }
    return idx;
  }, [elapsed]);

  // Emit caller state + push routes whenever the step index changes.
  useEffect(() => {
    if (!open) {
      onCallerUpdate?.(null);
      return;
    }
    const merged: LiveCaller = {
      id: "demo-call",
      phone: "+1 512 ••• 0471",
      startedAt: Date.now() - elapsed * 1000,
      status: "ringing",
    };
    for (let i = 0; i <= currentStepIdx; i++) {
      Object.assign(merged, DEMO_STEPS[i].caller ?? {});
    }
    onCallerUpdate?.(merged);
    const step = DEMO_STEPS[currentStepIdx];
    onStepChange?.(step?.spotlight);

    if (step?.route) {
      const resolved = step.route.replace(
        "{demoId}",
        demoIncidentId ?? ""
      );
      // If the demoId hasn't loaded yet, skip the situation-sheet hop and
      // stay on whatever page we're on rather than navigating to /situation-sheet/.
      const safe =
        resolved.includes("/situation-sheet/") && !demoIncidentId
          ? null
          : resolved;
      if (safe && safe !== lastRouteRef.current) {
        lastRouteRef.current = safe;
        router.push(safe);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIdx, open, demoIncidentId]);

  const handleClose = useCallback(() => {
    setIsPlaying(false);
    setElapsed(0);
    lastRouteRef.current = null;
    onClose();
    // Bring the dispatcher back home so the demo always finishes on the
    // hero rather than orphaned on /intake or /phone-calls.
    router.push("/");
  }, [onClose, router]);

  const handleRestart = useCallback(() => {
    lastRouteRef.current = null;
    setElapsed(0);
    setIsPlaying(true);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  if (!open) return null;

  const step = DEMO_STEPS[currentStepIdx];
  const pct = Math.min(100, (elapsed / DEMO_TOTAL_SEC) * 100);

  // The demo card is intentionally compact and bottom-anchored so it doesn't
  // cover the page being toured. Click outside still closes (handled by the
  // backdrop pointer-events).
  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none"
    >
      {/* Click-to-close scrim — almost transparent so you can SEE the page */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-auto"
        onClick={handleClose}
      />

      {/* Bottom-anchored narration card */}
      <div
        className="absolute left-1/2 bottom-6 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-2xl border shadow-2xl overflow-hidden"
          style={{
            background: "rgba(15, 15, 22, 0.92)",
            borderColor: "rgba(167, 139, 250, 0.32)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: "#a78bfa",
                  boxShadow: "0 0 10px #a78bfa",
                }}
              />
              <p
                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: "#c4b5fd" }}
              >
                Site walkthrough · step {currentStepIdx + 1} / {DEMO_STEPS.length}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-[12px]"
              style={{
                color: "rgba(255,255,255,0.55)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
              aria-label="End walkthrough"
            >
              <span className="material-symbols-outlined text-[16px]">
                close
              </span>
            </button>
          </div>

          {/* Progress bar */}
          <div
            className="h-[3px]"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(to right, #a78bfa, #f472b6)",
              }}
            />
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <h3
              key={currentStepIdx}
              className="font-display text-[17px] font-bold leading-tight mb-1.5 animate-[demoFade_320ms_ease]"
              style={{ color: "white" }}
            >
              {step.title}
            </h3>
            <p
              className="text-[12.5px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.72)" }}
            >
              {step.body}
            </p>

            {/* Mini step strip + controls */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-1 flex-1 mr-4">
                {DEMO_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{
                      background:
                        i <= currentStepIdx
                          ? "#a78bfa"
                          : "rgba(255,255,255,0.10)",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRestart}
                  className="p-1.5 rounded-lg"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  aria-label="Restart"
                  title="Restart"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    replay
                  </span>
                </button>
                <button
                  onClick={handleTogglePlay}
                  className="p-1.5 rounded-lg"
                  style={{
                    color: isPlaying ? "#fbbf24" : "#86efac",
                    background: isPlaying
                      ? "rgba(251,191,36,0.10)"
                      : "rgba(34,197,94,0.10)",
                    border: `1px solid ${
                      isPlaying
                        ? "rgba(251,191,36,0.30)"
                        : "rgba(34,197,94,0.30)"
                    }`,
                  }}
                  aria-label={isPlaying ? "Pause walkthrough" : "Resume walkthrough"}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {isPlaying ? "pause" : "play_arrow"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes demoFade {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
