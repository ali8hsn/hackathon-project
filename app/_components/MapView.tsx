"use client";

// ─── MapView (MapLibre GL) ───────────────────────────────────────────────────
// Dark vector map with severity-colored pins. Auto-fits bounds when multiple
// pins are present, centers on single pin otherwise. Falls back to downtown
// Austin if no valid coordinates are given.
//
// Loads MapLibre GL from CDN — no npm install, no API key. Uses CARTO's free
// dark basemap (public, attribution required, no token).

import { useEffect, useRef } from "react";

// ── Types ───────────────────────────────────────────────────────────────────
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  severity?: number; // 1..10
  active?: boolean;
  /** Override the severity-derived color (e.g. amber for live phone calls). */
  color?: string;
  /** Optional small line shown under `label` in the popup. */
  sublabel?: string;
  /**
   * If set and > 1, render this pin as a "joined" cluster bubble — bigger,
   * brighter, with the count drawn in the middle. Used by the phone-calls
   * map to merge multiple callers reporting the same incident into one
   * visual marker.
   */
  count?: number;
}

interface MapViewProps {
  pins?: MapPin[];
  /** Back-compat: caller can still pass a single `center` or coord string. */
  center?: { lat: number; lng: number } | string | null;
  /** Back-compat: when using `center`, `pinCount` fakes N scattered pins. */
  pinCount?: number;
  className?: string;
  /** Called when user clicks a pin. */
  onPinClick?: (pin: MapPin) => void;
}

// ── Config ──────────────────────────────────────────────────────────────────
const AUSTIN_CENTER = { lat: 30.2672, lng: -97.7431 };

// CARTO's public dark-matter vector style — no token required
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js";

function severityColor(sev?: number): string {
  if (!sev || sev < 1) return "#94a3b8";
  const clamped = Math.max(1, Math.min(10, Math.round(sev)));
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
  return ramp[clamped];
}

// ── Helper: parse legacy `center` input ────────────────────────────────────
function parseCenter(
  input: MapViewProps["center"]
): { lat: number; lng: number } {
  if (!input) return AUSTIN_CENTER;
  if (typeof input === "string") {
    try {
      const p = JSON.parse(input);
      if (
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        p.lat !== 0 &&
        p.lng !== 0
      )
        return p;
    } catch {
      /* ignore */
    }
    return AUSTIN_CENTER;
  }
  if (
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    input.lat !== 0 &&
    input.lng !== 0
  )
    return input;
  return AUSTIN_CENTER;
}

// ── Script loader (once per page) ──────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
let mapLibrePromise: Promise<any> | null = null;
function loadMapLibre(): Promise<any> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (mapLibrePromise) return mapLibrePromise;
  mapLibrePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${MAPLIBRE_JS}"]`
    ) as HTMLScriptElement | null;
    const onReady = () => {
      if ((window as any).maplibregl) resolve((window as any).maplibregl);
      else reject(new Error("MapLibre failed to load"));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("MapLibre script error")),
        { once: true }
      );
      return;
    }
    const s = document.createElement("script");
    s.src = MAPLIBRE_JS;
    s.async = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("MapLibre script error"));
    document.head.appendChild(s);
  });
  return mapLibrePromise;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Component ──────────────────────────────────────────────────────────────
