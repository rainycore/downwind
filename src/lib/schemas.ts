import { Type } from "@google/genai";

// ── Structured-output schema for policy mechanism extraction ──
// This is the "economic policies that secretly affect climate" step: Gemini
// reads free-text policy and surfaces the non-obvious environmental levers
// (zoning, fire-suppression budgets, ag subsidies, ...).

export const POLICY_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Short name for the policy." },
    summary: { type: Type.STRING, description: "One-sentence plain summary." },
    sectors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Sectors affected, e.g. energy, agriculture, land-use, transport, forestry.",
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
        regions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Named places the policy applies to.",
        },
      },
      required: ["scope", "regions"],
    },
    timescale: {
      type: Type.STRING,
      enum: ["immediate", "years", "decades"],
      description: "When effects are expected to become observable.",
    },
    searchQuery: {
      type: Type.STRING,
      description: "A dense description of this policy's mechanisms, used to find analogous enacted policies via vector search.",
    },
  },
  required: ["title", "summary", "sectors", "levers", "geography", "timescale", "searchQuery"],
} as const;

// TS-side mirror of the schema for typed consumption.
export type PolicyExtraction = {
  title: string;
  summary: string;
  sectors: string[];
  levers: { mechanism: string; obvious: boolean; direction: "increases_emissions" | "decreases_emissions" | "ambiguous" }[];
  geography: { scope: "local" | "regional" | "national" | "supranational"; regions: string[] };
  timescale: "immediate" | "years" | "decades";
  searchQuery: string;
};

// Epistemic honesty labels for the three output horizons.
export type Horizon = {
  years: number;
  label: "observed" | "extrapolated" | "speculative";
  assessment: string;
};
