import { ButtonLink } from "./ui/Button";

// Signed-out landing frame — the first thing on the projector. The copy sits on
// a soft frosted panel so the meadow behind it never competes with the text,
// while the scenery still shows through around and beneath it.
export default function Hero() {
  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-14">
      <div className="rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] px-6 py-10 text-center shadow-sm backdrop-blur-md sm:px-10 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Policy impact, grounded in orbit
        </p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Climate-policy debates run on rhetoric.
          <br className="hidden sm:block" /> Satellites have been keeping receipts for 40 years.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
          Paste any bill — transport, housing, agriculture, trade. Downwind screens its hidden
          environmental levers, retrieves enacted policies with <em>observed</em> satellite outcomes,
          and grounds a 3 / 10 / 30-year impact read — labelled by how much we actually know.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {/* Auth0 opens straight onto its sign-up screen when asked via screen_hint. */}
          <ButtonLink href="/auth/login?screen_hint=signup" variant="primary">
            Create an account
          </ButtonLink>
          <ButtonLink href="/auth/login" variant="quiet">
            Sign in
          </ButtonLink>
        </div>
        <span className="mt-4 block text-[11px] text-neutral-500 dark:text-neutral-400">
          Passwordless magic-link · secured by Auth0
        </span>
      </div>
    </div>
  );
}
