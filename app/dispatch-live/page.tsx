"use client";

/**
 * If the UI is served without the unified `server.js` (split deploy), set NEXT_PUBLIC_ARIA_ORIGIN
 * to your Siren API base URL. One-box deploy: leave unset (same host as the app).
 */
export default function DispatchLivePage() {
  const origin = (process.env.NEXT_PUBLIC_ARIA_ORIGIN || "").trim().replace(/\/$/, "");
  const qs = origin ? `?ariaOrigin=${encodeURIComponent(origin)}` : "";

  return (
    <iframe
      title="Live dispatch — phone + browser sessions"
      src={`/dispatch-live.html${qs}`}
      className="h-[calc(100vh-4.5rem)] w-full min-h-[480px] border-0 rounded-md bg-[#09090b]"
    />
  );
}
