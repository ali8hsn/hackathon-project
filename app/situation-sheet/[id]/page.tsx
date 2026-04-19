"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MapView from "../../_components/MapView";
import type { Incident } from "../../_lib/types";

type Tab = "report" | "transcripts";

// ─── Inline Markdown Renderer ────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, and `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-bold text-on-surface">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={match.index} className="px-1.5 py-0.5 bg-surface-lowest rounded text-xs font-mono text-primary">{match[4]}</code>);
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

    // Empty line
    if (trimmed === "") {
      elements.push(<div key={i} className="h-3" />);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(<hr key={i} className="border-outline-variant/20 my-4" />);
      i++;
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-bold text-on-surface mt-5 mb-2">{renderInline(trimmed.slice(4))}</h4>);
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-base font-bold text-on-surface mt-6 mb-3">{renderInline(trimmed.slice(3))}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-on-surface mt-6 mb-3">{renderInline(trimmed.slice(2))}</h2>);
      i++;
      continue;
    }

    // Bold-only line as header (e.g. **Section Title**)
    if (/^\*\*.+\*\*$/.test(trimmed) && !trimmed.slice(2, -2).includes("**")) {
      elements.push(<h3 key={i} className="text-base font-bold text-on-surface mt-6 mb-3 first:mt-0">{trimmed.slice(2, -2)}</h3>);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-primary/40 pl-4 my-3 text-on-surface-variant italic">
          {quoteLines.map((ql, qi) => <p key={qi} className="text-sm leading-relaxed">{renderInline(ql)}</p>)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(
          <li key={i} className="flex gap-2 mb-1.5">
            <span className="text-primary mt-0.5 shrink-0">•</span>
            <span className="text-sm text-on-surface-variant leading-relaxed">{renderInline(lines[i].trim().slice(2))}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="ml-2 mb-3 space-y-0.5">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+[.)]\s/, "");
        items.push(
          <li key={i} className="flex gap-2 mb-1.5">
            <span className="text-primary font-bold text-xs mt-0.5 shrink-0 w-5 text-right">{num}.</span>
            <span className="text-sm text-on-surface-variant leading-relaxed">{renderInline(content)}</span>
          </li>
        );
        i++;
        num++;
      }
      elements.push(<ol key={`ol-${i}`} className="ml-2 mb-3 space-y-0.5">{items}</ol>);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} className="text-sm text-on-surface-variant leading-relaxed mb-2">{renderInline(trimmed)}</p>);
    i++;
  }

  return elements;
}

