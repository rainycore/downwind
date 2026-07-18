// Signed-out landing frame — the first thing on the projector. Large, centered,
// one thesis line, one CTA. (Pure presentational; no client interactivity.)
export default function Hero() {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
        Policy impact, grounded in orbit
      </p>
      <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Climate-policy debates run on rhetoric.
        <br className="hidden sm:block" /> Satellites have been keeping receipts for 40 years.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-neutral-500 sm:text-base">
        Paste any bill — transport, housing, agriculture, trade. Downwind screens its hidden
        environmental levers, retrieves enacted policies with <em>observed</em> satellite outcomes,
        and grounds a 3 / 10 / 30-year impact read — labelled by how much we actually know.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <a
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-fg)]"
          href="/auth/login"
        >
          Sign in to run an analysis
        </a>
        <span className="text-[11px] text-neutral-400">
          Passwordless magic-link · secured by Auth0
        </span>
      </div>
    </div>
  );
}
