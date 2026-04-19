"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppState, useAppDispatch } from "../_lib/store";

export default function TopNav() {
  const { sentinelAssistEnabled } = useAppState();
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";

  return (
    <header className="flex justify-between items-center w-full px-6 sticky top-0 z-40 h-16 bg-bg border-b border-outline-variant/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.35)]">
      {/* Left: nav + Siren + Status */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          {!isHome && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/25 text-on-surface-variant hover:bg-surface-high hover:text-on-surface text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back
            </button>
          )}
          <Link
            href="/"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand/30 bg-brand-dim text-brand text-[10px] font-bold uppercase tracking-wider hover:bg-brand/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">home</span>
            Home
          </Link>
        </div>
        <div className="flex flex-col gap-0.5 select-none min-w-0">
          <span className="text-xl font-black tracking-tight text-brand leading-none truncate">
            Siren
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant/80">
            Dispatch console
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-brand-dim border border-brand/25 rounded-full">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
            System Status: Normal
          </span>
        </div>
      </div>

      {/* Right: Sentinel Assist + Settings + Avatar */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "TOGGLE_SENTINEL_ASSIST" })}
          className={`px-4 py-1.5 rounded-full flex items-center gap-2 border transition-all duration-300 cursor-pointer ${
            sentinelAssistEnabled
              ? "bg-tertiary-container border-tertiary/30 shadow-[0_0_16px_rgba(255,183,128,0.15)]"
              : "bg-surface-high border-outline-variant/30 hover:border-outline-variant/60"
          }`}
        >
          <span
            className={`material-symbols-outlined text-sm ${sentinelAssistEnabled ? "text-tertiary" : "text-on-surface-variant"}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${
              sentinelAssistEnabled ? "text-tertiary" : "text-on-surface-variant"
            }`}
          >
            {sentinelAssistEnabled ? "AI Assist Active" : "AI Assist Off"}
          </span>
        </button>

        <button className="p-2 hover:bg-surface-high rounded-lg transition-colors text-[#64748b] hover:text-primary">
          <span className="material-symbols-outlined text-lg">settings</span>
        </button>

        <div className="w-8 h-8 rounded-full bg-surface-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant">
          <span className="material-symbols-outlined text-sm">person</span>
        </div>
      </div>
    </header>
  );
}
