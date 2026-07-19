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
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// A citation is either a clickable URL or a plain reference string.
function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

// A tool-derived delta: sign is what matters (loss vs gain), tag it OBSERVED.
function Delta({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-semibold ${deltaColor(value, "up")}`}>
        {value > 0 ? "+" : ""}
        {fmt(value)}
      </span>
    </span>
  );
}

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

  // The provenance-tagged contract the backend already ships to the client. The
  // legacy derived fields above drop it; these blocks render it directly so the
  // honesty story (tags, live imagery, VLM cross-check, counterfactual CI, and
  // caveats) is actually visible — plan.md acceptance gate.
  const contract = result?.contract;
  const l1 = contract?.layer1_mechanisms;
  const obs = contract?.layer3_observed;
  const l4 = contract?.layer4_impact;
  const vlm = l4?.vlm_corroboration;
  const cf = contract?.layer3_5_counterfactual;
  const img = obs?.land_cover.imagery ?? null;
  const hasPair = Boolean(img?.before_png_ref && img?.after_png_ref);

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
            <ul className="mt-3 space-y-2 text-sm">
              {result.extraction.levers.map((l, i) => {
                // The contract lever carries the mandatory source-span quote —
                // the anti-hallucination "leash" (plan.md L189). Match by index;
                // deriveLegacy maps them 1:1 in order.
                const span = l1?.levers[i]?.source_span;
                return (
                  <li key={i} className="flex items-start gap-2">
                    <Badge tone={l.obvious ? "neutral" : "accent"} className="mt-0.5">
                      {l.obvious ? "direct" : "hidden lever"}
                    </Badge>
                    <span>
                      {l.mechanism}
                      {span && (
                        <span className="mt-0.5 block border-l-2 border-[var(--border)] pl-2 text-xs text-neutral-500 italic">
                          “{span}”
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Three honest horizons — provenance-tagged straight from the
              contract (OBSERVED / MODELED / LLM_NARRATIVE), with the 5–10y
              method and the 30y SPECULATIVE flag surfaced. */}
          {l4?.horizons ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">3y</span>
                  <ProvenanceBadge tag={l4.horizons["3y"].PROVENANCE_TAG} />
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{l4.horizons["3y"].summary}</p>
              </Card>
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">5–10y</span>
                  <ProvenanceBadge tag={l4.horizons["5_10y"].PROVENANCE_TAG} />
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{l4.horizons["5_10y"].summary}</p>
                <p className="mt-2 text-[10px] text-neutral-400">method: {l4.horizons["5_10y"].method}</p>
              </Card>
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">30y</span>
                  <ProvenanceBadge tag={l4.horizons["30y"].PROVENANCE_TAG} />
                </div>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{l4.horizons["30y"].summary}</p>
                <Badge tone="speculative" className="mt-2">
                  {l4.horizons["30y"].flag.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </Card>
            </div>
          ) : (
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
          )}

          {/* Live satellite read — the real before/after pair from the sidecar
              (L3), the tool-measured deltas [OBSERVED], and the VLM direction
              cross-check [LLM_NARRATIVE]. Never fabricates: null imagery shows an
              honest flag, not a blank card (plan.md L250, L282). */}
          {obs && (
            <div>
              <SectionHeading>Live satellite read</SectionHeading>
              <Card>
                {hasPair && img ? (
                  <>
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
                      <span>📡 {img.product} · {img.composite}</span>
                      <span className="shrink-0">{img.source}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        { url: img.before_png_ref!, label: "Before", date: img.t0 },
                        { url: img.after_png_ref!, label: "After", date: img.t1 },
                      ].map((f) => (
                        <figure key={f.label}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.url}
                            alt={`${f.label} — live Sentinel/GIBS composite`}
                            loading="lazy"
                            className="aspect-square w-full rounded border border-[var(--border)] object-cover"
                          />
                          <figcaption className="mt-1 text-center text-[10px] text-neutral-500">
                            {f.label} · {f.date}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">
                    No before/after imagery for this window
                    {obs.land_cover.flags.length > 0 && ` (${obs.land_cover.flags.join(", ")})`}. Not fabricated.
                  </p>
                )}

                {/* Tool-measured deltas, tagged OBSERVED */}
                {(obs.land_cover.ndvi_delta !== null ||
                  obs.land_cover.nbr_delta !== null ||
                  obs.fire.firms_fire_count_delta !== null) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {obs.land_cover.ndvi_delta !== null && <Delta label="NDVI Δ" value={obs.land_cover.ndvi_delta} />}
                    {obs.land_cover.nbr_delta !== null && <Delta label="NBR Δ" value={obs.land_cover.nbr_delta} />}
                    {obs.fire.firms_fire_count_delta !== null && (
                      <Delta label="fire count Δ" value={obs.fire.firms_fire_count_delta} />
                    )}
                    <ProvenanceBadge tag="OBSERVED" />
                  </div>
                )}

                {/* VLM visual corroboration + direction cross-check */}
                {vlm && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">Vision cross-check</span>
                      <ProvenanceBadge tag="LLM_NARRATIVE" />
                    </div>
                    <p className="mt-1 text-sm">{vlm.visible_change}</p>
                    {hasPair &&
                      (vlm.direction_agrees_with_tools ? (
                        <p className="mt-2 inline-flex rounded bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          ✓ The picture agrees with the measured direction of change.
                        </p>
                      ) : (
                        <p className="mt-2 rounded bg-rose-100 px-2 py-1 text-[11px] text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                          ⚠ The picture disagrees with the numbers
                          {vlm.discrepancy_note && `: ${vlm.discrepancy_note}`}
                        </p>
                      ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Counterfactual — the MODELED avoided-loss estimate with CI +
              clickable citation, or an honest "no defensible number" when null. */}
          {cf && (
            <div>
              <SectionHeading>Counterfactual estimate</SectionHeading>
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">Avoided loss (matched estimate)</span>
                  <ProvenanceBadge tag={cf.PROVENANCE_TAG} />
                </div>
                {cf.avoided_loss_km2 !== null ? (
                  <p className="mt-1 text-lg font-semibold">
                    {fmt(cf.avoided_loss_km2)} km²
                    {cf.ci95 && (
                      <span className="ml-2 text-sm font-normal text-neutral-500">
                        95% CI {fmt(cf.ci95[0])}–{fmt(cf.ci95[1])} km²
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-neutral-500">No defensible matched counterfactual for this case.</p>
                )}
                {cf.method && <p className="mt-1 text-xs text-neutral-500">{cf.method}</p>}
                {cf.cite && (
                  <p className="mt-1 text-xs text-neutral-400">
                    Source:{" "}
                    {isUrl(cf.cite) ? (
                      <a href={cf.cite} target="_blank" rel="noreferrer" className="underline">
                        {cf.cite}
                      </a>
                    ) : (
                      cf.cite
                    )}
                  </p>
                )}
                {cf.fallback_used && (
                  <Badge tone="mixed" className="mt-2">
                    fallback used
                  </Badge>
                )}
              </Card>
            </div>
          )}

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

          {/* Assumptions & limitations — the visible honesty panel (plan.md
              L315). Collapsed by default; caveats from L4 + counterfactual
              assumptions, all computed by the backend. */}
          {((l4?.caveats?.length ?? 0) > 0 || (cf?.assumptions?.length ?? 0) > 0) && (
            <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Assumptions &amp; limitations
              </summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-600 dark:text-neutral-400">
                {l4?.caveats?.map((c, i) => <li key={`cav-${i}`}>{c}</li>)}
                {cf?.assumptions?.map((a, i) => <li key={`asm-${i}`}>{a}</li>)}
              </ul>
            </details>
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
