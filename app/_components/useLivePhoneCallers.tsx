"use client";

// ─── useLivePhoneCallers ────────────────────────────────────────────────────
// Subscribes to wss://<host>/ws-aria and surfaces live Twilio phone calls
// (channel === 'phone') as `LiveCaller[]` so the homepage can render the
// LiveCallerQueue + amber map pins WHILE the call is still happening.
//
// Server-side broadcasts (see server.js):
//   • session_start  — { sessionId, channel, twilioCallSid, from, ticket }
//   • transcription  — { sessionId, channel, ticket, text, translatedText, ... }
//   • ai_analysis    — { sessionId, channel, ticket, severityScores, dispatchRecommendation, shouldDispatch, ... }
//   • session_end    — { sessionId, channel, twilioCallSid }
//
// We also reverse-geocode `ticket.location` once it stabilises (>= 4 chars)
// via the existing /api/aria/geocode endpoint so the call can pin on the map.

import { useEffect, useRef, useState } from "react";
import type { LiveCaller } from "./LiveCallerQueue";

type Ticket = {
  incidentId?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL" | null;
  type?: string | null;
  location?: string | null;
  victims?: number | string | null;
  injuries?: string | null;
  hazards?: string | null;
  callerName?: string | null;
  language?: string | null;
};

type WsMsg =
  | {
      type: "session_start";
      sessionId: string;
      channel?: "phone" | "browser";
      twilioCallSid?: string;
      from?: string;
      ticket?: Ticket;
    }
  | {
      type: "transcription";
      sessionId: string;
      channel?: "phone" | "browser";
      ticket?: Ticket;
      text?: string;
    }
  | {
      type: "ai_analysis";
      sessionId: string;
      channel?: "phone" | "browser";
      ticket?: Ticket;
      severityScores?: {
        lifeThreat?: number;
        urgency?: number;
        locationConfidence?: number;
        infoCompleteness?: number;
      };
      shouldDispatch?: boolean;
    }
  | {
      type: "session_end";
      sessionId: string;
      channel?: "phone" | "browser";
    };

export interface LivePhonePin {
  sessionId: string;
  lat: number;
  lng: number;
  phone: string;
  ticket: Ticket;
}

// Mask middle of a phone number for display: "+1 512 ••• 9023".
function maskPhone(raw?: string): string {
  if (!raw) return "Unknown caller";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 7) return raw;
  const last4 = digits.slice(-4);
  const cc = digits.startsWith("+") ? digits.slice(0, 2) : "";
  const area = digits.slice(cc.length, cc.length + 3);
  return `${cc} ${area} ••• ${last4}`.trim();
}

function priorityFromTicket(t?: Ticket): LiveCaller["priority"] {
  const p = (t?.priority || "").toUpperCase();
  if (p === "HIGH" || p === "CRITICAL") return "HIGH";
  if (p === "MEDIUM") return "MEDIUM";
  if (p === "LOW") return "LOW";
  return null;
}

function tickerToCaller(args: {
  sessionId: string;
  from?: string;
  startedAt: number;
  ticket?: Ticket;
  status: LiveCaller["status"];
  confidence?: number;
  incidentId?: string;
}): LiveCaller {
  const { sessionId, from, startedAt, ticket, status, confidence, incidentId } =
    args;
  const hazards =
    typeof ticket?.hazards === "string" && ticket.hazards.trim().length > 0
      ? [ticket.hazards.trim()]
      : [];
  const victims =
    typeof ticket?.victims === "number"
      ? ticket.victims
      : typeof ticket?.victims === "string" && ticket.victims.trim()
        ? Number(ticket.victims) || null
        : null;
  return {
    id: sessionId,
    phone: maskPhone(from),
    startedAt,
    status,
    language: ticket?.language || undefined,
    location: ticket?.location || undefined,
    nature: ticket?.type || undefined,
    victims,
    hazards,
    priority: priorityFromTicket(ticket),
    incidentId,
    confidence,
  };
}

// ── Geocode cache (avoids hitting Nominatim on every ticket update) ────────
const GEO_CACHE = new Map<string, { lat: number; lng: number } | null>();
async function geocode(
  q: string
): Promise<{ lat: number; lng: number } | null> {
  const key = q.trim().toLowerCase();
  if (key.length < 4) return null;
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key) ?? null;
  try {
    const res = await fetch(
      `/api/aria/geocode?q=${encodeURIComponent(q)}`
    );
    if (!res.ok) {
      GEO_CACHE.set(key, null);
      return null;
    }
    const data = (await res.json()) as { lat?: number; lon?: number };
    if (typeof data.lat === "number" && typeof data.lon === "number") {
      const out = { lat: data.lat, lng: data.lon };
      GEO_CACHE.set(key, out);
      return out;
    }
    GEO_CACHE.set(key, null);
    return null;
  } catch {
    GEO_CACHE.set(key, null);
    return null;
  }
}

