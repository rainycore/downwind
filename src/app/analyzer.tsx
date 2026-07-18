"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/pipeline";
import { IMPACT_DIMENSIONS } from "@/lib/schemas";

const SAMPLE = `Ontario reduces conservation-authority funding and forest-management program spending by 30%, with no explicit climate provisions, framed purely as a budget-balancing measure.`;

const CONF_STYLE: Record<string, string> = {
  observed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  extrapolated: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  speculative: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const DIR_ICON: Record<string, string> = {
  worse: "↑ worse",
  better: "↓ better",
  mixed: "~ mixed",
  negligible: "· negligible",
};

const DIM_LABEL = Object.fromEntries(IMPACT_DIMENSIONS.map((d) => [d.key, d.label]));

export default function Analyzer() {
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mode, setMode] = useState<"simple" | "briefing">("simple");

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <textarea
          className="h-32 w-full rounded-lg border border-neutral-300 bg-transparent p-3 text-sm dark:border-neutral-700"
          placeholder="Paste any bill — transport, housing, agriculture, trade, defense…"
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={run}
            disabled={loading || policy.trim().length < 20}
          >
            {loading ? "Analyzing…" : "Retrieve precedent"}
          </button>
          <button className="text-sm text-neutral-500 underline" onClick={() => setPolicy(SAMPLE)} type="button">
            Use sample policy
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {result && (
        <section className="space-y-6">
          {/* Screening — no bill assumed climate-neutral */}
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {result.extraction.title}
              </h2>
              {result.extraction.screening?.assumedNeutral ? (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium dark:bg-neutral-700">
                  no lever found
                </span>
              ) : (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                  climate-relevant
                </span>
              )}
            </div>
            <p className="mt-1 text-sm">{result.extraction.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.extraction.screening?.matchedLevers?.map((l) => (
                <span key={l} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {l.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            {result.extraction.screening?.rationale && (
              <p className="mt-2 text-xs text-neutral-500">{result.extraction.screening.rationale}</p>
            )}
          </div>

          {/* Briefing / Simple dual output */}
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-3 inline-flex rounded-md border border-neutral-300 p-0.5 text-xs dark:border-neutral-700">
              {(["simple", "briefing"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-2.5 py-1 font-medium capitalize ${
                    mode === m ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "text-neutral-500"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {mode === "simple" ? result.simple : result.briefing}
            </p>
            {result.localTranslation && (
              <p className="mt-3 text-lg font-semibold">{result.localTranslation}</p>
            )}
          </div>

          {/* Impact surface */}
          {result.dimensions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-500">Climate impact surface</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.dimensions.map((d) => (
                  <div key={d.key} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{DIM_LABEL[d.key] ?? d.key}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONF_STYLE[d.confidence]}`}>
                        {d.confidence}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-400">{DIR_ICON[d.direction] ?? d.direction}</p>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{d.finding}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Three honest horizons */}
          <div className="grid gap-3 sm:grid-cols-3">
            {result.horizons.map((h) => (
              <div key={h.years} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{h.years}y</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONF_STYLE[h.label]}`}>{h.label}</span>
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{h.assessment}</p>
              </div>
            ))}
          </div>

          {/* Observed analogues — receipts mode */}
          {result.analogues.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-500">Observed precedents (receipts)</h3>
              <ul className="space-y-2">
                {result.analogues.map((a) => (
                  <li key={a.policyId} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-xs text-neutral-400">
                        {a.region} · {a.enactedYear} · match {(a.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{a.observedDelta}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Green-AI carbon receipt + self-consistency */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold">🌱 Carbon receipt {result.receipt.cached && "(cache hit — ~0 cost)"}</span>
              <span>{result.receipt.totalTokens.toLocaleString()} tokens</span>
              <span>≈ {result.receipt.estWattHours} Wh</span>
              <span>≈ {result.receipt.estGramsCO2} g CO₂e (est.)</span>
              <span>consistency {(result.agreement * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-1 opacity-70">
              Cheap Flash/Gemma for screening, Pro only for synthesis, every result cached in MongoDB.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
