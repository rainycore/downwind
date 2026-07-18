"use client";

import { Card } from "./ui/Card";

const MIN_CHARS = 20;

// Sample bills that read as fiscal / economic measures but each hides a climate
// lever — and each maps onto a seeded precedent so a live demo is reliable.
// (See data/case-studies.json: Ontario forest cuts, Brazil enforcement rollback,
// Indonesia peatland concessions, BC fuel-management.)
type Sample = { id: string; chip: string; hidden: string; text: string };

const SAMPLES: Sample[] = [
  {
    id: "on-conservation-cut",
    chip: "Conservation cut",
    hidden: "land use · fire",
    text: "Ontario reduces conservation-authority funding and forest-management program spending by 30%, with no explicit climate provisions, framed purely as a budget-balancing measure.",
  },
  {
    id: "enforcement-rollback",
    chip: "Enforcement rollback",
    hidden: "emissions · land use",
    text: "A national government cuts the environmental-inspection agency's budget by 40% and lowers penalties for land-clearing and permit violations, presented as cutting red tape for business.",
  },
  {
    id: "land-concession-subsidy",
    chip: "Land concession subsidy",
    hidden: "land use · emissions",
    text: "A development bank offers new low-interest loans and tax credits for converting peatland and marginal farmland into palm-oil and agricultural estates, framed as rural economic growth.",
  },
  {
    id: "fuel-crew-defunding",
    chip: "Fuel-crew defunding",
    hidden: "fire · heat",
    text: "A province cancels recurring grants for community brush-clearing and wildfire fuel-reduction crews to reduce municipal spending, described strictly as a cost-saving measure.",
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
          Or try a sample — each looks non-climate
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