export default function SituationSheetPage() {
  const params = useParams();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [isEditing, setIsEditing] = useState(false);
  const [reportText, setReportText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Fetch from backend on mount
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
        // Backend not available
      }
      setLoading(false);
    }
    fetchIncident();
  }, [incidentId]);

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
      // Offline — just keep the local edit
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
      // Offline — no-op
    }
    setIsRegenerating(false);
  }, [incidentId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-lowest">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
          <p className="text-sm text-on-surface-variant mt-4">Loading situation...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!incident) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-lowest">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>
            error
          </span>
          <h2 className="text-xl font-bold text-on-surface mb-2">Incident Not Found</h2>
          <p className="text-sm text-on-surface-variant mb-6">The incident you&apos;re looking for doesn&apos;t exist or couldn&apos;t be loaded.</p>
          <Link href="/" className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold">
            Back to Monitor
          </Link>
        </div>
      </div>
    );
  }

  const mapsLink = `https://www.openstreetmap.org/?mlat=${incident.coordinates.lat}&mlon=${incident.coordinates.lng}#map=16/${incident.coordinates.lat}/${incident.coordinates.lng}`;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "report", label: "AI Report", icon: "description" },
    { key: "transcripts", label: "All Transcripts", icon: "record_voice_over" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-lowest">
      {/* Top: Incident Header */}
      <section className="p-6 bg-surface-low flex items-start justify-between shrink-0 border-b border-outline-variant/10">
        <div className="flex gap-5">
          <Link
            href="/"
            className="mt-1 p-2 hover:bg-surface-high rounded-lg transition-colors text-on-surface-variant shrink-0"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div className="h-16 w-16 rounded-xl bg-error-container flex items-center justify-center text-error shrink-0">
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              {incident.icon}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                incident.priority === "HIGH" ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container"
              }`}>
                {incident.priority} Priority
              </span>
              <span className="text-on-surface-variant text-xs font-mono">{incident.id}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-on-surface">{incident.title}</h1>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-on-surface-variant flex items-center gap-1 text-sm mt-0.5 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">location_on</span>
              {incident.location}
              <span className="material-symbols-outlined text-xs ml-1">open_in_new</span>
            </a>
          </div>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-tight">Callers</p>
            <p className="text-2xl font-black text-primary">{incident.callerCount}</p>
          </div>
          <div className="h-10 w-px bg-outline-variant/20" />
          <div className="text-right">
            <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-tight">Elapsed</p>
            <p className="text-2xl font-black text-on-surface font-mono">{incident.elapsedTime}</p>
          </div>
          <div className="h-10 w-px bg-outline-variant/20" />
          <div className="text-right">
            <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-tight">Confidence</p>
            <p className="text-2xl font-black text-primary">{incident.confidenceScore}%</p>
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <div className="flex gap-1 px-6 pt-4 pb-0 bg-surface-low shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-surface-lowest text-primary border-t-2 border-primary"
                : "text-[#64748b] hover:text-[#94a3b8] hover:bg-surface-highest/50"
            }`}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* REPORT TAB (Default) */}
          {activeTab === "report" && (
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  <h2 className="text-lg font-bold">AI-Generated Situation Report</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRegenerateReport}
                    disabled={isRegenerating}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-tight bg-surface-highest text-on-surface border border-outline-variant/20 rounded-lg hover:bg-surface-bright transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    <span className={`material-symbols-outlined text-sm ${isRegenerating ? "animate-spin" : ""}`} style={{ fontVariationSettings: "'FILL' 1" }}>{isRegenerating ? "progress_activity" : "smart_toy"}</span>
                    {isRegenerating ? "Regenerating..." : "Regenerate"}
                  </button>
                  <button
                    onClick={() => isEditing ? handleSaveReport() : setIsEditing(true)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-tight border border-outline-variant/30 rounded-lg hover:bg-surface-high transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">{isSaving ? "hourglass_top" : isEditing ? "check" : "edit"}</span>
                    {isSaving ? "Saving..." : isEditing ? "Save" : "Edit Report"}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  className="w-full h-[500px] bg-surface-high border border-outline-variant/20 rounded-xl p-6 text-sm leading-relaxed text-on-surface font-mono resize-none focus:outline-none focus:border-primary/40"
                />
              ) : (
                <div className="bg-surface-high rounded-xl p-6 border border-outline-variant/10">
                  <div className="prose prose-invert prose-sm max-w-none">
                    {renderMarkdown(reportText)}
                  </div>
                </div>
              )}

              {/* Conflicts */}
              {incident.conflicts.length > 0 && (
                <div className="bg-secondary-container/10 border border-secondary-container/20 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary">warning</span>
                    <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">
                      Statement Conflicts Detected
                    </h3>
                  </div>
                  {incident.conflicts.map((conflict, i) => (
                    <div key={i} className="bg-surface-lowest p-3 rounded-lg border-l-4 border-secondary">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-[#94a3b8] uppercase">Conflict: {conflict.field}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-xs">
                          <p className="text-[#64748b] font-bold mb-1">{conflict.callerA.id}</p>
                          <p className="italic text-on-surface-variant">{conflict.callerA.statement}</p>
                        </div>
                        <div className="text-xs">
                          <p className="text-secondary font-bold mb-1">{conflict.callerB.id}</p>
                          <p className="italic text-on-surface-variant">{conflict.callerB.statement}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TRANSCRIPTS TAB */}
          {activeTab === "transcripts" && (
            <div className="max-w-3xl space-y-1">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                <h2 className="text-lg font-bold">Call Transcripts</h2>
                <span className="text-xs text-on-surface-variant">
                  {incident.transcript.length} entries from {incident.callerCount} callers
                </span>
              </div>
              <div className="space-y-4">
                {incident.transcript.map((entry, i) => (
                  <div key={i} className={`flex gap-4 ${entry.isLive ? "animate-pulse" : ""}`}>
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-[10px] font-mono font-bold text-on-surface-variant">{entry.time}</span>
                    </div>
                    <div className="w-px bg-outline-variant/20 shrink-0 relative">
                      <div className={`absolute top-1 -left-1 w-2 h-2 rounded-full ${
                        entry.isAI ? "bg-primary-container" : entry.speaker.includes("DISPATCH") ? "bg-surface-highest" : "bg-primary"
                      }`} />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className={`text-[10px] font-bold uppercase mb-1 ${
                        entry.isAI ? "text-primary" : entry.speaker.includes("DISPATCH") ? "text-[#64748b]" : "text-on-surface"
                      }`}>
                        {entry.speaker}
                        {entry.isLive && <span className="text-error ml-2">● LIVE</span>}
                      </p>
                      <p className={`text-sm leading-relaxed ${
                        entry.isAI ? "text-primary/80 italic bg-primary-container/10 p-2 rounded" : "text-on-surface-variant"
                      }`}>
                        {entry.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>

        {/* Right Sidebar: Map */}
        <aside className="w-96 bg-surface-lowest border-l border-outline-variant/10 flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant/10 bg-surface-low flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">map</span>
              <h3 className="text-xs font-bold uppercase tracking-widest">Location</h3>
            </div>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              Open in Maps <span className="material-symbols-outlined text-xs">open_in_new</span>
            </a>
          </div>
          <div className="flex-1 relative">
            <MapView
              center={incident.coordinates}
              pinCount={incident.callerCount || 1}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
