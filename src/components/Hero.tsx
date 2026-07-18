import { ButtonLink } from "./ui/Button";

// Signed-out landing frame — the first thing on the projector. The copy sits on
// a soft frosted panel so the meadow behind it never competes with the text,
// while the scenery still shows through around and beneath it.
export default function Hero() {
  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-10">
      {/* Sized to clear the fold on a 13" laptop — headline steps up only on
          larger screens rather than jumping straight to 5xl. */}
      <div className="rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] px-8 py-10 text-center shadow-sm backdrop-blur-md sm:px-12 sm:py-12">
        {/* No eyebrow: "policy impact, from orbit" lives in the nav tagline, and
            "receipts" belongs to the H1 — one of each per screen. */}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.6rem]">
          Every bill touches the climate.
          <br className="hidden sm:block" /> Satellites kept the receipts.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
          Paste any bill — transport, housing, agriculture, trade. Downwind screens it for hidden
          climate levers, finds regions that already passed similar laws, and shows what happened
          next, from orbit — impact at 3, 10, and 30 years, each labelled by how much we actually
          know.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-700 sm:text-base dark:text-neutral-200">
          Then it brings it home by showing how smoke, extreme heat, and flooding could affect your
          own city.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {/* Leads with the action rather than the commitment; the line below is
              explicit that this starts a passwordless sign-in. */}
          <ButtonLink href="/auth/login?screen_hint=signup" variant="primary">
            Analyze a bill
          </ButtonLink>
          <ButtonLink href="/auth/login" variant="quiet">
            Sign in
          </ButtonLink>
        </div>
        <span className="mt-4 block text-[11px] text-neutral-500 dark:text-neutral-400">
          Takes a few seconds · passwordless magic-link, secured by Auth0
        </span>
      </div>
    </div>
  );
}
