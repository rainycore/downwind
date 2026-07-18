import { Type } from "@google/genai";

// ── The climate-lever taxonomy ──
// Downwind's core premise: NO bill is assumed climate-neutral until screened.
// A highway expansion is an emissions bill; a zoning reform is a heat-island
// bill; a farm subsidy is a land-use bill. Screening maps free text onto these.
export const CLIMATE_LEVERS = [
  "emissions", // combustion, energy mix, transport demand
  "land_use", // zoning, deforestation, agriculture, sprawl
  "heat", // urban heat island, albedo, tree canopy
  "water", // watersheds, drainage, irrigation, flood control
  "fire", // fuel loads, suppression budgets, prescribed burns
  "air_quality", // aerosols, NO2, PM2.5 sources
] as const;
export type ClimateLever = (typeof CLIMATE_LEVERS)[number];

// ── The impact surface ──
// Every analysis reports across the full climate surface, each dimension
// grounded in a specific satellite observable.
export const IMPACT_DIMENSIONS = [
  { key: "air_quality", label: "Air quality", observable: "Sentinel-5P aerosols / NO₂, OpenAQ ground truth" },
  { key: "extreme_heat", label: "Extreme heat", observable: "Landsat thermal (surface temperature)" },
  { key: "vegetation", label: "Vegetation & land cover", observable: "NDVI, NBR burn severity" },
  { key: "flood_drought", label: "Flood & drought", observable: "Sentinel-1 flood extent, NDWI" },
  { key: "emissions", label: "Emissions", observable: "Sentinel-5P column densities" },
  { key: "water", label: "Water resources", observable: "NDWI, surface-water extent" },
] as const;
export type ImpactKey = (typeof IMPACT_DIMENSIONS)[number]["key"];

// ── Structured-output schema: policy screening + mechanism extraction ──
// This is the "economic policies that secretly affect climate" step.
export const POLICY_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Short name for the policy." },
    summary: { type: Type.STRING, description: "One-sentence plain summary." },
    // Screening: never assume neutral. If genuinely no lever applies, say so explicitly.
    screening: {
      type: Type.OBJECT,
      properties: {
        assumedNeutral: {
          type: Type.BOOLEAN,
          description: "Always false unless screening actively found NO climate lever.",
        },
        matchedLevers: {
          type: Type.ARRAY,
          items: { type: Type.STRING, enum: [...CLIMATE_LEVERS] },
          description: "Which taxonomy levers this bill actually pulls, obvious or hidden.",
        },
        rationale: { type: Type.STRING, description: "Why these levers — name the hidden ones." },
      },
      required: ["assumedNeutral", "matchedLevers", "rationale"],
    },
    levers: {
      type: Type.ARRAY,
      description: "Mechanisms by which the policy changes environmental outcomes.",
      items: {
        type: Type.OBJECT,
        properties: {
          mechanism: { type: Type.STRING, description: "The causal lever." },
          obvious: {
            type: Type.BOOLEAN,
            description: "False for hidden/economic levers that indirectly affect climate.",
          },
          direction: {
            type: Type.STRING,
            enum: ["increases_emissions", "decreases_emissions", "ambiguous"],
          },
        },
        required: ["mechanism", "obvious", "direction"],
      },
    },
    geography: {
      type: Type.OBJECT,
      properties: {
        scope: { type: Type.STRING, enum: ["local", "regional", "national", "supranational"] },
        regions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["scope", "regions"],
    },
    searchQuery: {
      type: Type.STRING,
      description: "Dense description of this policy's mechanisms for vector search over enacted policies.",
    },
  },
  required: ["title", "summary", "screening", "levers", "geography", "searchQuery"],
} as const;

export type PolicyExtraction = {
  title: string;
  summary: string;
  screening: { assumedNeutral: boolean; matchedLevers: ClimateLever[]; rationale: string };
  levers: { mechanism: string; obvious: boolean; direction: "increases_emissions" | "decreases_emissions" | "ambiguous" }[];
  geography: { scope: "local" | "regional" | "national" | "supranational"; regions: string[] };
  searchQuery: string;
};

// ── Synthesis output: per-dimension impact + three horizons + dual mode ──
export type Horizon = {
  years: number;
  label: "observed" | "extrapolated" | "speculative";
  assessment: string;
};

export type DimensionImpact = {
  key: ImpactKey;
  direction: "worse" | "better" | "mixed" | "negligible";
  confidence: "observed" | "extrapolated" | "speculative";
  finding: string; // grounded in the analogues' observable
};

export type SynthesisOutput = {
  dimensions: DimensionImpact[];
  horizons: Horizon[];
  localTranslation: string; // e.g. "≈ +6 smoke days/year in Toronto"
  // Dual output, generated from the same analysis in one pass.
  briefing: string; // mechanisms, confidence, citations — for lawmakers
  simple: string; // TL;DR a five-year-old follows
};

export const SYNTHESIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    dimensions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, enum: IMPACT_DIMENSIONS.map((d) => d.key) },
          direction: { type: Type.STRING, enum: ["worse", "better", "mixed", "negligible"] },
          confidence: { type: Type.STRING, enum: ["observed", "extrapolated", "speculative"] },
          finding: { type: Type.STRING },
        },
        required: ["key", "direction", "confidence", "finding"],
      },
    },
    horizons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          years: { type: Type.INTEGER },
          label: { type: Type.STRING, enum: ["observed", "extrapolated", "speculative"] },
          assessment: { type: Type.STRING },
        },
        required: ["years", "label", "assessment"],
      },
    },
    localTranslation: { type: Type.STRING },
    briefing: { type: Type.STRING, description: "Lawmaker briefing: mechanisms, confidence, citations." },
    simple: { type: Type.STRING, description: "TL;DR a five-year-old could follow." },
  },
  required: ["dimensions", "horizons", "localTranslation", "briefing", "simple"],
} as const;
