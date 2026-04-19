"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppState, useAppDispatch } from "../_lib/store";
import SettingsPanel from "./SettingsPanel";

const pageLabels: Record<string, { eyebrow: string; title: string }> = {
  "/": { eyebrow: "Overview", title: "Siren AI" },
  "/reports": { eyebrow: "Archive", title: "Call reports" },
  "/intake": { eyebrow: "Voice", title: "Intake console" },
  "/haashir-assist": { eyebrow: "Agent", title: "AI assist" },
  "/trend-detection": { eyebrow: "Analytics", title: "Trend detection" },
};

export default function TopNav() {
  const { haashirAssistEnabled } = useAppState();
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement | null>(null);

  // Hydrate the AI toggle from server state once on mount so reloads don't
  // desync the badge from the actual gate.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/aria/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.aiActive === "boolean") {
          dispatch({ type: "SET_HAASHIR_ASSIST", payload: data.aiActive });
        }
      })
      .catch(() => {
        // Network blip — keep whatever the optimistic default is.
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const onToggleAi = useCallback(async () => {
    const next = !haashirAssistEnabled;
    // Flip locally first for responsiveness; revert if the server rejects.
    dispatch({ type: "SET_HAASHIR_ASSIST", payload: next });
    try {
      const res = await fetch("/api/aria/ai/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data?.active === "boolean" && data.active !== next) {
        dispatch({ type: "SET_HAASHIR_ASSIST", payload: data.active });
      }
    } catch {
      dispatch({ type: "SET_HAASHIR_ASSIST", payload: !next });
    }
  }, [haashirAssistEnabled, dispatch]);

  // Detect scroll so the nav can shift from transparent (over cream hero) to
  // dark glass (once the dashboard is in view). On non-home pages the nav is
  // always "scrolled" — that state is derived, not stored.
  const [scrollPos, setScrollPos] = useState(0);
  useEffect(() => {
    if (!isHome) return;
    const main = document.querySelector("main > div");
    const onScroll = () => {
      const top = main ? main.scrollTop : window.scrollY;
      setScrollPos(top);
    };
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    // Defer initial read to next frame so we don't setState synchronously
    // inside the effect body.
    const raf = requestAnimationFrame(onScroll);
    return () => {
      cancelAnimationFrame(raf);
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isHome]);
  const scrolled = !isHome || scrollPos > 120;

  const match =
    pageLabels[pathname ?? "/"] ??
    Object.entries(pageLabels)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([k]) => pathname?.startsWith(k))?.[1] ??
    { eyebrow: "Dispatch", title: "Situation sheet" };

  const onCream = isHome && !scrolled;

  return (
    <header
      className="flex justify-between items-center w-full px-8 sticky top-0 z-40 h-16 transition-all duration-500 border-b"
      style={{
        background: onCream
          ? "rgba(250, 247, 242, 0.7)"
          : "rgba(10, 10, 15, 0.75)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        borderColor: onCream
          ? "rgba(10, 10, 15, 0.08)"
          : "rgba(255, 255, 255, 0.06)",
      }}
    >
      <div className="flex items-center gap-4 min-w-0">
        {!isHome && (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors"
            style={{
              color: onCream ? "rgba(10,10,15,0.65)" : "rgba(255,255,255,0.65)",
              borderColor: onCream
                ? "rgba(10,10,15,0.12)"
                : "rgba(255,255,255,0.12)",
            }}
          >
            <span className="material-symbols-outlined text-base">
              arrow_back
            </span>
            Back
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{
              color: onCream
                ? "rgba(10,10,15,0.45)"
                : "rgba(255,255,255,0.45)",
            }}
          >
            {match.eyebrow}
          </span>
          <span
            className="text-[15px] font-bold tracking-tight leading-tight truncate"
            style={{ color: onCream ? "#0a0a0f" : "#e8e6ef" }}
          >
            {match.title}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onToggleAi}
          aria-pressed={haashirAssistEnabled}
          aria-label={haashirAssistEnabled ? "AI active — click to pause" : "AI idle — click to resume"}
          className="group px-3.5 py-1.5 rounded-full flex items-center gap-2 border transition-all duration-300"
          style={{
            background: haashirAssistEnabled
              ? "rgba(167, 139, 250, 0.14)"
              : onCream
                ? "rgba(10, 10, 15, 0.04)"
                : "rgba(255, 255, 255, 0.04)",
            borderColor: haashirAssistEnabled
              ? "rgba(167, 139, 250, 0.35)"
              : onCream
                ? "rgba(10, 10, 15, 0.1)"
                : "rgba(255, 255, 255, 0.1)",
            boxShadow: haashirAssistEnabled
              ? "0 0 16px rgba(167, 139, 250, 0.2)"
              : undefined,
          }}
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={{
              fontVariationSettings: "'FILL' 1",
              color: haashirAssistEnabled
                ? "#a78bfa"
                : onCream
                  ? "rgba(10,10,15,0.6)"
                  : "rgba(255,255,255,0.6)",
            }}
          >
            bolt
          </span>
          <span
            className="text-[10.5px] font-bold uppercase tracking-wider"
            style={{
              color: haashirAssistEnabled
                ? "#a78bfa"
                : onCream
                  ? "rgba(10,10,15,0.6)"
                  : "rgba(255,255,255,0.6)",
            }}
          >
            {haashirAssistEnabled ? "AI Active" : "AI Idle"}
          </span>
        </button>

        <button
          ref={gearRef}
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-label="Open settings"
          aria-expanded={settingsOpen}
          className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors"
          style={{
            background: settingsOpen
              ? "rgba(167, 139, 250, 0.16)"
              : onCream
                ? "rgba(10, 10, 15, 0.04)"
                : "rgba(255, 255, 255, 0.04)",
            borderColor: settingsOpen
              ? "rgba(167, 139, 250, 0.45)"
              : onCream
                ? "rgba(10, 10, 15, 0.1)"
                : "rgba(255, 255, 255, 0.1)",
            color: settingsOpen
              ? "#a78bfa"
              : onCream
                ? "rgba(10,10,15,0.55)"
                : "rgba(255,255,255,0.55)",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            settings
          </span>
        </button>

        <div
          className="h-6 w-px"
          style={{
            background: onCream
              ? "rgba(10,10,15,0.12)"
              : "rgba(255,255,255,0.12)",
          }}
        />

        <div
          className="w-8 h-8 rounded-full border flex items-center justify-center"
          style={{
            background: onCream
              ? "rgba(10, 10, 15, 0.04)"
              : "rgba(255, 255, 255, 0.04)",
            borderColor: onCream
              ? "rgba(10, 10, 15, 0.1)"
              : "rgba(255, 255, 255, 0.1)",
            color: onCream ? "rgba(10,10,15,0.5)" : "rgba(255,255,255,0.5)",
          }}
        >
          <span className="material-symbols-outlined text-[16px]">person</span>
        </div>
      </div>

      {settingsOpen && (
        <SettingsPanel
          onCream={onCream}
          anchor={gearRef.current}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}
