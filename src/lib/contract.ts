// ── THE DATA CONTRACT (plan.md L95-178) ──
// One JSON object that grows as it flows L1 -> L2 -> L2.5 -> L3 -> L3.5 -> L4.
// Every layer plugs into it; any layer can be stubbed against it; "receipts
// mode" renders it. This TS type and the sidecar's Pydantic model
// (sidecar/app/contract.py) are two views of the SAME contract — keep in sync.
//
// Discipline: numbers come from deterministic tools (L3/L3.5), never token
// generation. Each numeric block carries a PROVENANCE_TAG.

import type {
  WorldCoverClass,
  IpccAfoluClass,
  LeverType,
  ChangeDirection,
  ChangeMagnitudeOrdinal,
  ConfidenceEnum,
  ProvenanceTag,
} from "./taxonomy";

// bbox is [minLon, minLat, maxLon, maxLat] (W,S,E,N) in EPSG:4326 — the order
// Sentinel Hub / STAC expect. (GIBS' lat-first quirk is handled in the sidecar.)
export type BBox = [number, number, number, number];

// ── Layer 1 — policy text -> structured mechanisms (Gemini, interpretation only) ──
export type Lever = {
  name: string;
  type: LeverType;
  non_obvious: boolean; // the "secret levers" flag
  source_span: string; // mandatory verbatim quote — the anti-hallucination leash
  confidence: ConfidenceEnum;
};

export type MechanismCategory = {
  worldcover_class: WorldCoverClass;
  code: number;
  change_direction: ChangeDirection;
  change_magnitude_ordinal: ChangeMagnitudeOrdinal; // enum, NEVER a float
  source_span: string;
  worldcover_to_ipcc: IpccAfoluClass;
};

export type Layer1Mechanisms = {
  policy_source: string; // "curated:<id>" | "user_paste"
  policy_summary: string;
  sectors: string[];
  levers: Lever[];
  geography: { region_query: string; scope: "local" | "subnational" | "national" | "supranational" };
  timescale: { enacted_year: number | null; horizon_years: number[] };
  domain_routing: { land_cover: boolean; air_quality: boolean };
  categories: MechanismCategory[];
  model_stated_confidence_uncalibrated: number;
  finish_reason: string;
};

// ── Layer 2 — analog retrieval (the spine) ──
export type PrecomputedCounterfactual = {
  avoided_loss_km2: number | null;
  ci95: [number, number] | null;
  method: string;
  cite: string;
};

export type Layer2Analog = {
  analog_id: string;
  title?: string; // human label (for receipts / legacy UI); not part of the core spine
  similarity: number;
  rerank_verdict: "comparable_mechanism" | "weak_analog" | "rejected" | "unranked";
  rerank_reason?: string;
  region: { name: string; bbox: BBox; geometry_ref: string };
  enacted_year: number;
  observable_window: string; // "2019-06/2019-09 vs 2023-06/2023-09"
  documented_outcome: string;
  precomputed_counterfactual: PrecomputedCounterfactual;
  domain: "land_cover" | "air_quality";
};

// ── Layer 2.5 — region -> geometry (Python sidecar; MVP = bbox) ──
export type Layer2_5Geometry = {
  resolved: { source: string; bbox: BBox; is_admin_unit: boolean };
  resolver_path: "prestored" | "bbox" | "admin" | "ecoregion" | "city";
  geocoder_confidence: number;
  candidates: Array<{ name: string; bbox: BBox }>;
};

// ── Layer 3 — LIVE EO fetch + real deltas (forest, sidecar) [OBSERVED] ──
export type ObservedImagery = {
  product: string;
  composite: string;
  t0: string;
  t1: string;
  source: string; // "Sentinel Hub CDSE Process API" | "NASA GIBS Worldview Snapshots" | ...
  before_png_ref: string | null; // data URI or URL; null when all-cloudy (never fabricated)
  after_png_ref: string | null;
  baseline_year_staleness?: string | null;
};

export type Layer3Observed = {
  land_cover: {
    imagery: ObservedImagery | null;
    ndvi_mean_t0: number | null;
    ndvi_mean_t1: number | null;
    ndvi_delta: number | null;
    nbr_delta: number | null;
    changed_area_fraction: number | null;
    PROVENANCE_TAG: ProvenanceTag; // "OBSERVED"
    flags: string[]; // e.g. ["all_cloudy_window", "min_bbox_guard"]
  };
  fire: {
    firms_fire_count_t0: number | null;
    firms_fire_count_t1: number | null;
    firms_fire_count_delta: number | null;
    firms_frp_sum_delta: number | null;
    PROVENANCE_TAG: ProvenanceTag;
  };
  air_quality: {
    // [STRETCH] — null in MVP
    s5p_no2_delta_pct: number | null;
    aerosol_index_delta: number | null;
    openaq_pm25_crosscheck: number | null;
    PROVENANCE_TAG: ProvenanceTag;
  };
};

// ── Layer 3.5 — counterfactual [MODELED] (MVP = precomputed) ──
export type Layer3_5Counterfactual = {
  source: "precomputed_hero_case" | "live";
  method: string;
  avoided_loss_km2: number | null;
  ci95: [number, number] | null;
  placebo_p: number | null;
  assumptions: string[];
  fallback_used: boolean;
  cite?: string;
  PROVENANCE_TAG: ProvenanceTag; // "MODELED"
};

// ── Layer 4 — Gemini VISION corroboration -> three-horizon report [LLM_NARRATIVE] ──
export type VlmCorroboration = {
  visible_change: string;
  direction_agrees_with_tools: boolean; // false => surfaced as an honesty flag
  discrepancy_note: string | null;
  evidence: string[]; // per-claim visual evidence strings
  PROVENANCE_TAG: ProvenanceTag; // "LLM_NARRATIVE"
};

export type HorizonReport = {
  "3y": { summary: string; PROVENANCE_TAG: ProvenanceTag };
  "5_10y": { summary: string; method: string; PROVENANCE_TAG: ProvenanceTag };
  "30y": { summary: string; flag: "SPECULATIVE_SCENARIO"; PROVENANCE_TAG: ProvenanceTag };
};

export type Layer4Impact = {
  vlm_corroboration: VlmCorroboration;
  horizons: HorizonReport;
  local_translation: {
    metric: string;
    place: string;
    value: number | null;
    method: string;
    PROVENANCE_TAG: ProvenanceTag;
  } | null;
  caveats: string[];
  per_number_provenance: Record<string, ProvenanceTag>;
  self_consistency: { runs: number; narrative_variance: string };
};

// ── The whole contract as it exists after a full pipeline run ──
export type PolicyLensContract = {
  layer1_mechanisms: Layer1Mechanisms;
  layer2_analogs: Layer2Analog[];
  layer2_5_geometry: Layer2_5Geometry | null;
  layer3_observed: Layer3Observed | null;
  layer3_5_counterfactual: Layer3_5Counterfactual | null;
  layer4_impact: Layer4Impact | null;
};

// ── The sidecar seam (plan.md L361) ──
// Next.js POSTs this; the sidecar returns { layer2_5_geometry, layer3_observed }.
export type EoRequest = {
  bbox: BBox | null; // if null, sidecar geocodes region_query
  region_query: string;
  window_t0: string; // "YYYY-MM-DD/YYYY-MM-DD" — season-matched to t1
  window_t1: string;
  domain: "land_cover" | "air_quality";
  worldcover_class?: WorldCoverClass;
};

export type EoResponse = {
  layer2_5_geometry: Layer2_5Geometry;
  layer3_observed: Layer3Observed;
};
