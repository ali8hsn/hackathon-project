"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import MapView from "../../_components/MapView";
import type { Incident } from "../../_lib/types";

type Tab = "report" | "transcripts" | "conflicts";

// ─── Inline Markdown Renderer ────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(
        <strong key={match.index} className="font-semibold text-on-surface">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={match.index} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 bg-surface-lowest rounded text-[12px] font-mono text-brand"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // ── ALL CAPS section header (e.g. "DISPATCH RECOMMENDATION") ────────
    if (
      /^[A-Z][A-Z\s\/\-–&]{3,}$/.test(trimmed) &&
      trimmed.length >= 5 &&
      trimmed === trimmed.toUpperCase()
    ) {
      const isDispatch = /DISPATCH|RECOMMENDATION/.test(trimmed);
      elements.push(
        <h3
          key={i}
          className={`text-[10px] font-black uppercase tracking-[0.22em] mt-8 mb-2.5 first:mt-0 flex items-center gap-2.5 ${
            isDispatch ? "text-brand" : "text-on-surface-variant"
          }`}
        >
          <span
            className={`block w-[3px] h-3.5 rounded-full ${
              isDispatch ? "bg-brand" : "bg-outline-variant/50"
            }`}
          />
          {trimmed}
        </h3>
      );
      i++;
      continue;
    }

    // ── "**Label:**" standalone bold header line ─────────────────────────
    if (/^\*\*[^*:]+:\*\*\s*$/.test(trimmed) || /^\*\*[^*]+\*\*:$/.test(trimmed)) {
      const label = trimmed.replace(/\*\*/g, "").replace(/:$/, "");
      const isDispatch = /recommendation|dispatch/i.test(label);
      elements.push(
        <h3
          key={i}
          className={`text-[10px] font-black uppercase tracking-[0.22em] mt-8 mb-2.5 first:mt-0 flex items-center gap-2.5 ${
            isDispatch ? "text-brand" : "text-on-surface-variant"
          }`}
        >
          <span
            className={`block w-[3px] h-3.5 rounded-full ${
              isDispatch ? "bg-brand" : "bg-outline-variant/50"
            }`}
          />
          {label}
        </h3>
      );
      i++;
      continue;
    }

    // ── Key: Value metadata line (e.g. "Type: CARDIAC ARREST") ──────────
    if (
      /^[A-Za-z][A-Za-z /]{1,22}:\s+\S/.test(trimmed) &&
      trimmed.indexOf(":") < 26 &&
      !trimmed.startsWith("http")
    ) {
      const ci = trimmed.indexOf(":");
      const key = trimmed.slice(0, ci).trim();
      const val = trimmed.slice(ci + 1).trim();
      elements.push(
        <div key={i} className="flex items-baseline gap-2 py-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 shrink-0 min-w-[90px]">
            {key}
          </span>
          <span className="text-[13px] text-on-surface font-medium leading-relaxed">
            {renderInline(val)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(
        <hr key={i} className="border-outline-variant/15 my-6" />
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant mt-6 mb-2"
        >
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="text-[13px] font-bold uppercase tracking-[0.16em] text-brand mt-8 mb-3 flex items-center gap-2 first:mt-0"
        >
          <span className="w-1 h-4 bg-brand rounded-full" />
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="text-lg font-bold text-on-surface mt-8 mb-3 first:mt-0"
        >
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // Bold-only line as a section header
    if (
      /^\*\*.+\*\*$/.test(trimmed) &&
      !trimmed.slice(2, -2).includes("**")
    ) {
      elements.push(
        <h3
          key={i}
          className="text-[13px] font-bold uppercase tracking-[0.16em] text-brand mt-8 mb-3 flex items-center gap-2 first:mt-0"
        >
          <span className="w-1 h-4 bg-brand rounded-full" />
          {trimmed.slice(2, -2)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 border-brand/50 pl-4 my-4 text-on-surface italic bg-brand-dim/40 rounded-r-lg py-2 pr-3"
        >
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="text-[13.5px] leading-relaxed">
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*] /.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(
          <li
            key={i}
            className="flex gap-3 mb-1.5 text-[13.5px] text-on-surface leading-relaxed"
          >
            <span className="text-brand mt-[6px] shrink-0 w-1 h-1 rounded-full bg-brand" />
            <span>{renderInline(lines[i].trim().slice(2))}</span>
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="ml-1 mb-3 space-y-0.5">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+[.)]\s/, "");
        items.push(
          <li
            key={i}
            className="flex gap-3 mb-1.5 text-[13.5px] text-on-surface leading-relaxed"
          >
            <span className="text-brand font-semibold text-xs mt-0.5 shrink-0 w-5 text-right tabular-nums">
              {num}.
            </span>
            <span>{renderInline(content)}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="ml-1 mb-3 space-y-0.5">
          {items}
        </ol>
      );
      continue;
    }

    elements.push(
      <p
        key={i}
        className="text-[13.5px] text-on-surface leading-[1.7] mb-3"
      >
        {renderInline(trimmed)}
      </p>
    );
    i++;
  }

  return elements;
}

// ─── Extract dispatch recommendation for the action banner ──────────────────
function extractDispatchRec(report: string): string | null {
  if (!report) return null;
  const lines = report.split("\n");
  let capturing = false;
  const recLines: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (capturing && recLines.length) break; // blank line ends section
      continue;
    }

    const isHeader =
      /^(DISPATCH RECOMMENDATION|AI RECOMMENDATION|DISPATCH)/i.test(t) ||
      /^\*\*(AI Recommendation|Dispatch Recommendation)[:\*]/i.test(t);

    if (isHeader) {
      capturing = true;
      // inline content after colon on the same line
      const ci = t.indexOf(":");
      if (ci > -1 && ci < t.length - 1) {
        const inline = t
          .slice(ci + 1)
          .trim()
          .replace(/\*\*/g, "");
        if (inline) recLines.push(inline);
      }
      continue;
    }

    if (capturing) {
      // Stop at next section heading
      if (
        (/^[A-Z][A-Z\s]{3,}$/.test(t) && t.length > 4) ||
        /^\*\*[^*]+\*\*:/.test(t) ||
        /^##/.test(t)
      )
        break;
      recLines.push(t.replace(/^[-*•]\s*/, "").replace(/\*\*/g, ""));
    }
  }

  return recLines.filter(Boolean).join(" ").trim() || null;
}

