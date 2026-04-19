"use client";

// ─── DemoHost ───────────────────────────────────────────────────────────────
// Mounts DemoController at the layout level so it survives client-side route
// changes triggered by the demo itself (Phase 8). Without this, navigating
// from `/` → `/situation-sheet/<id>` would unmount the audio + step machine
// and the demo would die mid-walkthrough. The host exposes a tiny context
// (open/close) consumed by buttons on any page.

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import DemoController from "./DemoController";
import type { LiveCaller } from "./LiveCallerQueue";

interface DemoCtx {
  open: boolean;
  openDemo: () => void;
  closeDemo: () => void;
  caller: LiveCaller | null;
  spotlight: string | undefined;
}

const DemoContext = createContext<DemoCtx | null>(null);

export function useDemo(): DemoCtx {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    // Soft fallback so non-wrapped trees don't crash — the buttons just no-op.
    return {
      open: false,
      openDemo: () => {},
      closeDemo: () => {},
      caller: null,
      spotlight: undefined,
    };
  }
  return ctx;
}

export default function DemoHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [caller, setCaller] = useState<LiveCaller | null>(null);
  const [spotlight, setSpotlight] = useState<string | undefined>(undefined);

  const openDemo = useCallback(() => setOpen(true), []);
  const closeDemo = useCallback(() => {
    setOpen(false);
    setCaller(null);
    setSpotlight(undefined);
  }, []);

  return (
    <DemoContext.Provider value={{ open, openDemo, closeDemo, caller, spotlight }}>
      {children}
      <DemoController
        open={open}
        onClose={closeDemo}
        onCallerUpdate={setCaller}
        onStepChange={setSpotlight}
      />
    </DemoContext.Provider>
  );
}