export default function MapView({
  pins,
  center,
  pinCount = 1,
  className = "",
  onPinClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  // Resolve effective pin set. We distinguish three caller intents:
  //   (a) `pins` not provided  → fall back to the legacy synthetic pins so
  //       older static maps (centre + count) keep working
  //   (b) `pins=[]`             → caller explicitly says "no pins" — show an
  //       empty map (e.g. the live monitor before any calls land). Without
  //       this branch we'd silently invent fake pins at the default centre,
  //       which mis-implies that something is happening
  //   (c) `pins=[...]`          → use exactly what the caller passed
  const effectivePins: MapPin[] =
    pins !== undefined
      ? pins
      : Array.from({ length: Math.max(1, pinCount) }, (_, i) => {
          const c = parseCenter(center);
          const offsetLat =
            pinCount > 1 ? (Math.sin(i * 2.3) * 0.5) * 0.004 : 0;
          const offsetLng =
            pinCount > 1 ? (Math.cos(i * 2.3) * 0.5) * 0.004 : 0;
          return {
            id: `pin-${i}`,
            lat: c.lat + offsetLat,
            lng: c.lng + offsetLng,
            label: pinCount > 1 ? `Report #${i + 1}` : undefined,
          };
        });

  // Effect 1 — instantiate map once
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapLibre()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((maplibregl: any) => {
        if (cancelled || !containerRef.current) return;

        const firstPin = effectivePins[0];
        const start = firstPin
          ? [firstPin.lng, firstPin.lat]
          : [AUSTIN_CENTER.lng, AUSTIN_CENTER.lat];

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: start,
          zoom: effectivePins.length > 1 ? 11 : 13.5,
          attributionControl: false,
          cooperativeGestures: false,
        });

        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right"
        );
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution:
              '© <a href="https://carto.com/attributions">CARTO</a>',
          }),
          "bottom-right"
        );

        mapRef.current = map;
      })
      .catch(() => {
        /* swallow — we'll show a fallback div */
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          markersRef.current.forEach((m) => m.remove());
          markersRef.current = [];
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2 — (re)build markers when pins change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maplibregl = (window as any).maplibregl;
      if (!maplibregl) return;

      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (effectivePins.length === 0) return;

      for (const pin of effectivePins) {
        if (typeof pin.lat !== "number" || typeof pin.lng !== "number")
          continue;
        const color = pin.color || severityColor(pin.severity);

        // Cluster pins (count >= 2) render as a larger bubble with the count
        // baked in. Size scales with sqrt(count) so a 6-caller cluster is
        // visibly bigger than a 2-caller one but never blows up.
        const isCluster = typeof pin.count === "number" && pin.count >= 2;
        const baseSize = 22;
        const size = isCluster
          ? Math.min(56, Math.round(baseSize + 9 * Math.sqrt(pin.count! - 1)))
          : baseSize;

        const el = document.createElement("div");
        el.className = isCluster ? "siren-pin siren-cluster" : "siren-pin";
        el.style.cssText = `
          position: relative;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color};
          box-shadow:
            0 0 0 ${isCluster ? 6 : 4}px ${color}33,
            0 0 ${isCluster ? 36 : 24}px ${color}${isCluster ? "99" : "66"},
            0 4px 10px rgba(0,0,0,0.45);
          cursor: ${onPinClick ? "pointer" : "default"};
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        if (pin.active) {
          const ring = document.createElement("span");
          ring.style.cssText = `
            position: absolute;
            inset: -6px;
            border-radius: 50%;
            border: 2px solid ${color};
            animation: siren-pulse-red 1.6s ease-out infinite;
          `;
          el.appendChild(ring);
        }
        if (isCluster) {
          // Draw the count in the middle of the bubble. White text on the
          // colored disc reads cleanly at every size.
          const num = document.createElement("span");
          num.textContent = String(pin.count);
          num.style.cssText = `
            position: relative;
            color: white;
            font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
            font-weight: 800;
            font-size: ${Math.max(11, Math.round(size * 0.42))}px;
            line-height: 1;
            letter-spacing: -0.02em;
            text-shadow: 0 1px 2px rgba(0,0,0,0.4);
          `;
          el.appendChild(num);
        } else {
          const dot = document.createElement("span");
          dot.style.cssText = `
            position: absolute;
            inset: 7px;
            border-radius: 50%;
            background: white;
          `;
          el.appendChild(dot);
        }

        if (onPinClick) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onPinClick(pin);
          });
        }

        const popup = pin.label
          ? new maplibregl.Popup({
              offset: 18,
              closeButton: false,
              className: "siren-popup",
            }).setHTML(
              `<div style="font-family:Inter,system-ui;font-size:12px;color:#e2e6f0;padding:4px 2px;">
                 <div style="font-weight:700;margin-bottom:2px;">${pin.label}</div>
                 ${
                   pin.sublabel
                     ? `<div style="font-size:10px;color:rgba(226,230,240,0.7);margin-bottom:2px;">${pin.sublabel}</div>`
                     : ""
                 }
                 ${
                   isCluster
                     ? `<div style="font-size:10px;color:${color};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${pin.count} callers · joined</div>`
                     : pin.severity
                       ? `<div style="font-size:10px;color:${color};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Severity ${pin.severity}/10</div>`
                       : pin.color
                         ? `<div style="font-size:10px;color:${color};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Live call</div>`
                         : ""
                 }
               </div>`
            )
          : undefined;

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([pin.lng, pin.lat]);
        if (popup) marker.setPopup(popup);
        marker.addTo(map);
        markersRef.current.push(marker);
      }

      // Fit bounds
      if (effectivePins.length === 1) {
        map.flyTo({
          center: [effectivePins[0].lng, effectivePins[0].lat],
          zoom: 14.5,
          duration: 700,
          essential: true,
        });
      } else if (effectivePins.length > 1) {
        // If exactly one pin is marked active (e.g. user is hovering a feed
        // card), focus that pin. Otherwise frame all pins.
        const activePins = effectivePins.filter((p) => p.active);
        if (activePins.length === 1) {
          map.flyTo({
            center: [activePins[0].lng, activePins[0].lat],
            zoom: 14.5,
            duration: 600,
            essential: true,
          });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          for (const p of effectivePins) bounds.extend([p.lng, p.lat]);
          map.fitBounds(bounds, {
            padding: 60,
            maxZoom: 14,
            duration: 700,
            essential: true,
          });
        }
      }
    };

    if (map.loaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(effectivePins)]);

  return (
    <div
      className={`relative w-full h-full min-h-[200px] ${className}`}
      style={{ background: "#11141b" }}
    >
      <div ref={containerRef} className="w-full h-full" />
      {/* Subtle inner shadow overlay for the ginkgo-style "inset" look */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]" />
    </div>
  );
}
