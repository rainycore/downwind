"use client";

import { Card } from "./ui/Card";
import { useMode } from "./ModeContext";

const MIN_CHARS = 20;

// Sample bills spanning the range the product claims: several that never
// mention the environment at all (transport, housing, trade), and two that
// should come back measurably positive — so the demo shows improvement as well
// as harm. Each maps onto a seeded precedent so a live run stays reliable.
// (See data/case-studies.json: Ontario forest cuts, Brazil enforcement rollback,
// Indonesia peatland concessions, BC fuel-management.)
type Sample = {
  id: string;
  chip: string;
  hidden: string;
  text: string;
  bill: string; // the real instrument this sample is modelled on
  where: string;
  year: string;
};

const SAMPLES: Sample[] = [
  // Bills that never mention the environment — the clearest proof of the thesis.
  {
    id: "highway-widening",
    chip: "Highway widening",
    hidden: "emissions · heat",
    bill: "Infrastructure Investment and Jobs Act — highway formula funding",
    where: "United States (federal)",
    year: "2021",
    text: "The state authorizes multi-billion-dollar bond funding to widen interstate corridors and add general-purpose lanes, with the stated goal of reducing peak commuter congestion and shortening freight travel times.",
  },
  {
    id: "parking-mandate",
    chip: "Parking mandate",
    hidden: "heat island · sprawl",
    bill: "Assembly Bill 2097 (parking minimums near transit) — inverted for the harmful case",
    where: "California, United States",
    year: "2022",
    text: "The city raises minimum off-street parking requirements for new residential construction to two spaces per unit and restricts multi-family housing near transit corridors, citing neighbourhood character and traffic concerns.",
  },
  {
    id: "beef-soy-tariff",
    chip: "Import tariff cut",
    hidden: "land use · deforestation",
    bill: "EU–Mercosur trade agreement — beef and soy tariff-rate quotas",
    where: "EU / Mercosur",
    year: "2019 (agreed in principle)",
    text: "The government eliminates import tariffs and inspection requirements on beef and soy from overseas suppliers, presented as a measure to lower domestic grocery prices and ease cost-of-living pressure.",
  },
  {
    id: "on-conservation-cut",
    chip: "Conservation cut",
    hidden: "land use · fire",
    bill: "Bill 229, Protect, Support and Recover from COVID-19 Act — Schedule 6 (conservation authorities)",
    where: "Ontario, Canada",
    year: "2020",
    text: "Ontario reduces conservation-authority funding and forest-management program spending by 30%, with no explicit climate provisions, framed purely as a budget-balancing measure.",
  },
  // Two that should come back measurably POSITIVE, so the read isn't one-sided.
  {
    id: "peatland-moratorium",
    chip: "Peatland moratorium",
    hidden: "improves · fire · air",
    bill: "Presidential Instruction No. 5/2019 (permanent forest & peatland moratorium)",
    where: "Indonesia",
    year: "2019",
    text: "The national government makes permanent its moratorium on new plantation concessions in primary forest and peatland, and funds a peatland restoration agency to rewet drained areas, framed as disaster-risk reduction after severe haze seasons.",
  },
  {
    id: "fuel-crew-funding",
    chip: "Fuel-crew funding",
    hidden: "improves · fire",
    bill: "Community Resiliency Investment programme (FireSmart)",
    where: "British Columbia, Canada",
    year: "2018",
    text: "A province establishes recurring multi-year grants for community brush-clearing, prescribed burns and wildfire fuel-reduction crews in the wildland-urban interface, budgeted as municipal disaster preparedness.",
  },
];

export function InputPanel({
  value,
  onChange,
  onRun,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  loading: boolean;
}) {
  const { mode } = useMode();
  const selected = SAMPLES.find((x) => x.text.trim() === value.trim());
  const len = value.trim().length;
  const tooShort = len < MIN_CHARS;

  return (
    <Card className="space-y-3">
      <div>
        <label htmlFor="policy" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Paste a bill
        </label>
        <textarea
          id="policy"
          className="mt-2 h-36 w-full resize-y rounded-lg border border-[var(--border)] bg-transparent p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-400 focus:border-[var(--accent)]"
          placeholder="Paste any bill — transport, housing, agriculture, trade, defense… Downwind finds the hidden climate lever."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400">
          <span>{tooShort && len > 0 ? `${MIN_CHARS - len} more characters to analyze` : `${len} characters`}</span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          Or try a sample bill
        </p>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => {
            const active = value.trim() === s.text.trim();
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.text)}
                title={`Hidden lever: ${s.hidden}`}
                className={`group rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "border-[var(--border)] text-neutral-600 hover:border-[var(--accent)] hover:text-[var(--accent)] dark:text-neutral-300"
                }`}
              >
                {s.chip}
              </button>
            );
          })}
        </div>
        {/* Detailed mode names the real instrument each sample is modelled on. */}
        {mode === "briefing" && selected && (
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Modelled on <span className="font-medium">{selected.bill}</span> — {selected.where}, {selected.year}.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onRun}
          disabled={loading || tooShort}
        >
          {loading ? "Analyzing…" : "Retrieve precedent"}
        </button>
        {value && !loading && (
          <button className="text-xs text-neutral-400 underline hover:text-neutral-600" onClick={() => onChange("")} type="button">
            Clear
          </button>
        )}
      </div>
    </Card>
  );
}
