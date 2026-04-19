"use client";

// ─── Scenario Lab ───────────────────────────────────────────────────────────
// On-the-fly triage tester.
//
// Two ways to fire a fake 911 transcript through the live ingest pipeline:
//   1) Click one of the curated preset cards below — each is a short, vivid
//      scenario in a different city so dispatchers can sanity-check that
//      severity scoring, location extraction, and category routing all work.
//   2) Paste any free-form transcript into the textbox — useful for
//      reproducing an oddball real-world call without changing seed scripts.
//
// Every submission is tagged `is_demo: true` so the new /reports Live toggle
// can hide them with one click. Successful runs surface a tiny status row
// with the resulting incident ID + a deep link into the situation sheet.

import { useState } from "react";
import Link from "next/link";

interface ScenarioPreset {
  id: string;
  title: string;
  city: string;
  category: "fire" | "medical" | "violence" | "infra" | "weather" | "other";
  /** Severity hint for the chip — actual scoring happens server-side. */
  severityHint: "HIGH" | "MEDIUM" | "LOW";
  transcript: string;
  locationHint: string;
}

const PRESETS: ScenarioPreset[] = [
  {
    id: "rooftop-collapse",
    title: "Rooftop deck collapse",
    city: "Austin, TX",
    category: "infra",
    severityHint: "HIGH",
    transcript: `[CALLER] The rooftop deck just gave out at the bar on Rainey Street, people are screaming!
[CALLER] At least ten people fell through, some are bleeding bad, one guy isn't moving.
[SIREN AI] Help is on the way. Are you in a safe spot to keep talking?
[CALLER] Yes, I'm on the sidewalk. There's a woman next to me with a broken leg, the bone's showing.`,
    locationHint: "Rainey Street, Austin, TX 78701",
  },
  {
    id: "hospital-power",
    title: "Hospital ICU power loss",
    city: "Tampa, FL",
    category: "medical",
    severityHint: "HIGH",
    transcript: `[CALLER] This is the night charge nurse at Memorial — our entire ICU just lost power, generators didn't kick.
[CALLER] We have six patients on ventilators, we're bagging two of them right now.
[SIREN AI] I'm dispatching emergency facilities and EMS now. How long since the outage started?
[CALLER] About four minutes. Battery monitors are at 30 percent.`,
    locationHint: "Memorial Hospital, Tampa, FL",
  },
  {
    id: "ev-charger-fire",
    title: "EV charger fire spreading",
    city: "Sacramento, CA",
    category: "fire",
    severityHint: "HIGH",
    transcript: `[CALLER] An electric car at the supercharger plaza is on fire and the flames are jumping to the next stall.
[CALLER] Smoke is black and there's loud popping like batteries going off.
[SIREN AI] Please move at least 200 feet away. Are there other people near the chargers?
[CALLER] Two cars still plugged in, drivers got out. Nobody hurt yet.`,
    locationHint: "Tesla Supercharger, 1601 Arden Way, Sacramento, CA",
  },
  {
    id: "school-lockdown",
    title: "School lockdown — suspicious person",
    city: "Brooklyn, NY",
    category: "violence",
    severityHint: "MEDIUM",
    transcript: `[CALLER] I'm an assistant principal at PS 217. There's a man in the courtyard refusing to leave, says he wants to "see his kid".
[CALLER] He's pacing, no weapon visible but I can see something bulging in his jacket pocket.
[SIREN AI] We're sending officers. Are students secured?
[CALLER] Yes, we just initiated soft lockdown. All classroom doors locked.`,
    locationHint: "PS 217, Brooklyn, NY 11218",
  },
  {
    id: "subway-flooding",
    title: "Subway tunnel flooding rapidly",
    city: "Boston, MA",
    category: "weather",
    severityHint: "MEDIUM",
    transcript: `[CALLER] I'm on the Red Line platform at Park Street and water is pouring down the stairs from the street.
[CALLER] It's already up to my ankles, an MBTA worker is yelling for everyone to get out.
[SIREN AI] Move to the highest exit you can reach. Anyone who can't walk?
[CALLER] An older woman with a walker, I'm helping her now.`,
    locationHint: "Park Street Station, Boston, MA",
  },
  {
    id: "highway-pileup",
    title: "Highway pileup in fog",
    city: "Denver, CO",
    category: "other",
    severityHint: "HIGH",
    transcript: `[CALLER] I-70 westbound, just past the tunnel, there's a massive pileup in the fog.
[CALLER] I count at least 12 cars, two semis, one is on its side leaking fluid.
[SIREN AI] Stay in your vehicle if it's safe. Anyone trapped that you can see?
[CALLER] Yes, the SUV in front of me, the airbags are deployed and the driver isn't moving.`,
    locationHint: "I-70 W, Denver, CO",
  },
  {
    id: "carbon-monoxide",
    title: "Carbon monoxide — apartment block",
    city: "Pittsburgh, PA",
    category: "medical",
    severityHint: "MEDIUM",
    transcript: `[CALLER] My CO detector won't stop and I'm getting really dizzy. My two kids are with me.
[CALLER] I can hear the neighbor's alarm too — I think the whole building.
[SIREN AI] Get outside immediately if you can. Are you near a window?
[CALLER] Yes, opening it now. We're heading to the stairwell.`,
    locationHint: "Squirrel Hill, Pittsburgh, PA",
  },
  {
    id: "lost-hiker",
    title: "Lost hiker — sunset, low temps",
    city: "Asheville, NC",
    category: "other",
    severityHint: "LOW",
    transcript: `[CALLER] My partner went off-trail on the Mount Pisgah loop about three hours ago and hasn't come back.
[CALLER] He has his phone but no service. It's getting dark and temperature is dropping.
[SIREN AI] What was he wearing? Any medical conditions?
[CALLER] Blue rain shell, jeans. Type 1 diabetic — he had insulin with him.`,
    locationHint: "Mount Pisgah Trailhead, Asheville, NC",
  },
];

