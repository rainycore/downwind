// ── Layer 1 — policy text -> structured mechanisms (Gemini, TS) [MVP] ──
// plan.md L182-197. Gemini emits INTERPRETATION ONLY: sectors + levers +
// geography + timescale + WorldCover categories + ordinal magnitude + a
// MANDATORY source-span per lever/category. It must NOT emit numeric baselines
// or float magnitudes — a bare float is a hallucination generator; the schema
// structurally forbids one, and all numbers come from EO (L3).
//
// Hardening (load-bearing): finishReason branching incl. RECITATION retry, and
// post-parse validators that enforce enum membership against the code-owned
// taxonomies (a responseSchema constrains structure, NOT values).

import { Type } from "@google/genai";
import { gemini, MODELS, usageOf } from "./gemini";
import type { Usage } from "./greenai";
import type { Layer1Mechanisms, Lever, MechanismCategory } from "./contract";
import {
  WORLDCOVER,
  WORLDCOVER_CLASSES,
  LEVER_TYPES,
  CHANGE_DIRECTION,
  CHANGE_MAGNITUDE_ORDINAL,
  CONFIDENCE_ENUM,
  worldcoverToIpcc,
  type WorldCoverClass,
  type LeverType,
  type ConfidenceEnum,
  type ChangeDirection,
  type ChangeMagnitudeOrdinal,
} from "./taxonomy";

// search_query is auxiliary (used by L2 embedding), kept off the contract type.
export type ExtractionResult = Layer1Mechanisms & { search_query: string };

// ── The response schema, built from the code-owned enums ──
// Enums are spread into fresh mutable arrays (the SDK types reject readonly).
const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    policy_summary: { type: Type.STRING, description: "One-sentence plain summary." },
    sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
    levers: {
      type: Type.ARRAY,
      description: "Mechanisms by which the policy changes land cover / emissions. Surface non-obvious economic levers (zoning, fire-suppression budgets, ag subsidies).",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING, enum: [...LEVER_TYPES], description: "Classify into this fixed taxonomy; do NOT invent a type." },
          non_obvious: { type: Type.BOOLEAN, description: "True for hidden/economic levers that only indirectly affect climate." },
          source_span: { type: Type.STRING, description: "MANDATORY short verbatim quote from the policy text that evidences this lever." },
          confidence: { type: Type.STRING, enum: [...CONFIDENCE_ENUM] },
        },
        required: ["name", "type", "non_obvious", "source_span", "confidence"],
      },
    },
    geography: {
      type: Type.OBJECT,
      properties: {
        region_query: { type: Type.STRING, description: "Geocodable place, e.g. 'Pará, Brazil'." },
        scope: { type: Type.STRING, enum: ["local", "subnational", "national", "supranational"] },
      },
      required: ["region_query", "scope"],
    },
    timescale: {
      type: Type.OBJECT,
      properties: {
        enacted_year: { type: Type.INTEGER, description: "Year enacted, or 0 if the policy is proposed / unknown." },
        horizon_years: { type: Type.ARRAY, items: { type: Type.INTEGER } },
      },
      required: ["enacted_year", "horizon_years"],
    },
    domain_routing: {
      type: Type.OBJECT,
      properties: {
        land_cover: { type: Type.BOOLEAN },
        air_quality: { type: Type.BOOLEAN },
      },
      required: ["land_cover", "air_quality"],
    },
    categories: {
      type: Type.ARRAY,
      description: "Relevant ESA WorldCover land-cover classes this policy is expected to change.",
      items: {
        type: Type.OBJECT,
        properties: {
          worldcover_class: { type: Type.STRING, enum: [...WORLDCOVER_CLASSES] },
          change_direction: { type: Type.STRING, enum: [...CHANGE_DIRECTION] },
          change_magnitude_ordinal: {
            type: Type.STRING,
            enum: [...CHANGE_MAGNITUDE_ORDINAL],
            description: "Ordinal ONLY — never a number/percent.",
          },
          source_span: { type: Type.STRING, description: "MANDATORY short verbatim quote evidencing this category change." },
        },
        required: ["worldcover_class", "change_direction", "change_magnitude_ordinal", "source_span"],
      },
    },
    search_query: {
      type: Type.STRING,
      description: "A dense description of this policy's MECHANISMS (not its outcome), used to retrieve analogous enacted policies via vector search.",
    },
  },
  required: [
    "policy_summary",
    "sectors",
    "levers",
    "geography",
    "timescale",
    "domain_routing",
    "categories",
    "search_query",
  ],
} as const;

