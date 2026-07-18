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

// ── Reader profile ──────────────────────────────────────────────────────────
// Collected once, right after Auth0 login (see /onboarding). Drives who the
// analysis is written for:
//   - role      → which output mode leads (lawmaker → briefing, citizen → simple)
//   - education → reading level within each mode
//   - location  → the whole point of "Downwind": a policy enacted anywhere can
//                 reach YOU on the wind/water/trade, so we ground impact where
//                 the reader actually lives (Toronto smoke drifting into NYC).
export const READER_ROLES = ["lawmaker", "citizen"] as const;
export type ReaderRole = (typeof READER_ROLES)[number];

export const EDUCATION_LEVELS = ["elementary", "high_school", "undergraduate", "graduate"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export type UserProfile = {
  sub: string; // Auth0 user id — the profile key
  role: ReaderRole;
  location: string; // free-text, e.g. "New York City, USA"
  education: EducationLevel;
  createdAt: string;
  updatedAt: string;
};

// Human labels for the education levels, reused by the form and the prompt.
export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  elementary: "Explain it like I'm five",
  high_school: "High-school level",
  undergraduate: "College level",
  graduate: "Expert / technical",
};

// ── Personalized, location-aware output ─────────────────────────────────────
// Both modes are generated from the same analysis JSON in one pass, then the UI
// shows the one matching the reader's role (with a toggle to the other).
export type LocalImpact = {
  location: string;
  headline: string; // the visceral local number, e.g. "≈ +6 smoke days/year in NYC within 3 years"
  pathway: string; // HOW a policy enacted elsewhere reaches this location (wind, water, trade…)
  reachesReader: boolean; // false when the reader is genuinely out of the impact's reach
};

export type Personalization = {
  simple: string; // TL;DR a five-year-old could follow
  briefing: string; // mechanisms, confidence, citations — for lawmakers / technical readers
  local: LocalImpact;
};
