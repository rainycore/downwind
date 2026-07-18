// ── Layer 4 — Gemini VISION corroboration -> three-horizon report [MVP] ──
// plan.md L277-295. The VLM's job is CORROBORATION + TRANSLATION, NOT
// measurement. Frontier VLMs fail fluently on RS perception, so every number in
// the report traces to an L3/L3.5 tool; the VLM sources NO quantity. What it adds:
//   1. describe the VISIBLE change a human would see (makes ndvi_delta legible),
//   2. cross-check the DIRECTION of change vs the computed delta -> honesty flag,
//   3. drive the before/after visual moment.
// Then a text-only pass writes the three provenance-tagged horizons over the
// tagged evidence.

import { Type } from "@google/genai";
import { gemini, MODELS, usageOf } from "./gemini";
import type { Usage } from "./greenai";
import type {
  Layer2Analog,
  Layer3Observed,
  Layer4Impact,
  VlmCorroboration,
  HorizonReport,
} from "./contract";
import type { ExtractionResult } from "./extract";

// data:image/jpeg;base64,XXXX -> { mimeType, data } for inline image parts.
function parseDataUri(uri: string | null): { mimeType: string; data: string } | null {
  if (!uri) return null;
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(uri);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

// ── Vision corroboration schema (per-quadrant reasoning before conclusion) ──
const QUADRANTS = ["NW", "NE", "SW", "SE"] as const;
const CHANGE_CATEGORIES = [
  "tree_cover_loss",
  "tree_cover_gain",
  "burn_scar",
  "cropland_change",
  "built_up_expansion",
  "water_change",
  "no_change",
  "other",
] as const;

const CORROBORATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    quadrants: {
      type: Type.ARRAY,
      description: "Reason per quadrant BEFORE any overall conclusion.",
      items: {
        type: Type.OBJECT,
        properties: {
          quadrant: { type: Type.STRING, enum: [...QUADRANTS] },
          change_category: { type: Type.STRING, enum: [...CHANGE_CATEGORIES] },
          evidence: { type: Type.STRING, description: "The visual cue you based this on (shape, color, texture)." },
        },
        required: ["quadrant", "change_category", "evidence"],
      },
    },
    visible_change: { type: Type.STRING, description: "One vivid sentence a human would recognise, e.g. 'NW: contiguous canopy fragments into fishbone road-led clearing.'" },
    direction_agrees_with_tools: { type: Type.BOOLEAN },
    discrepancy_note: { type: Type.STRING, description: "Empty string if it agrees; else why the picture disagrees with the tools' sign." },
  },
  required: ["quadrants", "visible_change", "direction_agrees_with_tools", "discrepancy_note"],
} as const;

type RawCorroboration = {
  quadrants?: Array<{ quadrant?: string; change_category?: string; evidence?: string }>;
  visible_change?: string;
  direction_agrees_with_tools?: boolean;
  discrepancy_note?: string;
};

function toolDirectionSentence(obs: Layer3Observed): string {
  const d = obs.land_cover.ndvi_delta;
  if (d === null || d === undefined) {
    return "The deterministic tools produced NO numeric NDVI/NBR delta for this pair (imagery-only fallback). Do not invent one; just describe what is visible and set direction_agrees_with_tools=true with a note that no numeric delta was available.";
  }
  const nbr = obs.land_cover.nbr_delta;
  const dir = d < 0 ? "vegetation LOSS (canopy decline)" : d > 0 ? "vegetation GAIN (greening)" : "no net vegetation change";
  return `The deterministic tools measured NDVI delta = ${d} and NBR delta = ${nbr ?? "n/a"} (negative NDVI => ${dir}). Decide whether the VISIBLE change in the pair is consistent with the SIGN of that delta.`;
}

/**
 * Vision corroboration over the before/after pair. Returns null-safe block even
 * when imagery is missing (all-cloudy) so the pipeline never hard-fails.
 */
