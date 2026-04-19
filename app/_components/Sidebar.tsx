"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryNav = [
  { href: "/", label: "Home", icon: "home_work" },
  { href: "/reports", label: "Reports", icon: "description" },
];

const secondaryNav = [
  { href: "/intake", label: "Voice Intake", icon: "call" },
  { href: "/phone-calls", label: "Phone Calls", icon: "phone_in_talk" },
  { href: "/haashir-assist", label: "AI Assist", icon: "smart_toy" },
  { href: "/trend-detection", label: "Trends", icon: "query_stats" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <aside
      className="fixed left-0 top-0 h-full w-64 flex flex-col border-r z-50"
      style={{
        background: "rgba(10, 10, 15, 0.92)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        borderColor: "rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Brand */}
      <div className="px-6 pt-7 pb-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div
            className="relative h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
              boxShadow: "0 4px 20px rgba(167, 139, 250, 0.3)",
            }}
          >
            <span
              className="material-symbols-outlined text-white text-[22px]"
              style={{ fontVariationSettings: "'FILL' 1 'wght' 600" }}
            >
              graphic_eq
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-[20px] font-black tracking-tight leading-none flex items-baseline gap-1.5 text-white">
              Siren
              <span
                className="font-display text-[21px] italic"
                style={{ color: "#a78bfa" }}
              >
                AI
              </span>
            </h1>
            <p
              className="text-[9px] uppercase tracking-[0.22em] mt-1.5 font-semibold"
              style={{ color: "rgba(255, 255, 255, 0.5)" }}
            >
              Dispatch console
            </p>
          </div>
        </Link>
      </div>

      <div
        className="h-px mx-6 mb-4"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)",
        }}
      />

      {/* Primary nav */}
      <nav className="px-4 space-y-1">
        {primaryNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold tracking-tight transition-all duration-200"
              style={{
                background: active
                  ? "linear-gradient(90deg, rgba(167,139,250,0.18), rgba(167,139,250,0.04))"
                  : "transparent",
                color: active ? "#c4b5fd" : "rgba(255,255,255,0.65)",
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full"
                  style={{
                    background: "#a78bfa",
                    boxShadow: "0 0 12px rgba(167,139,250,0.6)",
                  }}
                />
              )}
              <span
                className="material-symbols-outlined text-[20px]"
                style={
                  active
                    ? { fontVariationSettings: "'FILL' 1 'wght' 500" }
                    : undefined
                }
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Tools section */}
      <p
        className="px-7 mt-7 mb-2 text-[9px] font-bold uppercase tracking-[0.22em]"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        Tools
      </p>
      <nav className="px-4 space-y-0.5">
        {secondaryNav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 hover:bg-white/5"
              style={{
                color: active ? "white" : "rgba(255,255,255,0.55)",
                background: active ? "rgba(255,255,255,0.06)" : undefined,
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status card */}
      <div
        className="mx-4 mt-7 rounded-2xl p-4 border"
        style={{
          background: "rgba(167, 139, 250, 0.06)",
          borderColor: "rgba(167, 139, 250, 0.2)",
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
              style={{ background: "#a78bfa" }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: "#a78bfa" }}
            />
          </span>
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#c4b5fd" }}
          >
            System online
          </p>
        </div>
        <p
          className="text-[11px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Listening on all intake channels. Transcripts streaming live.
        </p>
      </div>

    </aside>
  );
}
