"use client";

// ─── SettingsPanel ──────────────────────────────────────────────────────────
// Anchored dropdown owned by TopNav. Houses three controls:
//   1. Notification sounds  — plays a short tone on every NEW high-priority
//      incident the dashboard sees (driven by useLivePhoneCallers + the
//      /api/incidents poll). Persisted in localStorage as "siren.sound".
//   2. Light / Dark mode    — toggles `.theme-light` on <html>. The dispatch
//      console (`#console`) keeps its own dark inline-styled background, so
//      this is safe even before Phase 6 globals.css restyle.
//   3. Connection status    — live pill showing WS state, last-poll time, and
//      deploy SHA fetched from /api/version (written by scripts/redeploy.sh).
// All settings live in app/_lib/store.tsx so other components can read them.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppState, type ThemeMode } from "../_lib/store";
import { useLivePhoneCallers } from "./useLivePhoneCallers";

interface VersionInfo {
  shortSha: string;
  deployedAt: string | null;
  bootedAt: string | null;
}

export default function SettingsPanel({
  onCream,
  anchor,
  onClose,
}: {
  onCream: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { settings } = useAppState();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const { wsConnected } = useLivePhoneCallers();

  // Click outside / Esc closes the panel.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchor && anchor.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  // Hydrate the deploy SHA + last poll once on open.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (cancelled || !v) return;
        setVersion({
          shortSha: v.shortSha ?? "unknown",
          deployedAt: v.deployedAt ?? null,
          bootedAt: v.bootedAt ?? null,
        });
      })
      .catch(() => {});
    fetch("/api/incidents")
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (cancelled || !rows) return;
        setLastPoll(Date.now());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setSound = useCallback(
    (value: boolean) => {
      dispatch({ type: "SET_NOTIFICATION_SOUND", payload: value });
      try {
        localStorage.setItem("siren.sound", value ? "1" : "0");
      } catch {}
    },
    [dispatch]
  );

  const setTheme = useCallback(
    (next: ThemeMode) => {
      dispatch({ type: "SET_THEME", payload: next });
      try {
        localStorage.setItem("siren.theme", next);
      } catch {}
      const root = document.documentElement;
      root.classList.toggle("theme-light", next === "light");
      root.classList.toggle("theme-dark", next === "dark");
      root.dataset.theme = next;
    },
    [dispatch]
  );

  const muted = onCream ? "rgba(10,10,15,0.55)" : "rgba(255,255,255,0.55)";
  const fg = onCream ? "#0a0a0f" : "#e8e6ef";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Settings"
      className="absolute right-6 top-[calc(100%+8px)] w-[320px] rounded-2xl shadow-2xl overflow-hidden z-50"
      style={{
        background: onCream ? "#ffffff" : "#15121f",
        border: `1px solid ${onCream ? "rgba(10,10,15,0.10)" : "rgba(167,139,250,0.18)"}`,
        boxShadow:
          "0 24px 48px -24px rgba(15,15,30,0.45), 0 4px 12px -8px rgba(124,58,237,0.30)",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          borderBottom: `1px solid ${onCream ? "rgba(10,10,15,0.06)" : "rgba(255,255,255,0.06)"}`,
          background: onCream
            ? "linear-gradient(180deg,#faf5ff 0%,#ffffff 100%)"
            : "linear-gradient(180deg,#1a1530 0%,#15121f 100%)",
        }}
      >
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}
        >
          settings
        </span>
        <span
          className="text-[10px] font-black uppercase tracking-[0.2em]"
          style={{ color: onCream ? "#5b21b6" : "#a78bfa" }}
        >
          Settings
        </span>
      </div>

      <div className="flex flex-col">
        <ToggleRow
          icon="volume_up"
          title="Notification sounds"
          subtitle="Tone on every new HIGH incident"
          value={settings.notificationSound}
          onChange={setSound}
          fg={fg}
          muted={muted}
          onCream={onCream}
        />
        <ToggleRow
          icon={settings.theme === "dark" ? "dark_mode" : "light_mode"}
          title="Light mode"
          subtitle={
            settings.theme === "dark"
              ? "Currently dark — toggle for cream UI"
              : "Currently light — toggle for ink UI"
          }
          value={settings.theme === "light"}
          onChange={(v) => setTheme(v ? "light" : "dark")}
          fg={fg}
          muted={muted}
          onCream={onCream}
        />

        <div
          className="flex flex-col gap-2.5 px-4 py-3.5"
          style={{
            borderTop: `1px solid ${onCream ? "rgba(10,10,15,0.06)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-[0.18em]"
            style={{ color: muted }}
          >
            Connection
          </span>
          <StatusLine
            label="WebSocket"
            value={wsConnected ? "Connected" : "Reconnecting…"}
            ok={wsConnected}
            fg={fg}
            muted={muted}
          />
          <StatusLine
            label="Mongo poll"
            value={lastPoll ? formatRelative(lastPoll) : "Pending"}
            ok={!!lastPoll}
            fg={fg}
            muted={muted}
          />
          <StatusLine
            label="Deploy"
            value={version ? `${version.shortSha}` : "…"}
            ok={!!version}
            fg={fg}
            muted={muted}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  fg,
  muted,
  onCream,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  fg: string;
  muted: string;
  onCream: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-3 px-4 py-3 text-left transition-colors"
      style={{
        borderBottom: `1px solid ${onCream ? "rgba(10,10,15,0.04)" : "rgba(255,255,255,0.04)"}`,
        background: "transparent",
      }}
    >
      <span
        className="material-symbols-outlined text-[18px]"
        style={{
          color: value ? "#a78bfa" : muted,
          fontVariationSettings: value ? "'FILL' 1" : "'FILL' 0",
        }}
      >
        {icon}
      </span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[12px] font-bold" style={{ color: fg }}>
          {title}
        </span>
        <span className="text-[10.5px]" style={{ color: muted }}>
          {subtitle}
        </span>
      </div>
      <span
        role="switch"
        aria-checked={value}
        className="relative inline-block w-9 h-5 rounded-full transition-colors flex-none"
        style={{
          background: value ? "#a78bfa" : onCream ? "rgba(10,10,15,0.12)" : "rgba(255,255,255,0.12)",
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{
            left: value ? 18 : 2,
            background: "#ffffff",
            boxShadow: "0 1px 3px rgba(15,15,30,0.30)",
          }}
        />
      </span>
    </button>
  );
}

function StatusLine({
  label,
  value,
  ok,
  fg,
  muted,
}: {
  label: string;
  value: string;
  ok: boolean;
  fg: string;
  muted: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[11px]" style={{ color: muted }}>
        <span
          className="inline-block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: ok ? "#34d399" : "#f59e0b",
            boxShadow: ok ? "0 0 8px rgba(52,211,153,0.55)" : "0 0 8px rgba(245,158,11,0.55)",
          }}
        />
        {label}
      </span>
      <span className="text-[11px] font-mono font-semibold" style={{ color: fg }}>
        {value}
      </span>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1500) return "Just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
