import type { HTMLAttributes, ReactNode } from "react";

// Bordered surface with consistent padding/radius. Replaces the repeated
// `rounded-lg border border-neutral-200 p-4 …` string scattered across the app.
export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
