"use client";

import type { ReactNode } from "react";
import { ModeProvider, useMode } from "./ModeContext";
import CartoonBackdrop from "./CartoonBackdrop";
import ThemeToggle from "./ThemeToggle";
import { ButtonLink } from "./ui/Button";

export type ShellUser = { email: string | null; name: string | null } | null;

// Global Simple / Briefing segmented control. Reads/writes the shared mode so
// the whole report follows one toggle instead of a per-card one.
function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] p-0.5 text-xs">
      {(["simple", "briefing"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`rounded px-2.5 py-1 font-medium capitalize transition-colors ${
            mode === m
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function Header({ user }: { user: ShellUser }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <a href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">Downwind</span>
          <span className="hidden text-[11px] text-neutral-500 sm:inline">
            satellites keep the receipts
          </span>
        </a>

        <div className="flex items-center gap-3">
          {user && <ModeToggle />}
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden max-w-[12rem] truncate text-neutral-500 sm:inline">
                {user.email ?? user.name}
              </span>
              <a className="text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200" href="/auth/logout">
                Log out
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ButtonLink href="/auth/login" variant="quiet" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/auth/login?screen_hint=signup" variant="primary" size="sm">
                Sign up
              </ButtonLink>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Client shell that owns the chrome + mode provider. `children` is passed in
// from the server page (Analyzer or Hero) as a slot, so those stay server /
// client as authored while still living inside the ModeProvider tree.
export default function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  return (
    <ModeProvider>
      <CartoonBackdrop />
      <Header user={user} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">{children}</main>
    </ModeProvider>
  );
}