// Raw (pre-validation) shape as Gemini returns it.
type RawExtraction = {
  policy_summary?: string;
  sectors?: string[];
  levers?: Array<Partial<Lever>>;
  geography?: { region_query?: string; scope?: string };
  timescale?: { enacted_year?: number; horizon_years?: number[] };
  domain_routing?: { land_cover?: boolean; air_quality?: boolean };
  categories?: Array<{ worldcover_class?: string; change_direction?: string; change_magnitude_ordinal?: string; source_span?: string }>;
  search_query?: string;
};

// ── Case-insensitive enum coercion (validators; plan.md L193) ──
function coerce<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const hit = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase());
  return hit ?? null;
}

// A lever with an unknown type or a missing source-span is exactly the invented,
// unleashed mechanism we want to reject — drop it rather than trust it.
function validateLevers(raw: Array<Partial<Lever>> | undefined): { levers: Lever[]; dropped: number } {
  let dropped = 0;
  const levers: Lever[] = [];
  for (const l of raw ?? []) {
    const type = coerce<LeverType>(l.type, LEVER_TYPES);
    const confidence = coerce<ConfidenceEnum>(l.confidence, CONFIDENCE_ENUM) ?? "low";
    const span = typeof l.source_span === "string" ? l.source_span.trim() : "";
    if (!type || !l.name || span.length < 3) {
      dropped++;
      continue;
    }
    levers.push({ name: String(l.name), type, non_obvious: Boolean(l.non_obvious), source_span: span, confidence });
  }
  return { levers, dropped };
}

function validateCategories(raw: RawExtraction["categories"]): { categories: MechanismCategory[]; dropped: number } {
  let dropped = 0;
  const categories: MechanismCategory[] = [];
  for (const c of raw ?? []) {
    const cls = coerce<WorldCoverClass>(c.worldcover_class, WORLDCOVER_CLASSES);
    if (!cls) {
      dropped++;
      continue;
    }
    categories.push({
      worldcover_class: cls,
      code: WORLDCOVER[cls].code, // filled in code, never trusted from the model
      change_direction: coerce<ChangeDirection>(c.change_direction, CHANGE_DIRECTION) ?? "unknown",
      change_magnitude_ordinal: coerce<ChangeMagnitudeOrdinal>(c.change_magnitude_ordinal, CHANGE_MAGNITUDE_ORDINAL) ?? "unknown",
      source_span: typeof c.source_span === "string" ? c.source_span.trim() : "",
      worldcover_to_ipcc: worldcoverToIpcc(cls),
    });
  }
  return { categories, dropped };
}

export class ExtractionError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

const BASE_INSTRUCTION = `Extract the environmental mechanisms of this policy. Surface non-obvious economic levers (zoning, fire-suppression budgets, agricultural subsidies) that indirectly affect the climate. Emit interpretation ONLY — never invent baseline numbers, percentages, rates, or float magnitudes; use the ordinal magnitude enum. Every lever and category MUST carry a short verbatim source_span quoted from the policy text.`;

// finishReason values that mean "do not trust the parse" (plan.md L194).
function checkFinishReason(resp: { candidates?: Array<{ finishReason?: string }> }): string {
  const fr = resp.candidates?.[0]?.finishReason ?? "STOP";
  return fr;
}

