"use client";

import { useEffect, useRef, useCallback } from "react";

// Downtown Austin, TX fallback
const AUSTIN_CENTER = { lat: 30.2672, lng: -97.7431 };

interface MapViewProps {
  center?: { lat: number; lng: number } | string | null;
  pinCount?: number;
  className?: string;
}

function parseCoords(input: MapViewProps["center"]): { lat: number; lng: number } {
  if (!input) return AUSTIN_CENTER;

  // Handle JSON string from DB
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number" && parsed.lat !== 0 && parsed.lng !== 0) {
        return parsed;
      }
    } catch {
      // Invalid JSON
    }
    return AUSTIN_CENTER;
  }

  // Handle object
  if (typeof input.lat === "number" && typeof input.lng === "number" && input.lat !== 0 && input.lng !== 0) {
    return input;
  }

  return AUSTIN_CENTER;
}

/**
 * Leaflet-based interactive map loaded from CDN.
 * Shows `pinCount` pins scattered around `center`.
 * Falls back to downtown Austin if coordinates are missing or (0,0).
 */
export default function MapView({ center, pinCount = 1, className = "" }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const initRef = useRef(false);

  const validCenter = parseCoords(center);

  const initMap = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L || !containerRef.current || initRef.current) return;
    
    initRef.current = true;

    // Clean up any previous map on this container
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch { /* already removed */ }
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([validCenter.lat, validCenter.lng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Generate scattered pins around center
    const count = Math.max(1, pinCount);
    const markers: unknown[] = [];
    for (let i = 0; i < count; i++) {
      const offsetLat = count > 1 ? (Math.random() - 0.5) * 0.004 : 0;
      const offsetLng = count > 1 ? (Math.random() - 0.5) * 0.004 : 0;
      const lat = validCenter.lat + offsetLat;
      const lng = validCenter.lng + offsetLng;

      const marker = L.marker([lat, lng]).addTo(map);
      markers.push(marker);
      if (count > 1) {
        marker.bindPopup(`Report #${i + 1}`);
      }
    }

    // Fit bounds if multiple pins
    if (count > 1 && markers.length > 1) {
      try {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.3));
      } catch {
        // bounds error fallback
      }
    }

    mapRef.current = map;
  }, [validCenter.lat, validCenter.lng, pinCount]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      initMap();
    } else {
      const existingScript = document.querySelector('script[src*="leaflet"]') as HTMLScriptElement;
      if (existingScript) {
        existingScript.addEventListener("load", initMap);
      } else {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = initMap;
        document.head.appendChild(script);
      }
    }

    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch { /* already removed */ }
        mapRef.current = null;
      }
      initRef.current = false;
    };
  }, [initMap]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full min-h-[200px] ${className}`}
      style={{ zIndex: 0 }}
    />
  );
}
