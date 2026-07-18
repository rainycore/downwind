"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The global Simple / Briefing audience toggle. Lifted out of the report card
// so a single control in the header governs every block that renders text.
export type Mode = "simple" | "briefing";

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
