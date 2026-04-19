"use client";

// ─── useLiveClusters ────────────────────────────────────────────────────────
// Mirrors the live phone-callers hook but for server-detected mass-event
// clusters. The server (server.js) recomputes clusters on every ticket
// update and broadcasts `cluster_update` frames over /ws-aria. We also poll
// /api/aria/clusters once on mount so a freshly-loaded page has data even
// before the first WS frame arrives.

import { useEffect, useState } from "react";

export interface LiveCluster {
  key: string;
  type: string;
  location: string;
  callerCount: number;
  sessionIds: string[];
}

export function useLiveClusters(): {
  clusters: LiveCluster[];
  mergeCluster: (key: string, sessionIds: string[]) => Promise<{
    ok: boolean;
    incidentId?: string | null;
    error?: string;
  }>;
} {
  const [clusters, setClusters] = useState<LiveCluster[]>([]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    fetch("/api/aria/clusters")
      .then((r) => (r.ok ? r.json() : { clusters: [] }))
      .then((j) => {
        if (cancelled || !Array.isArray(j.clusters)) return;
        setClusters(j.clusters);
      })
      .catch(() => {});

    function scheduleReconnect() {
      if (cancelled || reconnectTimer) return;
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
      ws.onclose = () => {
        ws = null;
        scheduleReconnect();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === "cluster_update" && Array.isArray(msg.clusters)) {
            setClusters(msg.clusters);
          } else if (msg.type === "cluster_merged" && msg.clusterKey) {
            // Optimistic local prune in case the follow-up cluster_update is
            // delayed in transit.
            setClusters((prev) => prev.filter((c) => c.key !== msg.clusterKey));
          }
        } catch {
          /* ignore */
        }
      };
    }
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  async function mergeCluster(key: string, sessionIds: string[]) {
    try {
      const res = await fetch("/api/aria/clusters/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterKey: key, sessionIds }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: txt };
      }
      const j = await res.json();
      // Remove from local state immediately for a snappy UI; the server
      // will also broadcast cluster_update which will reconcile.
      setClusters((prev) => prev.filter((c) => c.key !== key));
      return { ok: true, incidentId: j.incidentId ?? null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "merge failed" };
    }
  }

  return { clusters, mergeCluster };
}
