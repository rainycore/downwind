"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The global audience toggle. Lifted out of the report card so a single control
// in the header governs every block that renders text.
//
// The "briefing" key is kept as the internal value because it's the name of the
// personalization field and is baked into analyses already cached in Atlas —
// only the user-facing label changes ("Briefing" wrongly implied *brief*, when
// it's the longer, technical mode).
export type Mode = "simple" | "briefing";

export const MODE_LABELS: Record<Mode, string> = {
  simple: "Simple",
  briefing: "Detailed",
};

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void } | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("simple");
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within ModeProvider");
  return ctx;
}
