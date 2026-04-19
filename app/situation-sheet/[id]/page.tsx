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
type DispatchRec = {
  priority: string | null; // "P1" | "P2" | "P3" | "P4" | null
  address: string | null;
  immediate: string[];
  bystander: string[];
  responder: string[];
  legacyParagraph: string | null;
};

function extractDispatchRec(report: string): DispatchRec | null {
  if (!report) return null;
  const lines = report.split("\n");

  // First, isolate the DISPATCH RECOMMENDATION block.
  let inBlock = false;
  const blockLines: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    const isStart =
      /^##?\s*(DISPATCH RECOMMENDATION|AI RECOMMENDATION)\b/i.test(t) ||
      /^\*\*(Dispatch Recommendation|AI Recommendation)[:\*]/i.test(t);
    if (!inBlock && isStart) {
      inBlock = true;
      // capture trailing inline content after colon, if any
      const ci = t.indexOf(":");
      if (ci > -1 && ci < t.length - 1) {
        const inline = t
          .slice(ci + 1)
          .trim()
          .replace(/\*\*/g, "");
        if (inline) blockLines.push(inline);
      }
      continue;
    }
    if (!inBlock) continue;
    // Stop at the next top-level heading
    if (/^##\s+/.test(t) && !/^###/.test(t)) break;
    blockLines.push(raw);
  }
  if (!blockLines.length) return null;

  // Walk the block looking for the structured markers.
  let priority: string | null = null;
  let address: string | null = null;
  const buckets = {
    immediate: [] as string[],
    bystander: [] as string[],
    responder: [] as string[],
  };
  let cursor: keyof typeof buckets | null = null;

  // Free-form fallback prose for legacy/unstructured reports.
  const proseFallback: string[] = [];

  for (const raw of blockLines) {
    const t = raw.trim();
    if (!t) continue;

    const pMatch = t.match(/^(?:\*\*)?priority(?:\*\*)?\s*[:\-]\s*(.+)$/i);
    if (pMatch) {
      const v = pMatch[1].replace(/[*_`]/g, "").trim();
      const norm = v.match(/p\s*[1-4]/i);
      priority = norm ? norm[0].replace(/\s+/g, "").toUpperCase() : v;
      continue;
    }
    const aMatch = t.match(/^(?:\*\*)?address(?:\*\*)?\s*[:\-]\s*(.+)$/i);
    if (aMatch) {
      address = aMatch[1].replace(/[*_`]/g, "").trim();
      continue;
    }

    // Sub-section headers (### IMMEDIATE DISPATCH etc.)
    const subHeader = t.replace(/^#{2,4}\s*/, "").replace(/[*_`]/g, "").trim().toUpperCase();
    if (/^IMMEDIATE\s*DISPATCH/.test(subHeader)) {
      cursor = "immediate";
      continue;
    }
    if (/^BYSTANDER\s*INSTRUCTIONS?/.test(subHeader)) {
      cursor = "bystander";
      continue;
    }
    if (/^RESPONDER\s*PREPARATION/.test(subHeader)) {
      cursor = "responder";
      continue;
    }

    // Bullet lines belong to whatever cursor we last saw.
    if (/^[-*•]\s+/.test(t) && cursor) {
      const text = t.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim();
      if (text) buckets[cursor].push(text);
      continue;
    }

    // Plain prose fallback (legacy paragraph format)
    proseFallback.push(t.replace(/^[-*•]\s*/, "").replace(/\*\*/g, ""));
  }

  const hasStructured =
    !!priority ||
    !!address ||
    buckets.immediate.length > 0 ||
    buckets.bystander.length > 0 ||
    buckets.responder.length > 0;

  if (hasStructured) {
    return {
      priority,
      address,
      immediate: buckets.immediate,
      bystander: buckets.bystander,
      responder: buckets.responder,
      legacyParagraph: null,
    };
  }

  const paragraph = proseFallback.join(" ").trim();
  if (!paragraph) return null;

  // Even when the model regresses to a prose paragraph, surface it as the
  // structured card by splitting on sentences and bucketing by verb/keyword.
  const synth = synthesizeStructuredFromProse(paragraph);
  if (synth) {
    return {
      priority: synth.priority,
      address: synth.address,
      immediate: synth.immediate,
      bystander: synth.bystander,
      responder: synth.responder,
      legacyParagraph: null,
    };
  }

  return {
    priority: null,
    address: null,
    immediate: [],
    bystander: [],
    responder: [],
    legacyParagraph: paragraph,
  };
}

// Deterministic last-resort splitter: turn a free-prose dispatch recommendation
// into the structured {priority, address, immediate, bystander, responder} shape
// the new card expects. Used when the model regresses or when an older saved
// report predates the structured prompt.
function synthesizeStructuredFromProse(prose: string): {
  priority: string | null;
  address: string | null;
  immediate: string[];
  bystander: string[];
  responder: string[];
} | null {
  if (!prose) return null;

  let priority: string | null = null;
  const pMatch = prose.match(/\b(P\s*[1-4]|Priority\s+[1-4])\b/i);
  if (pMatch) {
    const num = pMatch[0].match(/[1-4]/);
    if (num) priority = `P${num[0]}`;
  }
  if (!priority) {
    if (/life[-\s]threatening|critical|immediate threat/i.test(prose)) priority = "P1";
    else if (/urgent|serious/i.test(prose)) priority = "P2";
  }

  let address: string | null = null;
  const addrMatch = prose.match(
    /\b(?:to|at)\s+([0-9][^.;,]*?(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Highway|Hwy\.?|Parkway|Pkwy\.?)[^.;]*)/i
  );
  if (addrMatch) {
    address = addrMatch[1]
      .replace(/\s+as\s+priority.*$/i, "")
      .replace(/[,.\s]+$/g, "")
      .trim();
  }

  const sentences = prose
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const immediate: string[] = [];
  const bystander: string[] = [];
  const responder: string[] = [];

  for (const raw of sentences) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const lower = s.toLowerCase();

    if (
      /\b(instruct|tell|advise|have)\s+(bystander|caller|witness|family|patient)/i.test(s) ||
      /\bbystanders?\b/i.test(s) ||
      /\bcallers?\s+(should|to)\b/i.test(s)
    ) {
      bystander.push(s);
      continue;
    }

    if (
      /\b(first responders|responders should|prepare for|stage|brief|establish|identify staging|access to|ready for|set up)/i.test(
        lower
      )
    ) {
      responder.push(s);
      continue;
    }

    if (/^(dispatch|send|deploy|page|roll|launch|notify)/i.test(s)) {
      immediate.push(s);
      continue;
    }

    immediate.push(s);
  }

  // Trim each bucket to a reasonable length and shorten over-long sentences.
  const tidy = (arr: string[]) =>
    arr
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0)
      .slice(0, 4);

  const out = {
    priority,
    address,
    immediate: tidy(immediate),
    bystander: tidy(bystander),
    responder: tidy(responder),
  };

  if (out.immediate.length + out.bystander.length + out.responder.length === 0) {
    return null;
  }

  return out;
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
  const [regenToast, setRegenToast] = useState<string | null>(null);
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
    setRegenToast(null);
    let ok = false;
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
        ok = true;
      }
    } catch {
      /* Offline — toast below will surface the failure */
    }
    setIsRegenerating(false);
    setRegenToast(
      ok
        ? "Report regenerated — fresh dispatch recommendation ready"
        : "Report regeneration failed — try again in a moment"
    );
    // Auto-dismiss after a few seconds; user can re-trigger anytime.
    setTimeout(() => setRegenToast(null), 4500);
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

      {/* ── Regenerate toast ─────────────────────────────────────────────── */}
      {regenToast && <RegenToast text={regenToast} onClose={() => setRegenToast(null)} />}

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
                if (!rec) return null;
                const fallbackAddress = rec.address ?? incident?.location ?? null;
                return <DispatchBanner rec={rec} fallbackAddress={fallbackAddress} />;
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
                <article className="bg-surface-low rounded-2xl border border-outline-variant/10 px-8 py-8 shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset] print:bg-white print:text-black print:border-0 print:shadow-none print:px-0 relative overflow-hidden">
                  {isRegenerating ? (
                    <ReportShimmer />
                  ) : reportText ? (
                    <div
                      key={reportText.length}
                      className="prose prose-invert max-w-none siren-fade-in"
                    >
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
                        No AI report yet. Click Generate to synthesize one
                        from the live transcript.
                      </p>
                      <button
                        onClick={handleRegenerateReport}
                        disabled={isRegenerating}
                        className="px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-brand-dark transition-colors disabled:opacity-50"
                      >
                        Generate Report
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

// ─── Dispatch Recommendation card ───────────────────────────────────────────
// Purple/white high-contrast card with priority pill + address header up top,
// then a 3-column grid of categorised bullet lists. Quick-copy buttons for the
// address and full instruction set so dispatchers can paste into CAD/radio.
function priorityStyle(priority: string | null): {
  label: string;
  bg: string;
  fg: string;
  ring: string;
  pulse: boolean;
} {
  const p = (priority || "").toUpperCase();
  if (p.startsWith("P1")) {
    return {
      label: "Priority 1 — Life Threat",
      bg: "#dc2626",
      fg: "#ffffff",
      ring: "rgba(220,38,38,0.35)",
      pulse: true,
    };
  }
  if (p.startsWith("P2")) {
    return {
      label: "Priority 2 — Urgent",
      bg: "#ea580c",
      fg: "#ffffff",
      ring: "rgba(234,88,12,0.30)",
      pulse: false,
    };
  }
  if (p.startsWith("P3")) {
    return {
      label: "Priority 3 — Non-Urgent",
      bg: "#ca8a04",
      fg: "#ffffff",
      ring: "rgba(202,138,4,0.30)",
      pulse: false,
    };
  }
  if (p.startsWith("P4")) {
    return {
      label: "Priority 4 — Informational",
      bg: "#475569",
      fg: "#ffffff",
      ring: "rgba(71,85,105,0.30)",
      pulse: false,
    };
  }
  return {
    label: priority || "Priority — Pending",
    bg: "#7c3aed",
    fg: "#ffffff",
    ring: "rgba(124,58,237,0.30)",
    pulse: false,
  };
}

function DispatchBanner({
  rec,
  fallbackAddress,
}: {
  rec: DispatchRec;
  fallbackAddress: string | null;
}) {
  const [copied, setCopied] = useState<"address" | "instructions" | null>(null);

  const address = rec.address ?? fallbackAddress;
  const priority = priorityStyle(rec.priority);

  // Plain-text instructions block for the "Copy Instructions" button.
  const instructionsText = useMemo(() => {
    if (rec.legacyParagraph) return rec.legacyParagraph;
    const lines: string[] = [];
    if (rec.priority) lines.push(`Priority: ${rec.priority}`);
    if (address) lines.push(`Address: ${address}`);
    if (rec.immediate.length) {
      lines.push("", "IMMEDIATE DISPATCH:");
      rec.immediate.forEach((i) => lines.push(`- ${i}`));
    }
    if (rec.bystander.length) {
      lines.push("", "BYSTANDER INSTRUCTIONS:");
      rec.bystander.forEach((i) => lines.push(`- ${i}`));
    }
    if (rec.responder.length) {
      lines.push("", "RESPONDER PREPARATION:");
      rec.responder.forEach((i) => lines.push(`- ${i}`));
    }
    return lines.join("\n").trim();
  }, [rec, address]);

  const copy = useCallback(
    async (kind: "address" | "instructions", text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(kind);
        setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
      } catch {
        // Clipboard blocked — silently no-op so the demo doesn't throw.
      }
    },
    []
  );

  // Legacy paragraph fallback — keep the old saved reports rendering cleanly.
  if (rec.legacyParagraph) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="rounded-2xl overflow-hidden print:border print:border-brand/40 dispatch-banner-legacy"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(124,58,237,0.20)",
          boxShadow: "0 1px 2px rgba(15,15,30,0.04)",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{
            borderBottom: "1px solid rgba(124,58,237,0.10)",
            background: "linear-gradient(180deg,#faf5ff 0%,#ffffff 100%)",
          }}
        >
          <span
            className="material-symbols-outlined text-base"
            style={{ color: "#7c3aed", fontVariationSettings: "'FILL' 1" }}
          >
            emergency_share
          </span>
          <span
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#6d28d9" }}
          >
            Dispatch Recommendation
          </span>
        </div>
        <p
          className="px-5 py-4 text-[14px] leading-relaxed font-medium"
          style={{ color: "#1f1933" }}
        >
          {rec.legacyParagraph}
        </p>
      </div>
    );
  }

  const Section = ({
    icon,
    title,
    items,
    emptyHint,
  }: {
    icon: string;
    title: string;
    items: string[];
    emptyHint: string;
  }) => (
    <div
      className="flex flex-col gap-3 p-4 rounded-xl"
      style={{
        background: "#ffffff",
        border: "1px solid rgba(124,58,237,0.18)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ color: "#7c3aed", fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <h4
          className="text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ color: "#5b21b6" }}
        >
          {title}
        </h4>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-[13px] leading-snug font-medium"
              style={{ color: "#1f1933" }}
            >
              <span
                className="mt-[6px] inline-block flex-none rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: "#7c3aed",
                }}
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] italic" style={{ color: "#6b7280" }}>
          {emptyHint}
        </p>
      )}
    </div>
  );

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-label="Dispatch recommendation"
      className="rounded-2xl overflow-hidden print:border print:border-brand/40"
      style={{
        background: "linear-gradient(180deg,#faf5ff 0%,#ffffff 60%)",
        border: "1px solid rgba(124,58,237,0.25)",
        boxShadow: "0 8px 24px -16px rgba(124,58,237,0.40)",
      }}
    >
      {/* Header: priority pill + address + copy buttons */}
      <div
        className="px-5 py-4 flex flex-col gap-3"
        style={{ borderBottom: "1px solid rgba(124,58,237,0.15)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ color: "#7c3aed", fontVariationSettings: "'FILL' 1" }}
            >
              emergency_share
            </span>
            <span
              className="text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: "#6d28d9" }}
            >
              Dispatch Recommendation
            </span>
          </div>
          <button
            type="button"
            onClick={() => copy("instructions", instructionsText)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-colors print:hidden"
            style={{
              background: copied === "instructions" ? "#5b21b6" : "#7c3aed",
              color: "#ffffff",
              boxShadow: "0 4px 12px -6px rgba(124,58,237,0.55)",
            }}
            aria-label="Copy full dispatch instructions to clipboard"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied === "instructions" ? "check" : "content_copy"}
            </span>
            {copied === "instructions" ? "Copied" : "Copy Instructions"}
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-black uppercase tracking-[0.12em]"
            style={{
              background: priority.bg,
              color: priority.fg,
              boxShadow: `0 0 0 4px ${priority.ring}`,
              animation: priority.pulse
                ? "siren-pulse 1.6s ease-in-out infinite"
                : undefined,
            }}
          >
            <span className="material-symbols-outlined text-[14px]">
              {priority.pulse ? "siren" : "shield"}
            </span>
            {priority.label}
          </span>
        </div>

        {address && (
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <span
                className="material-symbols-outlined text-[20px] flex-none"
                style={{ color: "#7c3aed", marginTop: 2 }}
              >
                location_on
              </span>
              <p
                className="text-[18px] sm:text-[20px] font-extrabold leading-tight break-words"
                style={{ color: "#1f1933", letterSpacing: "-0.01em" }}
              >
                {address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copy("address", address)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors print:hidden"
              style={{
                background: copied === "address" ? "#ede9fe" : "#ffffff",
                color: "#5b21b6",
                border: "1px solid rgba(124,58,237,0.30)",
              }}
              aria-label="Copy address to clipboard"
            >
              <span className="material-symbols-outlined text-[14px]">
                {copied === "address" ? "check" : "content_copy"}
              </span>
              {copied === "address" ? "Copied" : "Copy Address"}
            </button>
          </div>
        )}
      </div>

      {/* 3-column action grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
        <Section
          icon="local_fire_department"
          title="Immediate Dispatch"
          items={rec.immediate}
          emptyHint="No immediate dispatch actions parsed."
        />
        <Section
          icon="record_voice_over"
          title="Bystander Instructions"
          items={rec.bystander}
          emptyHint="No bystander instructions parsed."
        />
        <Section
          icon="shield_person"
          title="Responder Preparation"
          items={rec.responder}
          emptyHint="No responder prep notes parsed."
        />
      </div>

      <style jsx>{`
        @keyframes siren-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 4px ${priority.ring};
          }
          50% {
            box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
          }
        }
      `}</style>
    </div>
  );
}

// ─── Report shimmer skeleton (Phase 5) ──────────────────────────────────────
// Renders a violet shimmer over the report panel while Claude streams the new
// markdown. Bars vary in width to feel like real paragraphs being written.
function ReportShimmer() {
  const bars = [
    "85%",
    "72%",
    "92%",
    "60%",
    "48%",
    "78%",
    "65%",
    "88%",
  ];
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-label="Generating AI report"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
        <span
          className="text-[10px] font-black uppercase tracking-[0.22em]"
          style={{ color: "#a78bfa" }}
        >
          Streaming dispatch recommendation…
        </span>
      </div>
      {bars.map((w, i) => (
        <div
          key={i}
          className="h-3 rounded-full siren-shimmer"
          style={{ width: w }}
        />
      ))}
      <style jsx>{`
        :global(.siren-shimmer) {
          background: linear-gradient(
            90deg,
            rgba(167, 139, 250, 0.10) 0%,
            rgba(167, 139, 250, 0.30) 30%,
            rgba(221, 214, 254, 0.55) 50%,
            rgba(167, 139, 250, 0.30) 70%,
            rgba(167, 139, 250, 0.10) 100%
          );
          background-size: 220% 100%;
          animation: siren-shimmer-slide 1.6s linear infinite;
        }
        :global(.siren-fade-in) {
          animation: siren-fade-in 220ms ease-out both;
        }
        @keyframes siren-shimmer-slide {
          from {
            background-position: 220% 0;
          }
          to {
            background-position: -220% 0;
          }
        }
        @keyframes siren-fade-in {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ─── Regenerate completion toast (Phase 5) ──────────────────────────────────
function RegenToast({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-1/2 top-3 -translate-x-1/2 z-30 print:hidden"
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full siren-fade-in"
        style={{
          background: "linear-gradient(180deg,#7c3aed 0%,#5b21b6 100%)",
          color: "#ffffff",
          border: "1px solid rgba(167,139,250,0.45)",
          boxShadow: "0 8px 24px -10px rgba(124,58,237,0.55)",
        }}
      >
        <span
          className="material-symbols-outlined text-[16px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        <span className="text-[12px] font-bold tracking-tight">{text}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="ml-2 -mr-1 inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>
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