export async function corroborate(
  observed: Layer3Observed,
  usages: Usage[],
): Promise<VlmCorroboration> {
  const img = observed.land_cover.imagery;
  const before = parseDataUri(img?.before_png_ref ?? null);
  const after = parseDataUri(img?.after_png_ref ?? null);

  if (!before || !after) {
    return {
      visible_change: "No before/after imagery available (all-cloudy or provider failure); visual corroboration skipped.",
      direction_agrees_with_tools: true,
      discrepancy_note: "imagery_unavailable",
      evidence: [],
      PROVENANCE_TAG: "LLM_NARRATIVE",
    };
  }

  const instruction = `You are corroborating a land-cover analysis by reading a season-matched satellite BEFORE/AFTER pair. ${toolDirectionSentence(observed)}
Rules: illumination, season, cloud, and slight misregistration are NOT land-cover change — exclude them. Reason per quadrant (NW/NE/SW/SE) first, then conclude. If the picture disagrees with the SIGN of the tools' delta, set direction_agrees_with_tools=false and explain in discrepancy_note. You must NOT output any numbers, rates, or magnitudes — description only.`;

  const resp = await gemini().models.generateContent({
    model: MODELS.synth,
    contents: [
      { text: "BEFORE (t0):" },
      { inlineData: { mimeType: before.mimeType, data: before.data } },
      { text: "AFTER (t1):" },
      { inlineData: { mimeType: after.mimeType, data: after.data } },
      { text: instruction },
    ],
    config: { responseMimeType: "application/json", responseSchema: CORROBORATION_SCHEMA, temperature: 0.2 },
  });
  usages.push(usageOf(MODELS.synth, resp));

  const raw = JSON.parse(resp.text ?? "{}") as RawCorroboration;
  const evidence = (raw.quadrants ?? [])
    .filter((q) => q.change_category && q.change_category !== "no_change")
    .map((q) => `${q.quadrant}: ${q.change_category} — ${q.evidence ?? ""}`.trim());

  return {
    visible_change: raw.visible_change ?? "",
    direction_agrees_with_tools: raw.direction_agrees_with_tools ?? true,
    discrepancy_note: raw.discrepancy_note && raw.discrepancy_note.trim() ? raw.discrepancy_note.trim() : null,
    evidence,
    PROVENANCE_TAG: "LLM_NARRATIVE",
  };
}

// ── Three-horizon narrative over the tagged evidence (text-only) ──
const HORIZON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    horizon_3y: { type: Type.STRING, description: "OBSERVED: what the analog region's real data actually shows. Lead with it." },
    horizon_5_10y: { type: Type.STRING, description: "MODELED: statistical extrapolation of the observed delta with a stated method and an explicit uncertainty range. A fitted trend, not a vibe." },
    horizon_5_10y_method: { type: Type.STRING, description: "State the extrapolation method + uncertainty, e.g. 'linear extrapolation of observed NDVI delta, +/- CI'." },
    horizon_30y: { type: Type.STRING, description: "SPECULATIVE scenario narrative. Explicitly uncertain. No numbers, or every number clearly hypothetical." },
  },
  required: ["horizon_3y", "horizon_5_10y", "horizon_5_10y_method", "horizon_30y"],
} as const;

