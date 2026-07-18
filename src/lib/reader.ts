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
// A before/after image pair for an analogue region, showing what the situation
// was (past), how it changed (present), grounding the future horizons. The
// `interpretation` is produced by local Gemma vision during precompute; it's
// null when only the deterministic image URLs are available (no VLM run yet).
export type SatelliteEvidence = {
  policyId: string;
  region: string;
  dimension: string;
  layerLabel: string;
  dataset: string;
  before: { date: string; url: string };
  after: { date: string; url: string };
  interpretation: {
    observable: string;
    summary: string;
    direction: "improved" | "degraded" | "mixed" | "no_change";
    confidence: "high" | "medium" | "low";
  } | null;
  model: string | null; // which VLM produced the interpretation
};
