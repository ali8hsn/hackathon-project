"use client";

// Companion hook to useLivePhoneCallers, used only by /phone-calls. Opens
// its own /ws-aria connection so the dedicated monitor page can render a raw
// event feed without coupling to the homepage card hook.

import { useEffect, useRef, useState } from "react";

export type MonitorEventType =
  | "session_start"
  | "transcription"
  | "ai_analysis"
  | "report_ready"
  | "session_end"
  | "ai_skipped"
  | "cluster_update"
  | "cluster_merged"
  | "other";

export interface MonitorEvent {
  id: string;
  ts: number;
  sessionId: string | null;
  type: MonitorEventType;
  summary: string;
  raw: unknown;
}

interface UsePhoneMonitorResult {
  events: MonitorEvent[];
  lastEventAt: number | null;
  wsConnected: boolean;
  paused: boolean;
  setPaused: (next: boolean) => void;
  clear: () => void;
}

const MAX_EVENTS = 200;

function summarize(type: string, msg: Record<string, unknown>): string {
  switch (type) {
    case "session_start": {
      const from = (msg.from as string) || "";
      const sid = (msg.twilioCallSid as string) || "";
      return [from && `from ${from}`, sid && `CallSid ${sid.slice(0, 8)}…`]
        .filter(Boolean)
        .join("  ·  ") || "new phone session";
    }
    case "transcription": {
      const text = ((msg.text as string) || "").trim();
      const trimmed = text.length > 80 ? text.slice(0, 80) + "…" : text;
      return trimmed || "(silent chunk)";
    }
    case "ai_analysis": {
      const ticket = (msg.ticket || {}) as Record<string, unknown>;
      const priority = (ticket.priority as string) || "?";
      const type2 = (ticket.type as string) || "?";
      const dispatch = msg.shouldDispatch ? "dispatch=YES" : "dispatch=no";
      return `${priority}  ·  ${type2}  ·  ${dispatch}`;
    }
    case "report_ready": {
      const incidentId = (msg.incidentId as string) || "";
      return incidentId ? `incident ${incidentId.slice(0, 8)}…` : "report ready";
    }
    case "session_end": {
      const sid = (msg.twilioCallSid as string) || "";
      return sid ? `CallSid ${sid.slice(0, 8)}…` : "session ended";
    }
    case "ai_skipped":
      return "Claude gated (AI Idle)";
    case "cluster_update": {
      const clusters = msg.clusters as unknown[] | undefined;
      return `${Array.isArray(clusters) ? clusters.length : 0} cluster(s)`;
    }
    case "cluster_merged":
      return "cluster merged → incident";
    default:
      return type;
  }
}

function classify(type: string): MonitorEventType {
  switch (type) {
    case "session_start":
    case "transcription":
    case "ai_analysis":
    case "report_ready":
    case "session_end":
    case "ai_skipped":
    case "cluster_update":
    case "cluster_merged":
      return type;
    default:
      return "other";
  }
}

export function usePhoneMonitor(): UsePhoneMonitorResult {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [paused, setPaused] = useState(false);

  // Refs let the WS callback see the latest paused flag without re-subscribing.
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let counter = 0;

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
        // onclose will handle the reconnect schedule.
      };
      ws.onclose = () => {
        setWsConnected(false);
        ws = null;
        scheduleReconnect();
      };
      ws.onmessage = (ev) => {
        if (pausedRef.current) return;
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;

        const type = String(parsed.type || "");
        if (!type) return;

        // The monitor only cares about phone-channel events plus the global
        // cluster broadcasts. Browser intake sessions are covered by /intake.
        const channel = parsed.channel as string | undefined;
        const isClusterEvent =
          type === "cluster_update" || type === "cluster_merged";
        if (!isClusterEvent && channel && channel !== "phone") return;

        const ts = Date.now();
        const id = `${ts}-${counter++}`;
        const event: MonitorEvent = {
          id,
          ts,
          sessionId: (parsed.sessionId as string) || null,
          type: classify(type),
          summary: summarize(type, parsed),
          raw: parsed,
        };
        setEvents((prev) => {
          const next = [event, ...prev];
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
        });
        setLastEventAt(ts);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close(1000);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    events,
    lastEventAt,
    wsConnected,
    paused,
    setPaused,
    clear: () => setEvents([]),
  };
}
