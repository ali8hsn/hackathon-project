"use client";

// ─── DemoController ─────────────────────────────────────────────────────────
// Narrated walkthrough of Siren's core features, synchronized with a simulated
// 911 call (burning-building MP3). Pass 2 upgrade: each step can carry a
// `route` so the demo physically traverses the site (homepage → situation
// sheet → dispatch-live → intake) instead of sitting on one page. Emits a
// `LiveCaller` state that the homepage can render into LiveCallerQueue so
// viewers can watch fields populate in real time as the call progresses.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { LiveCaller } from "./LiveCallerQueue";

// `route` is interpolated client-side: any "{demoId}" token gets replaced with
// the most-recent HIGH-priority incident id we resolve at demo start. That
// keeps the demo robust as new incidents arrive — no hard-coded id rot.
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
    atSec: 12,
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
    atSec: 20,
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
    atSec: 28,
    title: "Ticket ready for dispatch — opening situation sheet",
    body: "A complete situation sheet is ready in under 30 seconds. We're routing you to the AI-generated report now.",
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
    atSec: 35,
    title: "Phone monitor — Twilio plumbing live",
    body: "The dedicated Phone Calls monitor shows the last webhook hit, every active call, and a streaming event feed for Twilio.",
    spotlight: "report",
    route: "/phone-calls",
  },
  {
    atSec: 42,
    title: "Voice intake — where the calls land",
    body: "ARIA answers callers in their language, transcribes in real time, and feeds Siren the structured ticket you just saw.",
    spotlight: "intake",
    route: "/intake/",
  },
];

export const DEMO_AUDIO_SRC = "/demo/burning-building.mp3";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);
  const [demoIncidentId, setDemoIncidentId] = useState<string | null>(null);
  // Track the last route we pushed so we don't spam router.push on every
  // audio time-update tick — only navigate when the step actually changes.
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

  // Derive the current step from audioTime (pure computation — no state).
  const currentStepIdx = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (DEMO_STEPS[i].atSec <= audioTime) idx = i;
      else break;
    }
    return idx;
  }, [audioTime]);

  // Emit caller state + push routes whenever the step index changes.
  useEffect(() => {
    if (!open) {
      onCallerUpdate?.(null);
      return;
    }
    const merged: LiveCaller = {
      id: "demo-call",
      phone: "+1 512 ••• 0471",
      startedAt: Date.now() - audioTime * 1000,
      status: "ringing",
    };
    for (let i = 0; i <= currentStepIdx; i++) {
      Object.assign(merged, DEMO_STEPS[i].caller ?? {});
    }
    onCallerUpdate?.(merged);
    const step = DEMO_STEPS[currentStepIdx];
    onStepChange?.(step?.spotlight);

    // Route navigation — only on actual step boundary.
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

  const handleTime = useCallback(() => {
    if (audioRef.current) setAudioTime(audioRef.current.currentTime);
  }, []);

  const handlePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err) => {
        console.warn("Demo audio could not play:", err);
        setAudioMissing(true);
      });
    } else {
      a.pause();
    }
  }, []);

  const handleRestart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setAudioTime(0);
    a.play().catch(() => setAudioMissing(true));
  }, []);

  const handleClose = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setAudioTime(0);
    setIsPlaying(false);
    lastRouteRef.current = null;
    onClose();
    // Bring the dispatcher back home so the demo always finishes on the
    // hero rather than orphaned on /intake or /phone-calls.
    router.push("/");
  }, [onClose, router]);

  // Auto-play on open (may be blocked until user interacts)
  useEffect(() => {
    if (open && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          /* user will click play */
        });
    }
  }, [open]);

  if (!open) return null;

  const step = DEMO_STEPS[currentStepIdx];
  const totalSec = DEMO_STEPS[DEMO_STEPS.length - 1].atSec + 10;
  const pct = Math.min(100, (audioTime / totalSec) * 100);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-gradient-to-br from-surface-low to-surface-lowest border border-outline-variant/20 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 bg-surface-low">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full bg-brand-dim flex items-center justify-center">
              <span
                className="material-symbols-outlined text-brand"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                emergency
              </span>
              <span className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-40" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
                Live Demo — Burning Building
              </p>
              <p className="text-[13px] font-bold text-on-surface">
                Simulated 911 call · {Math.floor(audioTime)}s /{" "}
                {DEMO_STEPS[DEMO_STEPS.length - 1].atSec + 10}s
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-on-surface"
            aria-label="Close demo"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Audio element */}
        <audio
          ref={audioRef}
          src={DEMO_AUDIO_SRC}
          onTimeUpdate={handleTime}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => setAudioMissing(true)}
          preload="auto"
        />

        {/* Body */}
        <div className="px-6 py-6">
          {/* Step indicator dots */}
          <div className="flex items-center gap-1.5 mb-5">
            {DEMO_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= currentStepIdx
                    ? "bg-brand"
                    : "bg-surface-high"
                }`}
              />
            ))}
          </div>

          {/* Step title + body */}
          <div key={currentStepIdx} className="animate-[fadeIn_400ms_ease]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant mb-1.5">
              Step {currentStepIdx + 1} of {DEMO_STEPS.length}
            </p>
            <h3 className="text-xl font-black text-on-surface tracking-tight mb-2">
              {step.title}
            </h3>
            <p className="text-[13.5px] text-on-surface-variant leading-relaxed">
              {step.body}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-1.5 bg-surface-high rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={handleRestart}
              className="p-2 rounded-full bg-surface-high hover:bg-surface-bright text-on-surface"
              aria-label="Restart"
            >
              <span className="material-symbols-outlined">replay</span>
            </button>
            <button
              onClick={handlePlay}
              className="p-3 rounded-full bg-brand hover:bg-brand-dark text-white flex items-center justify-center shadow-lg shadow-brand/20"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-full bg-surface-high hover:bg-surface-bright text-on-surface-variant"
              aria-label="End demo"
            >
              <span className="material-symbols-outlined">stop</span>
            </button>
          </div>

          {audioMissing && (
            <div className="mt-6 px-4 py-3 rounded-xl bg-tertiary-container/20 border border-tertiary/30 text-[12px] text-tertiary">
              <strong className="font-bold">Audio file missing.</strong> Drop
              the generated MP3 at{" "}
              <code className="font-mono px-1 py-0.5 rounded bg-surface-high text-on-surface">
                public/demo/burning-building.mp3
              </code>{" "}
              (run{" "}
              <code className="font-mono px-1 py-0.5 rounded bg-surface-high text-on-surface">
                node scripts/generate-demo-audio.mjs
              </code>
              ). The step narration will continue without audio.
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
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
