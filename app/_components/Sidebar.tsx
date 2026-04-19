"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/intake", label: "Voice intake", icon: "call" },
  { href: "/", label: "Situations", icon: "monitoring" },
  { href: "/trend-detection", label: "Trend detection", icon: "map" },
  { href: "/sentinel-assist", label: "AI assist", icon: "smart_toy" },
];

const bottomItems = [
  { href: "#", label: "Support", icon: "help" },
  { href: "#", label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-bg flex flex-col border-r border-outline-variant/20 z-50">
      {/* Brand */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-brand-dim flex items-center justify-center border border-brand/30">
            <span className="material-symbols-outlined text-brand" style={{ fontVariationSettings: "'FILL' 1" }}>
              emergency
            </span>
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-on-surface leading-none">
              Siren
            </h2>
            <p className="text-[9px] text-on-surface-variant uppercase tracking-[0.18em] mt-1">
              Voice · Dispatch · AI
            </p>
          </div>
        </div>



        {/* Main Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 py-3.5 px-5 text-xs font-bold uppercase tracking-tight transition-all duration-200 ${
                  isActive
                    ? "bg-surface-high text-brand rounded-r-full shadow-[4px_0_12px_rgba(232,40,26,0.12)] border-l-2 border-brand"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low rounded-r-full"
                }`}
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Navigation */}
      <div className="mt-auto p-6 border-t border-outline-variant/10">
        <nav className="space-y-1">
          {bottomItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center gap-4 text-[#64748b] hover:text-[#94a3b8] py-2.5 px-2 text-[10px] font-bold uppercase tracking-tight transition-colors"
            >
              <span className="material-symbols-outlined text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
