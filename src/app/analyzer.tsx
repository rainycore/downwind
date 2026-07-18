"use client";

import { useEffect, useState } from "react";
import type { AnalysisResult } from "@/lib/pipeline";
import type { UserProfile } from "@/lib/reader";
import PolicyScene, { MIN_LOADING_MS } from "./policy-scene";
import { useMode } from "@/components/ModeContext";
import { InputPanel } from "@/components/InputPanel";
import { Card } from "@/components/ui/Card";
import { Badge, type Tone } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";

// Compact number formatting for physical values spanning many magnitudes
// (NDVI ~0.8 … NO₂ ~1e14). Keeps small values readable, exponents for large.
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return n.toExponential(1);
  return String(n);
}

// Colour a measured delta by whether the change is environmentally good.
function deltaColor(deltaPct: number, good: "up" | "down" | "neutral"): string {
  if (good === "neutral" || deltaPct === 0) return "text-neutral-600 dark:text-neutral-300";
  const improving = good === "up" ? deltaPct > 0 : deltaPct < 0;
  return improving ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

export default function Analyzer({ profile }: { profile: UserProfile }) {
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  // Simple / Briefing is a global toggle owned by the header (AppShell). The
  // persona picks the default; the reader can flip it there any time.
  const { mode, setMode } = useMode();

  useEffect(() => {
    setMode(profile.role === "lawmaker" ? "briefing" : "simple");
  }, [profile.role, setMode]);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      // Hold the loading state to a floor so the corner scene gets a full run
      // even on an instant cache hit. Slow analyses are unaffected.
      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      setResult(data as AnalysisResult);
      setMode(data.role === "lawmaker" ? "briefing" : "simple");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const local = result?.personalization.local;

  // Drive the corner scene from whichever precedent has the most measured
  // dimensions, so the cartoon reflects real before/after satellite values.
  const sceneReadings =
    result?.analogues
      .map((a) => a.evidence?.readings ?? [])
      .sort((x, y) => y.filter((r) => r.metric).length - x.filter((r) => r.metric).length)[0] ?? [];

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">
        Tailored for a <strong>{profile.role}</strong> in <strong>{profile.location}</strong>.{" "}
        <a href="/auth/logout" className="underline">
          Not you?
        </a>
      </p>

      <InputPanel value={policy} onChange={setPolicy} onRun={run} loading={loading} />

      {error && (
        <p className="rounded-md bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Corner scene: animates while the analysis loads, then sweeps between
          the real measured before/after satellite values. */}
      {(loading || result) && <PolicyScene readings={sceneReadings} loading={loading} />}

      {result && (
        <section className="space-y-6">
          {/* What it means for YOU, where you live — the "downwind" read */}
          {local && (
            <div className="rounded-xl bg-neutral-900 p-4 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900">
              <p className="text-xs uppercase tracking-wide opacity-60">
                {local.reachesReader ? `Downwind of you · ${local.location}` : `Out of reach · ${local.location}`}
              </p>
              <p className="mt-1 text-lg font-semibold">{local.headline}</p>
              <p className="mt-2 text-sm opacity-80">
                <span className="opacity-60">How it reaches you: </span>
                {local.pathway}
              </p>
            </div>
          )}

          {/* Dual output — governed by the global Simple / Briefing header toggle */}
          <Card>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {mode === "simple" ? "Simple" : "Briefing"}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {mode === "simple" ? result.personalization.simple : result.personalization.briefing}
            </p>
          </Card>

          {/* Extracted mechanisms */}
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {result.extraction.title}
            </h2>
            <p className="mt-1 text-sm">{result.extraction.summary}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {result.extraction.levers.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge tone={l.obvious ? "neutral" : "accent"} className="mt-0.5">
                    {l.obvious ? "direct" : "hidden lever"}
                  </Badge>
                  <span>
                    {l.mechanism} <span className="text-neutral-400">· {l.direction.replace(/_/g, " ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Three honest horizons */}
          <div className="grid gap-3 sm:grid-cols-3">
            {result.horizons.map((h) => (
              <Card key={h.years}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{h.years}y</span>
                  <Badge tone={h.label as Tone}>{h.label}</Badge>
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{h.assessment}</p>
              </Card>
            ))}
          </div>

          {/* Observed analogues (receipts mode) */}
          {result.analogues.length > 0 && (
            <div>
              <SectionHeading>Observed precedents (receipts)</SectionHeading>
              <ul className="space-y-2">
                {result.analogues.map((a) => (
                  <li key={a.policyId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.title}</span>
                      <span className="text-xs text-neutral-400">
                        {a.region} · {a.enactedYear} · match {(a.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{a.observedDelta}</p>

                    {/* Receipts: before/after image pairs + measured values across
                        the full climate surface, one card per dimension. */}
                    {a.evidence && a.evidence.readings.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {a.evidence.readings.map((r) => (
                          <div key={r.key} className="rounded-md bg-[var(--surface-2)] p-3">
                            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
                              <span>📡 {r.label}</span>
                              <span className="shrink-0">{r.dataset}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              {[r.before, r.after].map((img, i) => (
                                <figure key={i}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={img.url}
                                    alt={`${i === 0 ? "Before" : "After"} — ${r.label}`}
                                    loading="lazy"
                                    className="aspect-square w-full rounded border border-[var(--border)] object-cover"
                                  />
                                  <figcaption className="mt-1 text-center text-[10px] text-neutral-500">
                                    {i === 0 ? "Before" : "After"} · {img.date}
                                  </figcaption>
                                </figure>
                              ))}
                            </div>
                            {/* Real physical value inverted from the GIBS colormap */}
                            {r.metric ? (
                              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs">
                                <span className={`font-semibold ${deltaColor(r.metric.deltaPct, r.metric.goodDirection)}`}>
                                  {r.metric.deltaPct > 0 ? "+" : ""}
                                  {r.metric.deltaPct}%
                                </span>
                                <span className="text-neutral-500">
                                  {fmt(r.metric.before)} → {fmt(r.metric.after)} {r.metric.unit}
                                </span>
                                <span className="text-neutral-400">
                                  measured{r.metric.coverage < 0.95 ? ` · ${Math.round(r.metric.coverage * 100)}% coverage` : ""}
                                </span>
                              </p>
                            ) : (
                              <p className="mt-2 text-[10px] text-neutral-400">Imagery only (scene too gap-covered to measure).</p>
                            )}
                            {r.interpretation && (
                              <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                                {r.interpretation.summary}{" "}
                                <span className="text-neutral-400">({r.interpretation.confidence} · {a.evidence!.model})</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Green-AI carbon receipt */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold">🌱 Carbon receipt {result.receipt.cached && "(cache hit — ~0 cost)"}</span>
              <span>{result.receipt.totalTokens.toLocaleString()} tokens</span>
              <span>≈ {result.receipt.estWattHours} Wh</span>
              <span>≈ {result.receipt.estGramsCO2} g CO₂e (est.)</span>
            </div>
            <p className="mt-1 opacity-70">
              Cheap Flash/Gemma for extraction, Pro only for synthesis, every result cached in MongoDB.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