// ─── Helper: strip markdown for plain-text copy ─────────────────────────────
function stripMarkdown(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^>\s+/gm, "  ");
}

export default function SituationSheetPage() {
  const params = useParams();
  const incidentId = params.id as string;
  const searchParams = useSearchParams();
  const printMode = searchParams?.get("print") === "1";

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [isEditing, setIsEditing] = useState(false);
  const [reportText, setReportText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchIncident() {
      setLoading(true);
      try {
        const res = await fetch(`/api/incidents/${incidentId}`);
        if (res.ok) {
          const data = await res.json();
          setIncident(data);
          setReportText(data.aiReport || data.ai_report || "");
        }
      } catch {
        /* Backend not available */
      }
      setLoading(false);
    }
    fetchIncident();
  }, [incidentId]);

  // Auto-fire browser print when the page is opened with ?print=1 — lets
  // /reports "Download PDF" buttons reuse this page as the PDF source.
  useEffect(() => {
    if (!printMode) return;
    if (!incident) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* no-op */
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [printMode, incident]);

  const handleSaveReport = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiReport: reportText }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
      }
    } catch {
      /* Offline — keep local edit */
    }
    setIsEditing(false);
    setIsSaving(false);
  }, [incidentId, reportText]);

  const handleRegenerateReport = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateReport: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        setReportText(updated.aiReport || updated.ai_report || "");
      }
    } catch {
      /* Offline — no-op */
    }
    setIsRegenerating(false);
  }, [incidentId]);

  const handleCopy = useCallback(async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(stripMarkdown(reportText));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }, [reportText]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const conflictCount = incident?.conflicts?.length ?? 0;

  const tabs: { key: Tab; label: string; icon: string; badge?: number }[] = useMemo(
    () => [
      { key: "report", label: "AI Report", icon: "description" },
      {
        key: "transcripts",
        label: "Transcripts",
        icon: "record_voice_over",
        badge: incident?.transcript?.length,
      },
      ...(conflictCount > 0
        ? [
            {
              key: "conflicts" as Tab,
              label: "Conflicts",
              icon: "warning",
              badge: conflictCount,
            },
          ]
        : []),
    ],
    [incident, conflictCount]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-lowest">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-brand animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-on-surface-variant mt-4">
            Loading situation…
          </p>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-lowest">
        <div className="text-center">
          <span
            className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            error
          </span>
          <h2 className="text-xl font-bold text-on-surface mb-2">
            Incident Not Found
          </h2>
          <p className="text-sm text-on-surface-variant mb-6">
            The incident you&apos;re looking for doesn&apos;t exist or
            couldn&apos;t be loaded.
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-bold"
          >
            Back to Monitor
          </Link>
        </div>
      </div>
    );
  }

  const mapsLink = `https://www.openstreetmap.org/?mlat=${incident.coordinates.lat}&mlon=${incident.coordinates.lng}#map=16/${incident.coordinates.lat}/${incident.coordinates.lng}`;

  const priorityStyle =
    incident.priority === "HIGH"
      ? {
          ring: "ring-1 ring-brand/30",
          iconTile: "bg-brand-dim text-brand",
          pill: "bg-brand-dim text-brand border-brand/30",
        }
      : incident.priority === "MEDIUM"
      ? {
          ring: "ring-1 ring-tertiary/25",
          iconTile: "bg-tertiary-container text-tertiary",
          pill: "bg-tertiary-container/40 text-tertiary border-tertiary/30",
        }
      : {
          ring: "ring-1 ring-outline-variant/20",
          iconTile: "bg-surface-highest text-on-surface-variant",
          pill: "bg-surface-high text-on-surface-variant border-outline-variant/30",
        };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-lowest print:bg-white print:text-black">
      {/* ── Incident Header ─────────────────────────────────────────────── */}
      <section
        className={`px-8 py-6 bg-gradient-to-br from-surface-low to-surface-lowest border-b border-outline-variant/10 shrink-0 ${priorityStyle.ring}`}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex gap-5 min-w-0">
            <Link
              href="/"
              className="mt-1.5 p-2 hover:bg-surface-high rounded-lg transition-colors text-on-surface-variant shrink-0"
              aria-label="Back"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div
              className={`h-16 w-16 rounded-2xl ${priorityStyle.iconTile} flex items-center justify-center shrink-0`}
            >
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {incident.icon}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-[0.14em] border ${priorityStyle.pill}`}
                >
                  {incident.priority} Priority
                </span>
                {incident.status && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-[0.14em] border border-outline-variant/25 text-on-surface-variant">
                    {incident.status}
                  </span>
                )}
                <span className="text-on-surface-variant text-[11px] font-mono">
                  #{incident.id.slice(0, 10)}
                </span>
              </div>
              <h1 className="text-[26px] leading-tight font-black tracking-tight text-on-surface truncate">
                {incident.title}
              </h1>
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-on-surface-variant inline-flex items-center gap-1 text-[13px] mt-1 hover:text-brand transition-colors"
              >
                <span className="material-symbols-outlined text-base">
                  location_on
                </span>
                {incident.location}
                <span className="material-symbols-outlined text-xs ml-0.5 opacity-70">
                  open_in_new
                </span>
              </a>
            </div>
          </div>

          <div className="flex items-stretch gap-6 shrink-0">
            <Stat
              label="Callers"
              value={String(incident.callerCount)}
              accent="text-brand"
            />
            <Divider />
            <Stat
              label="Elapsed"
              value={incident.elapsedTime}
              mono
              accent="text-on-surface"
            />
            <Divider />
            <Stat
              label="Confidence"
              value={`${incident.confidenceScore}%`}
              accent="text-brand"
            />
            {incident.casualties > 0 && (
              <>
                <Divider />
                <Stat
                  label="Casualties"
                  value={String(incident.casualties)}
                  accent="text-brand"
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Tab Nav ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-8 pt-3 bg-surface-low/50 shrink-0 print:hidden border-b border-outline-variant/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] rounded-t-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-surface-lowest text-on-surface border-b-2 border-brand -mb-px"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-high/40"
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {tab.icon}
            </span>
            {tab.label}
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span
                className={`ml-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold ${
                  tab.key === "conflicts"
                    ? "bg-brand text-white"
                    : "bg-surface-high text-on-surface-variant"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* REPORT TAB */}
          {activeTab === "report" && (
            <div className="max-w-4xl mx-auto px-8 py-8 space-y-6 print:px-0 print:py-2">
              {/* Key Facts card */}
              <KeyFactsCard incident={incident} />

              {/* Dispatch recommendation banner */}
              {(() => {
                const rec = extractDispatchRec(reportText);
                return rec ? <DispatchBanner recommendation={rec} /> : null;
              })()}

              {/* Conflicts banner */}
              {conflictCount > 0 && (
                <button
                  onClick={() => setActiveTab("conflicts")}
                  className="w-full flex items-center justify-between gap-4 px-5 py-3 rounded-xl bg-tertiary-container/30 border border-tertiary/30 text-left hover:bg-tertiary-container/40 transition-colors print:hidden"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="material-symbols-outlined text-tertiary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      warning
                    </span>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-tertiary">
                        {conflictCount} Statement Conflict
                        {conflictCount === 1 ? "" : "s"} Detected
                      </p>
                      <p className="text-[12px] text-on-surface-variant mt-0.5">
                        Callers disagree on key details — review before
                        dispatch.
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-tertiary">
                    arrow_forward
                  </span>
                </button>
              )}

              {/* Report controls */}
              <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="material-symbols-outlined text-brand shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    smart_toy
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-on-surface leading-none">
                      AI-Generated Situation Report
                    </h2>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Synthesized from {incident.transcript.length}{" "}
                      transcript entries across {incident.callerCount} caller
                      {incident.callerCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <IconButton
                    icon={copied ? "check" : "content_copy"}
                    label={copied ? "Copied" : "Copy"}
                    onClick={handleCopy}
                    disabled={!reportText}
                  />
                  <IconButton
                    icon="print"
                    label="Print"
                    onClick={handlePrint}
                  />
                  <IconButton
                    icon={isRegenerating ? "progress_activity" : "autorenew"}
                    iconClassName={isRegenerating ? "animate-spin" : ""}
                    label={isRegenerating ? "Regenerating" : "Regenerate"}
                    onClick={handleRegenerateReport}
                    disabled={isRegenerating}
                  />
                  <IconButton
                    icon={isSaving ? "hourglass_top" : isEditing ? "check" : "edit"}
                    label={isSaving ? "Saving" : isEditing ? "Save" : "Edit"}
                    onClick={() =>
                      isEditing ? handleSaveReport() : setIsEditing(true)
                    }
                    disabled={isSaving}
                    primary
                  />
                </div>
              </div>

              {/* Report body */}
              {isEditing ? (
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  className="w-full h-[560px] bg-surface-low border border-outline-variant/20 rounded-2xl p-6 text-[13px] leading-relaxed text-on-surface font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40"
                />
              ) : (
                <article className="bg-surface-low rounded-2xl border border-outline-variant/10 px-8 py-8 shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset] print:bg-white print:text-black print:border-0 print:shadow-none print:px-0">
                  {reportText ? (
                    <div className="prose prose-invert max-w-none">
                      {renderMarkdown(reportText)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <span
                        className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        auto_awesome
                      </span>
                      <p className="text-sm text-on-surface-variant mb-4">
                        No AI report yet. Click Regenerate to synthesize one
                        from the live transcript.
                      </p>
                      <button
                        onClick={handleRegenerateReport}
                        disabled={isRegenerating}
                        className="px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-brand-dark transition-colors disabled:opacity-50"
                      >
                        {isRegenerating ? "Generating…" : "Generate Report"}
                      </button>
                    </div>
                  )}
                </article>
              )}

              {/* Footer meta */}
              <div className="text-[11px] text-on-surface-variant/70 flex items-center gap-2 justify-end print:hidden">
                <span className="material-symbols-outlined text-xs">
                  shield
                </span>
                Generated by Siren · AI-assisted summary — verify before
                dispatch.
              </div>
            </div>
          )}

          {/* TRANSCRIPTS TAB */}
          {activeTab === "transcripts" && (
            <div className="max-w-3xl mx-auto px-8 py-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                <h2 className="text-[15px] font-bold text-on-surface">
                  Live Call Transcripts
                </h2>
                <span className="text-[11px] text-on-surface-variant">
                  {incident.transcript.length} entries · {incident.callerCount}{" "}
                  caller{incident.callerCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-3">
                {incident.transcript.map((entry, i) => {
                  const isAI = entry.isAI;
                  const isDispatch = entry.speaker.includes("DISPATCH");
                  return (
                    <div
                      key={i}
                      className={`flex gap-3 ${
                        isDispatch || isAI ? "flex-row-reverse text-right" : ""
                      } ${entry.isLive ? "animate-pulse" : ""}`}
                    >
                      <div
                        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isAI
                            ? "bg-brand-dim text-brand"
                            : isDispatch
                            ? "bg-surface-high text-on-surface-variant"
                            : "bg-tertiary-container/50 text-tertiary"
                        }`}
                      >
                        <span
                          className="material-symbols-outlined text-base"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {isAI
                            ? "smart_toy"
                            : isDispatch
                            ? "support_agent"
                            : "person"}
                        </span>
                      </div>
                      <div
                        className={`min-w-0 max-w-[78%] ${
                          isDispatch || isAI ? "items-end" : ""
                        }`}
                      >
                        <div
                          className={`flex items-center gap-2 mb-1 ${
                            isDispatch || isAI ? "justify-end" : ""
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isAI
                                ? "text-brand"
                                : isDispatch
                                ? "text-on-surface-variant"
                                : "text-on-surface"
                            }`}
                          >
                            {entry.speaker}
                          </span>
                          <span className="text-[10px] font-mono text-on-surface-variant/70">
                            {entry.time}
                          </span>
                          {entry.isLive && (
                            <span className="text-[9px] font-bold text-brand uppercase tracking-widest">
                              ● Live
                            </span>
                          )}
                        </div>
                        <div
                          className={`inline-block px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                            isAI
                              ? "bg-brand-dim text-on-surface border border-brand/20 rounded-tr-sm"
                              : isDispatch
                              ? "bg-surface-high text-on-surface rounded-tr-sm"
                              : "bg-surface-low text-on-surface rounded-tl-sm"
                          }`}
                        >
                          {entry.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CONFLICTS TAB */}
          {activeTab === "conflicts" && (
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="material-symbols-outlined text-tertiary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  warning
                </span>
                <h2 className="text-[15px] font-bold text-on-surface">
                  Statement Conflicts
                </h2>
                <span className="text-[11px] text-on-surface-variant">
                  {conflictCount} detected
                </span>
              </div>
              <p className="text-[12.5px] text-on-surface-variant mb-4">
                Siren flags moments when callers disagree on critical
                details. Review each before assigning units.
              </p>

              {incident.conflicts.map((conflict, i) => (
                <div
                  key={i}
                  className="bg-surface-low rounded-2xl border border-outline-variant/10 overflow-hidden"
                >
                  <div className="px-5 py-3 bg-tertiary-container/20 border-b border-tertiary/20 flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary text-base">
                      flag
                    </span>
                    <span className="text-[11px] font-bold text-tertiary uppercase tracking-[0.12em]">
                      Conflict — {conflict.field}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-outline-variant/10">
                    <div className="p-5">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">
                        {conflict.callerA.id}
                      </p>
                      <p className="text-[13px] text-on-surface leading-relaxed italic">
                        “{conflict.callerA.statement}”
                      </p>
                    </div>
                    <div className="p-5 bg-tertiary-container/10">
                      <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-1.5">
                        {conflict.callerB.id}
                      </p>
                      <p className="text-[13px] text-on-surface leading-relaxed italic">
                        “{conflict.callerB.statement}”
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Map + Units ───────────────────────────────────────── */}
        <aside className="w-96 bg-surface-lowest border-l border-outline-variant/10 flex flex-col shrink-0 print:hidden">
          <div className="p-4 border-b border-outline-variant/10 bg-surface-low flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand text-base">
                map
              </span>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface">
                Location
              </h3>
            </div>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-brand hover:underline flex items-center gap-1 uppercase tracking-wider"
            >
              Open in Maps{" "}
              <span className="material-symbols-outlined text-xs">
                open_in_new
              </span>
            </a>
          </div>
          <div className="h-72 relative shrink-0">
            <MapView
              pins={[
                {
                  id: incident.id,
                  lat: incident.coordinates?.lat ?? 0,
                  lng: incident.coordinates?.lng ?? 0,
                  label: incident.title,
                  severity: incident.severityScore,
                  active: true,
                },
              ]}
            />
          </div>

          {/* Confidence bars */}
          {incident.confidenceLevels &&
            incident.confidenceLevels.length > 0 && (
              <div className="p-4 border-t border-outline-variant/10 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                  Confidence Breakdown
                </h4>
                {incident.confidenceLevels.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-on-surface-variant">
                        {c.label}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-on-surface">
                        {c.value}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all"
                        style={{ width: `${c.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* Units */}
          {incident.unitsAssigned && incident.unitsAssigned.length > 0 && (
            <div className="p-4 border-t border-outline-variant/10">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant mb-2">
                Units Dispatched
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {incident.unitsAssigned.map((u, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-md bg-surface-high text-[11px] font-mono font-bold text-on-surface border border-outline-variant/20"
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Small components ───────────────────────────────────────────────────────

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.14em]">
        {label}
      </p>
      <p
        className={`text-2xl font-black leading-tight ${
          mono ? "font-mono" : ""
        } ${accent ?? "text-on-surface"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Divider() {
  return <div className="w-px bg-outline-variant/20 self-stretch" />;
}

function IconButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
  iconClassName,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  iconClassName?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
        primary
          ? "bg-brand text-white hover:bg-brand-dark"
          : "bg-surface-high text-on-surface hover:bg-surface-bright border border-outline-variant/20"
      }`}
    >
      <span
        className={`material-symbols-outlined text-sm ${iconClassName ?? ""}`}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function DispatchBanner({ recommendation }: { recommendation: string }) {
  return (
    <div className="rounded-2xl bg-brand-dim border border-brand/25 overflow-hidden print:border-brand/40">
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-brand/15 bg-brand/5">
        <span
          className="material-symbols-outlined text-brand text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          emergency_share
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">
          Dispatch Recommendation
        </span>
      </div>
      <p className="px-5 py-4 text-[14px] leading-relaxed text-on-surface font-medium">
        {recommendation}
      </p>
    </div>
  );
}

function KeyFactsCard({ incident }: { incident: Incident }) {
  const facts = incident.aggregatedDetails?.slice(0, 6) ?? [];
  if (!facts.length) return null;
  return (
    <div className="bg-surface-low rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="px-6 py-3 border-b border-outline-variant/10 flex items-center gap-2 bg-surface-low">
        <span
          className="material-symbols-outlined text-brand text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          stars
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface">
          Key Facts
        </h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-outline-variant/10">
        {facts.map((f, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-[13px] text-on-surface-variant">
                {f.icon}
              </span>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.12em]">
                {f.label}
              </p>
            </div>
            <p className="text-[13px] font-semibold text-on-surface leading-snug">
              {f.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
