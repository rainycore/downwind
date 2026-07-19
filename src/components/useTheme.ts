"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// The theme lives on <html data-theme>, set before paint by the inline script in
// layout.tsx. Subscribing to the attribute (rather than mirroring it into state)
// means anything reading this — the toggle, the scene — always sees the truth.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

// Unknown during SSR, so callers can render a neutral first frame and avoid a
// hydration mismatch.
const getServerSnapshot = (): Theme | null => null;

export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
