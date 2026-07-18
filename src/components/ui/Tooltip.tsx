import type { ReactNode } from "react";

// CSS-only hover tooltip (no JS, no dependency). For "what is NDVI?",
// "how is CO₂ estimated?" — keeps judges from needing a verbal explanation.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-normal leading-snug tracking-normal text-neutral-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:text-neutral-300"
      >
        {label}
      </span>
    </span>
  );
}
