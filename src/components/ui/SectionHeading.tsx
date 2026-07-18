import type { ReactNode } from "react";

// The small uppercase label used above each report block.
export function SectionHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 ${className}`}
    >
      {children}
    </h3>
  );
}