interface UseLiveCallersResult {
  callers: LiveCaller[];
  pins: LivePhonePin[];
  wsConnected: boolean;
}

export function useLivePhoneCallers(): UseLiveCallersResult {
  const [callers, setCallers] = useState<Record<string, LiveCaller>>({});
  const [pins, setPins] = useState<Record<string, LivePhonePin>>({});
  const [wsConnected, setWsConnected] = useState(false);

  // We track the raw `from` per session because subsequent events don't
  // re-include it; without this, transcription/ai_analysis would wipe
  // the masked phone number we showed at session_start.
  const fromRef = useRef<Record<string, string | undefined>>({});
  const startedAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function scheduleReconnect() {
      if (cancelled) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }

    function connect() {
      if (cancelled) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      try {
        ws = new WebSocket(`${proto}//${location.host}/ws-aria`);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => setWsConnected(true);
      ws.onerror = () => {
        /* swallow — onclose handles reconnect */
      };
      ws.onclose = () => {
        setWsConnected(false);
        ws = null;
        scheduleReconnect();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMsg;
          if (!msg || typeof msg !== "object") return;
          // Only phone sessions surface on the dashboard. Browser intake
          // already has its own UI at /intake.
          if (msg.channel && msg.channel !== "phone") return;
          handleMsg(msg);
        } catch {
          /* ignore malformed frames */
        }
      };
    }

    function handleMsg(msg: WsMsg) {
      switch (msg.type) {
        case "session_start": {
          fromRef.current[msg.sessionId] = msg.from;
          startedAtRef.current[msg.sessionId] = Date.now();
          setCallers((prev) => ({
            ...prev,
            [msg.sessionId]: tickerToCaller({
              sessionId: msg.sessionId,
              from: msg.from,
              startedAt: Date.now(),
              ticket: msg.ticket,
              status: "ringing",
            }),
          }));
          break;
        }
        case "transcription": {
          const startedAt =
            startedAtRef.current[msg.sessionId] ??
            (startedAtRef.current[msg.sessionId] = Date.now());
          setCallers((prev) => {
            const prior = prev[msg.sessionId];
            const next = tickerToCaller({
              sessionId: msg.sessionId,
              from: fromRef.current[msg.sessionId],
              startedAt,
              ticket: msg.ticket,
              status: prior?.status === "ready" ? "ready" : "triaging",
              confidence: prior?.confidence,
              incidentId: prior?.incidentId,
            });
            return { ...prev, [msg.sessionId]: next };
          });
          maybeGeocode(msg.sessionId, msg.ticket);
          break;
        }
        case "ai_analysis": {
          const startedAt =
            startedAtRef.current[msg.sessionId] ??
            (startedAtRef.current[msg.sessionId] = Date.now());
          const conf = msg.severityScores?.locationConfidence;
          setCallers((prev) => {
            const prior = prev[msg.sessionId];
            const next = tickerToCaller({
              sessionId: msg.sessionId,
              from: fromRef.current[msg.sessionId],
              startedAt,
              ticket: msg.ticket,
              status: msg.shouldDispatch ? "ready" : "triaging",
              confidence:
                typeof conf === "number" ? Math.round(conf) : prior?.confidence,
              incidentId: prior?.incidentId,
            });
            return { ...prev, [msg.sessionId]: next };
          });
          maybeGeocode(msg.sessionId, msg.ticket);
          break;
        }
        case "session_end": {
          delete fromRef.current[msg.sessionId];
          delete startedAtRef.current[msg.sessionId];
          setCallers((prev) => {
            if (!prev[msg.sessionId]) return prev;
            const next = { ...prev };
            delete next[msg.sessionId];
            return next;
          });
          setPins((prev) => {
            if (!prev[msg.sessionId]) return prev;
            const next = { ...prev };
            delete next[msg.sessionId];
            return next;
          });
          break;
        }
      }
    }

    // Throttle: only geocode when the location string CHANGES per session.
    const lastGeocoded = new Map<string, string>();
    async function maybeGeocode(sessionId: string, ticket?: Ticket) {
      const loc = (ticket?.location || "").trim();
      if (loc.length < 4) return;
      if (lastGeocoded.get(sessionId) === loc) return;
      lastGeocoded.set(sessionId, loc);
      const coords = await geocode(loc);
      if (cancelled || !coords) return;
      // Pin may have been dropped by session_end while geocode was inflight.
      if (!fromRef.current[sessionId] && !startedAtRef.current[sessionId]) {
        return;
      }
      setPins((prev) => ({
        ...prev,
        [sessionId]: {
          sessionId,
          lat: coords.lat,
          lng: coords.lng,
          phone: maskPhone(fromRef.current[sessionId]),
          ticket: ticket ?? {},
        },
      }));
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close(1000);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    callers: Object.values(callers).sort((a, b) => a.startedAt - b.startedAt),
    pins: Object.values(pins),
    wsConnected,
  };
}