export async function synthesizeHorizons(
  extraction: ExtractionResult,
  analogs: Layer2Analog[],
  observed: Layer3Observed,
  counterfactualCite: string | null,
  corroboration: VlmCorroboration,
  usages: Usage[],
): Promise<HorizonReport> {
  const evidence = {
    policy_summary: extraction.policy_summary,
    levers: extraction.levers,
    analog_documented_outcomes: analogs.map((a) => ({ id: a.analog_id, outcome: a.documented_outcome, counterfactual: a.precomputed_counterfactual })),
    observed_deltas: {
      ndvi_delta: observed.land_cover.ndvi_delta,
      nbr_delta: observed.land_cover.nbr_delta,
      firms_fire_count_delta: observed.fire.firms_fire_count_delta,
    },
    vlm_visible_change: corroboration.visible_change,
  };

  const prompt = `Write a three-horizon impact read grounded in OBSERVED satellite precedent — precedent, not prediction. Do NOT invent numeric magnitudes; the only numbers you may reference are those provided in EVIDENCE (they are tool-derived). ${counterfactualCite ? `Cite the counterfactual as: ${counterfactualCite}.` : ""}

EVIDENCE (every number here is already tool-derived and provenance-tagged):
${JSON.stringify(evidence, null, 2)}

Horizons:
- 3y  -> OBSERVED: what the analog data actually shows; lead with it.
- 5-10y -> MODELED: extrapolate the observed delta with a STATED method + uncertainty range.
- 30y -> SPECULATIVE scenario: explicitly uncertain, cordoned, number-free.`;

  const resp = await gemini().models.generateContent({
    model: MODELS.synth,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: HORIZON_SCHEMA, temperature: 0.3 },
  });
  usages.push(usageOf(MODELS.synth, resp));
  const raw = JSON.parse(resp.text ?? "{}") as {
    horizon_3y?: string;
    horizon_5_10y?: string;
    horizon_5_10y_method?: string;
    horizon_30y?: string;
  };

  return {
    "3y": { summary: raw.horizon_3y ?? "", PROVENANCE_TAG: "OBSERVED" },
    "5_10y": { summary: raw.horizon_5_10y ?? "", method: raw.horizon_5_10y_method ?? "trend extrapolation", PROVENANCE_TAG: "MODELED" },
    "30y": { summary: raw.horizon_30y ?? "", flag: "SPECULATIVE_SCENARIO", PROVENANCE_TAG: "LLM_NARRATIVE" },
  };
}

// Standard caveats (plan.md L173, L315) + imagery-source-specific ones.
function buildCaveats(observed: Layer3Observed): string[] {
  const caveats = [
    "Sentinel-2/MODIS change is not equivalent to permanent deforestation.",
    "Illumination and season are not fully controlled beyond season-matching.",
    "Counterfactual estimates carry non-random-siting bias unless corrected in the source study.",
    "Leakage/SUTVA displacement and time-varying unobservables are not controlled.",
  ];
  const src = observed.land_cover.imagery?.source ?? "";
  if (src.includes("GIBS")) caveats.push("Fallback imagery is 250 m (MODIS) — coarse; no numeric NDVI/NBR available for this pair.");
  else caveats.push("10 m resolution has real per-pixel error.");
  observed.land_cover.flags.forEach((f) => {
    if (f === "not_season_matched") caveats.push("WARNING: windows were not season-matched — signal may reflect seasonal swing.");
    if (f === "min_bbox_guard") caveats.push("WARNING: bounding box is small — few pixels, less reliable statistics.");
  });
  return caveats;
}

/** Compose the full Layer 4 block from its two model passes + code-owned provenance. */
export async function buildLayer4(
  extraction: ExtractionResult,
  analogs: Layer2Analog[],
  observed: Layer3Observed,
  counterfactualCite: string | null,
  usages: Usage[],
): Promise<Layer4Impact> {
  const vlm = await corroborate(observed, usages);
  const horizons = await synthesizeHorizons(extraction, analogs, observed, counterfactualCite, vlm, usages);

  // Provenance map is built in code, not by the model (plan.md L26).
  const per_number_provenance: Record<string, "OBSERVED" | "MODELED" | "LLM_NARRATIVE"> = {
    ndvi_delta: "OBSERVED",
    nbr_delta: "OBSERVED",
    firms_fire_count_delta: "OBSERVED",
    avoided_loss_km2: "MODELED",
    "horizons.3y": "OBSERVED",
    "horizons.5_10y": "MODELED",
    "horizons.30y": "LLM_NARRATIVE",
    vlm_corroboration: "LLM_NARRATIVE",
  };

  return {
    vlm_corroboration: vlm,
    horizons,
    local_translation: null, // [STRETCH] smoke-days — needs a cited coefficient; null, never fabricated
    caveats: buildCaveats(observed),
    per_number_provenance,
    self_consistency: { runs: 1, narrative_variance: "n/a in MVP" },
  };
}
