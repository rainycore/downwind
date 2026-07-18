// Client-safe reader/profile types and constants.
// Kept separate from schemas.ts so client components (onboarding, analyzer) can
// import these without pulling the server-only @google/genai SDK into the bundle.

export const READER_ROLES = ["lawmaker", "citizen"] as const;
export type ReaderRole = (typeof READER_ROLES)[number];

export const EDUCATION_LEVELS = ["elementary", "high_school", "undergraduate", "graduate"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

// Human labels for the education levels, reused by the form and the prompt.
export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  elementary: "Explain it like I'm five",
  high_school: "High-school level",
  undergraduate: "College level",
  graduate: "Expert / technical",
};

export type UserProfile = {
  sub: string; // Auth0 user id — the profile key
  role: ReaderRole;
  location: string; // free-text, e.g. "New York City, USA"
  education: EducationLevel;
  createdAt: string;
  updatedAt: string;
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

// ── Satellite evidence (Receipts mode) ──────────────────────────────────────
// Per climate dimension, a before/after image pair (what the situation was →
// how it changed, grounding the future horizons) plus a REAL measured value
// inverted from the GIBS colormap pixels — no GPU, no external raster service.

// One dimension's reading for one analogue region.
export type DimensionReading = {
  key: string; // DimensionKey, e.g. "vegetation"
  label: string; // "Vegetation & land cover"
  dataset: string; // provenance for Receipts
  before: { date: string; url: string };
  after: { date: string; url: string };
  // Physical measurement inverted from the colormap. null if the scene was
  // blank/too gap-covered to measure (imagery still shown).
  metric: {
    unit: string; // "NDVI", "°C", "AOD", "DU", "molecules/cm²", "mm/hr", "% cover"
    before: number;
    after: number;
    deltaPct: number;
    coverage: number; // 0..1 fraction of pixels that mapped to the palette
    goodDirection: "up" | "down" | "neutral"; // is an increase env-good?
  } | null;
  // Optional qualitative read from local Gemma vision (precompute only).
  interpretation: {
    observable: string;
    summary: string;
    direction: "improved" | "degraded" | "mixed" | "no_change";
    confidence: "high" | "medium" | "low";
  } | null;
};

export type SatelliteEvidence = {
  policyId: string;
  region: string;
  model: string | null; // which VLM produced any interpretations
  readings: DimensionReading[]; // one per climate dimension
};