async function callGemini(policyText: string, opts: { paraphrase: boolean }): Promise<{ raw: RawExtraction; finishReason: string; resp: unknown }> {
  const spanRule = opts.paraphrase
    ? " Keep every source_span VERY short (<=8 words) to avoid reproducing the text verbatim."
    : "";
  const resp = await gemini().models.generateContent({
    model: MODELS.extract,
    contents: `${BASE_INSTRUCTION}${spanRule}\n\nPOLICY:\n${policyText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
      temperature: opts.paraphrase ? 0 : 0.2,
      maxOutputTokens: 4096,
    },
  });
  const finishReason = checkFinishReason(resp as { candidates?: Array<{ finishReason?: string }> });
  let raw: RawExtraction = {};
  try {
    raw = JSON.parse(resp.text ?? "{}") as RawExtraction;
  } catch {
    // leave raw empty; caller decides based on finishReason
  }
  return { raw, finishReason, resp };
}

/**
 * Extract mechanisms with finishReason branching + a single RECITATION/SAFETY
 * retry that shortens source-spans (verbatim quotes can trip RECITATION).
 * Never returns a silently-malformed struct — throws ExtractionError instead.
 */
export async function extractMechanisms(
  policyText: string,
  policySource: string,
  usages: Usage[],
): Promise<ExtractionResult> {
  let { raw, finishReason, resp } = await callGemini(policyText, { paraphrase: false });
  usages.push(usageOf(MODELS.extract, resp as Parameters<typeof usageOf>[1]));

  // RECITATION/SAFETY block, or an empty parse -> one retry with shorter spans.
  const blocked = finishReason === "RECITATION" || finishReason === "SAFETY";
  if (blocked || !raw.levers) {
    const retry = await callGemini(policyText, { paraphrase: true });
    usages.push(usageOf(MODELS.extract, retry.resp as Parameters<typeof usageOf>[1]));
    raw = retry.raw;
    finishReason = retry.finishReason;
    if (finishReason === "RECITATION" || finishReason === "SAFETY") {
      throw new ExtractionError(finishReason, `Gemini blocked extraction (${finishReason}) even after paraphrase retry.`);
    }
    if (finishReason === "MAX_TOKENS") {
      throw new ExtractionError("MAX_TOKENS", "Extraction hit the output-token cap; raise maxOutputTokens.");
    }
  }

  const { levers, dropped: droppedLevers } = validateLevers(raw.levers);
  const { categories, dropped: droppedCats } = validateCategories(raw.categories);

  const enacted = raw.timescale?.enacted_year;
  const scope = coerce(raw.geography?.scope, ["local", "subnational", "national", "supranational"] as const) ?? "national";

  const mechanisms: ExtractionResult = {
    policy_source: policySource,
    policy_summary: raw.policy_summary ?? "",
    sectors: Array.isArray(raw.sectors) ? raw.sectors.map(String) : [],
    levers,
    geography: { region_query: raw.geography?.region_query ?? "", scope },
    timescale: {
      enacted_year: typeof enacted === "number" && enacted > 0 ? enacted : null,
      horizon_years: raw.timescale?.horizon_years?.length ? raw.timescale.horizon_years : [3, 10, 30],
    },
    domain_routing: {
      land_cover: raw.domain_routing?.land_cover ?? true,
      air_quality: raw.domain_routing?.air_quality ?? false,
    },
    categories,
    model_stated_confidence_uncalibrated: 0,
    finish_reason: finishReason,
    search_query: raw.search_query ?? raw.policy_summary ?? policyText.slice(0, 500),
  };

  // A usable extraction must have at least one grounded lever or category.
  if (levers.length === 0 && categories.length === 0) {
    throw new ExtractionError(
      "empty_after_validation",
      `Extraction produced no valid levers/categories (dropped ${droppedLevers} levers, ${droppedCats} categories as unleashed/ungrounded).`,
    );
  }
  return mechanisms;
}
