import type { ReactNode } from "react";

// Chunky storybook button: pill shape, solid edge underneath, and a press that
// squashes it down onto that edge. Colours come from theme tokens so it stays
// right in both light and dark.

type Variant = "primary" | "sunny" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-edge)] shadow-[0_4px_0_0_var(--accent-edge)]",
  sunny:
    "bg-[var(--sun)] text-[var(--sun-fg)] border-[var(--sun-edge)] shadow-[0_4px_0_0_var(--sun-edge)]",
  quiet:
    "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] shadow-[0_4px_0_0_var(--border)]",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-semibold " +
  "transition-[transform,box-shadow,filter] duration-100 hover:brightness-[1.04] " +
  "active:translate-y-[4px] active:shadow-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

// Small variant for the header. Padding only — the edge colour stays whatever
// the variant set, so it can't drift out of sync.
const SIZES = { md: "", sm: "px-3.5 py-1.5 text-xs" } as const;

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}>
      {children}
    </a>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: {
  variant?: Variant;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