const CATEGORY_STYLES: Record<ScenarioPreset["category"], string> = {
  fire: "bg-red-500/15 text-red-300 border-red-500/30",
  medical: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  violence: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  infra: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  weather: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  other: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

interface RunResult {
  status: "ok" | "error";
  incidentId?: string;
  message: string;
  preset?: string;
}

interface Props {
  /** Optional override so each page can title the panel however it wants. */
  title?: string;
  subtitle?: string;
}

export default function ScenarioLab({
  title = "Scenario Lab",
  subtitle = "Inject a fresh transcript into the live triage pipeline. Every run is tagged demo so you can flip it off in /reports.",
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freeForm, setFreeForm] = useState("");
  const [freeFormCity, setFreeFormCity] = useState("");
  const [last, setLast] = useState<RunResult | null>(null);

  async function runScenario(input: {
    id: string;
    transcript: string;
    locationHint: string;
    label: string;
  }) {
    setBusyId(input.id);
    setLast(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: input.transcript,
          caller_id: `scenario-lab-${input.id}-${Date.now()}`,
          location_hint: input.locationHint || undefined,
          haashir_assist_enabled: false,
          is_demo: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 160)}`);
      }
      const data = await res.json();
      const incidentId =
        data?.incident?.id || data?.id || data?.incidentId || null;
      setLast({
        status: "ok",
        incidentId,
        preset: input.label,
        message: incidentId
          ? `Incident ${incidentId} created`
          : "Submitted — incident will appear shortly.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLast({ status: "error", preset: input.label, message: msg });
    } finally {
      setBusyId(null);
    }
  }

  const freeFormDisabled = freeForm.trim().length < 12 || busyId !== null;

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-low/60 p-5 mb-8">
      <header className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="material-symbols-outlined text-[18px] text-primary-dim"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              science
            </span>
            <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-on-surface">
              {title}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-tertiary-container/40 text-tertiary border border-tertiary/30">
              demo
            </span>
          </div>
          <p className="text-[12px] text-on-surface-variant max-w-2xl">
            {subtitle}
          </p>
        </div>
        {last && (
          <div
            className={`text-[11px] font-mono px-3 py-2 rounded-xl border max-w-xs text-right ${
              last.status === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            <div className="font-bold uppercase tracking-widest text-[9.5px] mb-0.5">
              {last.status === "ok" ? "Submitted" : "Error"}
              {last.preset ? ` · ${last.preset}` : ""}
            </div>
            <div className="leading-snug">{last.message}</div>
            {last.status === "ok" && last.incidentId && (
              <Link
                href={`/situation-sheet/${last.incidentId}`}
                className="inline-block mt-1 underline opacity-90 hover:opacity-100"
              >
                Open situation sheet →
              </Link>
            )}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {PRESETS.map((p) => {
          const isBusy = busyId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={busyId !== null}
              onClick={() =>
                runScenario({
                  id: p.id,
                  transcript: p.transcript,
                  locationHint: p.locationHint,
                  label: p.title,
                })
              }
              className="group text-left rounded-2xl border border-outline-variant/20 bg-surface-lowest/60 hover:border-brand/40 hover:bg-surface-low transition-all p-4 disabled:opacity-50 disabled:cursor-wait"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${CATEGORY_STYLES[p.category]}`}
                >
                  {p.category}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {p.severityHint}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-on-surface mb-1 leading-tight">
                {p.title}
              </div>
              <div className="text-[11px] text-on-surface-variant mb-3">
                {p.city}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-on-surface-variant">
                  {isBusy ? "submitting…" : "tap to inject"}
                </span>
                <span
                  className="material-symbols-outlined text-[16px] text-brand opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  bolt
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-lowest/60 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            edit_note
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface">
            Free-form transcript
          </h3>
          <span className="text-[10.5px] text-on-surface-variant">
            paste any 911-style call to triage live
          </span>
        </div>
        <textarea
          value={freeForm}
          onChange={(e) => setFreeForm(e.target.value)}
          rows={5}
          placeholder={`[CALLER] There's a fire on the third floor of 200 Main Street...\n[SIREN AI] Help is on the way. Are you out of the building?\n[CALLER] Yes, but my neighbor is still inside.`}
          className="w-full bg-surface-lowest text-on-surface text-[12.5px] font-mono leading-relaxed rounded-xl border border-outline-variant/30 p-3 focus:outline-none focus:border-brand/50"
        />
        <div className="flex items-center gap-3 mt-3">
          <input
            type="text"
            value={freeFormCity}
            onChange={(e) => setFreeFormCity(e.target.value)}
            placeholder="Optional location hint (e.g. 'Brooklyn, NY')"
            className="flex-1 bg-surface-lowest text-on-surface text-[12px] rounded-xl border border-outline-variant/30 px-3 py-2 focus:outline-none focus:border-brand/50"
          />
          <button
            type="button"
            disabled={freeFormDisabled}
            onClick={() =>
              runScenario({
                id: "free-form",
                transcript: freeForm,
                locationHint: freeFormCity,
                label: "Free-form transcript",
              })
            }
            className="px-4 py-2 rounded-xl bg-brand text-white text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
          >
            {busyId === "free-form" ? "Submitting…" : "Run triage"}
          </button>
        </div>
      </div>
    </section>
  );
}
