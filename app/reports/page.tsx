"use client";

// ─── Reports page ─────────────────────────────────────────────────────────
// Archive of all calls Siren AI has triaged. Each row opens the situation
// sheet; the "Download PDF" action opens it with ?print=1 which auto-fires
// window.print() (letting the browser save the page as a clean PDF).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Incident } from "../_lib/types";

type SortKey = "severity" | "time" | "name";

function severityScore(i: Incident): number {
  if (typeof i.severityScore === "number" && i.severityScore > 0) {
    return Math.max(1, Math.min(10, Math.round(i.severityScore)));
  }
  const base = i.priority === "HIGH" ? 9 : i.priority === "MEDIUM" ? 6 : 3;
  const casualtyBump = Math.min(2, Math.floor((i.casualties ?? 0) / 2));
  const low =
    i.priority === "LOW" || (i.confidenceScore && i.confidenceScore < 35)
      ? 1
      : 0;
  return Math.max(1, Math.min(10, base + casualtyBump - low));
}

function severityHex(score: number): string {
  const ramp: Record<number, string> = {
    1: "#2dd4bf",
    2: "#4ade80",
    3: "#a3e635",
    4: "#facc15",
    5: "#fb923c",
    6: "#f97316",
    7: "#ef4444",
    8: "#dc2626",
    9: "#b91c1c",
    10: "#7f1d1d",
  };
  return ramp[Math.max(1, Math.min(10, Math.round(score)))];
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function ReportsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch("/api/incidents");
        if (res.ok) {
          const data = await res.json();
          setIncidents(data);
        }
      } catch {
        /* offline */
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const rows = useMemo(() => {
    const decorated = incidents.map((i) => ({
      incident: i,
      score: severityScore(i),
    }));
    const filtered = query
      ? decorated.filter(({ incident }) => {
          const needle = query.toLowerCase();
          return (
            incident.title?.toLowerCase().includes(needle) ||
            incident.location?.toLowerCase().includes(needle) ||
            incident.id?.toLowerCase().includes(needle) ||
            incident.type?.toLowerCase().includes(needle)
          );
        })
      : decorated;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "severity") return b.score - a.score;
      if (sortKey === "name") return a.incident.title.localeCompare(b.incident.title);
      // time — fall back to id ordering (incidents lack a real timestamp)
      return a.incident.id.localeCompare(b.incident.id);
    });
    return sorted;
  }, [incidents, query, sortKey]);

  const headerRef = useReveal<HTMLDivElement>();

  return (
    <div className="h-full overflow-y-auto bg-surface-lowest">
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        {/* Header */}
        <div ref={headerRef} className="reveal mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary-dim mb-2">
            Archive
          </p>
          <h1 className="font-display text-[48px] leading-[0.95] tracking-tight text-on-surface">
            Call{" "}
            <span className="italic bg-gradient-to-r from-primary-dim via-primary to-brand bg-clip-text text-transparent">
              reports.
            </span>
          </h1>
          <p className="mt-3 text-[14px] text-on-surface-variant max-w-xl">
            Every call triaged by Siren AI is kept here. Download a clean PDF
            transcript for incident review, training, or records.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, location, or ID"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-low border border-outline-variant/30 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary-dim/50 focus:bg-surface transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-low border border-outline-variant/30">
            {(["severity", "time", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold uppercase tracking-[0.14em] transition-all ${
                  sortKey === k
                    ? "bg-primary-container text-primary-dim"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {k === "severity"
                  ? "Severity"
                  : k === "time"
                    ? "Recency"
                    : "Name"}
              </button>
            ))}
          </div>
          <div className="ml-auto text-[11px] text-on-surface-variant">
            {rows.length} {rows.length === 1 ? "report" : "reports"}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <SkeletonTable />
        ) : rows.length === 0 ? (
          <EmptyState hasQuery={!!query} />
        ) : (
          <div className="rounded-2xl border border-outline-variant/30 overflow-hidden bg-surface-low/50">
            <div className="grid grid-cols-[60px_minmax(0,1fr)_160px_120px_200px] gap-4 px-5 py-3 border-b border-outline-variant/30 bg-surface-low">
              <HeaderCell>Sev</HeaderCell>
              <HeaderCell>Incident</HeaderCell>
              <HeaderCell>Location</HeaderCell>
              <HeaderCell>ID</HeaderCell>
              <HeaderCell className="text-right">Actions</HeaderCell>
            </div>
            <ul className="divide-y divide-outline-variant/15">
              {rows.map(({ incident, score }, idx) => (
                <ReportRow
                  key={incident.id}
                  incident={incident}
                  score={score}
                  index={idx}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[9.5px] font-bold uppercase tracking-[0.2em] text-on-surface-variant ${className}`}
    >
      {children}
    </div>
  );
}

function ReportRow({
  incident,
  score,
  index,
}: {
  incident: Incident;
  score: number;
  index: number;
}) {
  const ref = useReveal<HTMLLIElement>();
  const hex = severityHex(score);

  const handlePdf = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const w = window.open(
      `/situation-sheet/${incident.id}?print=1`,
      "_blank",
      "noopener"
    );
    if (!w) {
      // popup blocked — fall back to same-tab with a notice
      window.location.href = `/situation-sheet/${incident.id}?print=1`;
    }
  };

  return (
    <li
      ref={ref}
      className="reveal"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      <Link
        href={`/situation-sheet/${incident.id}`}
        className="grid grid-cols-[60px_minmax(0,1fr)_160px_120px_200px] gap-4 px-5 py-4 items-center hover:bg-surface-high/40 transition-colors group"
      >
        {/* Severity pill */}
        <div className="flex items-center">
          <div
            className="flex items-center justify-center h-10 w-10 rounded-lg font-display text-[22px] font-black leading-none"
            style={{
              background: `${hex}22`,
              color: hex,
              border: `1px solid ${hex}55`,
              boxShadow: `0 0 20px ${hex}33`,
            }}
          >
            {score}
          </div>
        </div>

        {/* Title + type */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-[0.16em]"
              style={{
                background:
                  incident.priority === "HIGH"
                    ? "#ff3a3a"
                    : incident.priority === "MEDIUM"
                      ? "rgba(251,191,36,0.18)"
                      : "rgba(148,163,184,0.18)",
                color:
                  incident.priority === "HIGH"
                    ? "white"
                    : incident.priority === "MEDIUM"
                      ? "#fbbf24"
                      : "#9aa3b8",
              }}
            >
              {incident.priority}
            </span>
            <span className="text-[11px] text-on-surface-variant">
              {incident.type}
            </span>
          </div>
          <p className="text-[14px] font-semibold text-on-surface truncate group-hover:text-white transition-colors">
            {incident.title}
          </p>
        </div>

        {/* Location */}
        <div className="min-w-0 flex items-center gap-1.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">
            location_on
          </span>
          <span className="truncate">{incident.location}</span>
        </div>

        {/* ID */}
        <div className="text-[11px] font-mono text-on-surface-variant">
          {incident.id.slice(0, 8)}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handlePdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary-dim/30 bg-primary-container text-primary-dim text-[10.5px] font-bold uppercase tracking-[0.12em] hover:bg-primary-dim/20 hover:border-primary-dim/50 transition-colors"
            title="Download PDF transcript"
          >
            <span className="material-symbols-outlined text-[14px]">
              picture_as_pdf
            </span>
            PDF
          </button>
          <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant group-hover:text-on-surface group-hover:border-outline-variant/60 text-[10.5px] font-bold uppercase tracking-[0.12em] transition-colors">
            <span className="material-symbols-outlined text-[14px]">
              open_in_new
            </span>
            Open
          </span>
        </div>
      </Link>
    </li>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-2xl border border-outline-variant/30 overflow-hidden bg-surface-low/50">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[60px_minmax(0,1fr)_160px_120px_200px] gap-4 px-5 py-4 items-center border-b border-outline-variant/15 last:border-0 animate-pulse"
        >
          <div className="h-10 w-10 rounded-lg bg-surface-high" />
          <div className="space-y-2">
            <div className="h-3 w-24 bg-surface-high rounded" />
            <div className="h-4 w-64 bg-surface-high rounded" />
          </div>
          <div className="h-3 w-32 bg-surface-high rounded" />
          <div className="h-3 w-16 bg-surface-high rounded" />
          <div className="flex justify-end gap-2">
            <div className="h-7 w-16 bg-surface-high rounded-lg" />
            <div className="h-7 w-20 bg-surface-high rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-low/40 py-16 flex flex-col items-center text-center">
      <div className="h-16 w-16 rounded-full bg-surface-high border border-outline-variant/30 flex items-center justify-center mb-4">
        <span
          className="material-symbols-outlined text-on-surface-variant text-3xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          inbox
        </span>
      </div>
      <h3 className="text-xl font-bold text-on-surface tracking-tight mb-2">
        {hasQuery ? "No reports match" : "No reports yet"}
      </h3>
      <p className="text-[13.5px] text-on-surface-variant max-w-md">
        {hasQuery
          ? "Try a different query, or clear the search to see everything Siren has triaged."
          : "When calls come in, Siren AI's triaged records land here. You can download a PDF transcript for any record."}
      </p>
    </div>
  );
}
