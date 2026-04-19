"use client";

// ─── useHighPriorityChime ───────────────────────────────────────────────────
// Plays a short tone whenever a NEW high-priority signal hits the dashboard:
//   • a live phone caller (useLivePhoneCallers) where ticket.priority === HIGH
//   • a freshly-arrived incident from /api/incidents with priority === HIGH
// Honours the user's `settings.notificationSound` toggle in the app store.
// Tracks "seen" IDs in a ref so the same incident never chimes twice.

import { useEffect, useRef } from "react";
import { useAppState } from "../_lib/store";

type Priorityish = string | null | undefined;

function isHigh(p: Priorityish): boolean {
  if (!p) return false;
  const v = p.toString().toUpperCase();
  return v === "HIGH" || v === "CRITICAL";
}

let cachedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedAudioCtx) return cachedAudioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  cachedAudioCtx = new Ctor();
  return cachedAudioCtx;
}

function chime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Two-tone "ping-pong" — short, dispatch-room appropriate.
  const now = ctx.currentTime;
  const make = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };
  make(880, 0, 0.18);
  make(660, 0.16, 0.22);
}

export function useHighPriorityChime(opts: {
  liveCallerKeys: string[]; // sessionId list, only the HIGH ones
  incidentKeys: string[]; // incident IDs, only the HIGH ones
}) {
  const { settings } = useAppState();
  const seenRef = useRef<Set<string> | null>(null);
  const enabledRef = useRef(settings.notificationSound);
  enabledRef.current = settings.notificationSound;

  // Seed the seen set on first mount with whatever's already on screen so the
  // page load doesn't spam tones for stale incidents.
  useEffect(() => {
    if (seenRef.current) return;
    seenRef.current = new Set([...opts.liveCallerKeys, ...opts.incidentKeys]);
    // Intentionally only run on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seenRef.current) return;
    const seen = seenRef.current;
    let didChime = false;
    for (const k of opts.liveCallerKeys) {
      if (!seen.has(k)) {
        seen.add(k);
        didChime = true;
      }
    }
    for (const k of opts.incidentKeys) {
      if (!seen.has(k)) {
        seen.add(k);
        didChime = true;
      }
    }
    if (didChime && enabledRef.current) chime();
  }, [opts.liveCallerKeys, opts.incidentKeys]);
}
