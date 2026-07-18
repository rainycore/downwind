import type { ReactNode } from "react";

// Centralizes the confidence + direction color maps that were inlined in
// analyzer.tsx (CONF_STYLE / DIR_ICON). One tone vocabulary, used everywhere.
export type Tone =
  | "observed"
  | "extrapolated"
  | "speculative"
  | "worse"
  | "better"
  | "mixed"
  | "negligible"
  | "neutral"
  | "accent";

const TONE: Record<Tone, string> = {
  observed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  extrapolated: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  speculative: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  worse: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  better: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  mixed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  negligible: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  accent: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
