import { createHash } from "node:crypto";
import { Type } from "@google/genai";
import { getDb, COLLECTIONS } from "./mongodb";
import { gemini, embed, usageOf, MODELS, EMBED_DIM } from "./gemini";
import {
  EDUCATION_LABELS,
  type Horizon,
  type Personalization,
  type UserProfile,
  type PolicyExtraction,
  type SatelliteEvidence,
} from "./schemas";
import { extractMechanisms, type ExtractionResult } from "./extract";
import { buildLayer4 } from "./vision";
import { callEo, eoRequestForAnalog } from "./sidecar";
import type {
  PolicyLensContract,
  Layer1Mechanisms,
  Layer2Analog,
  Layer3Observed,
  Layer3_5Counterfactual,
} from "./contract";
import { profileHash } from "./profile";
import { receiptFrom, cachedReceipt, type Usage, type CarbonReceipt } from "./greenai";

// Legacy analogue shape the existing analyzer UI renders (derived from the contract).
export type Analogue = {
  policyId: string;
  title: string;
  region: string;
  enactedYear: number;
  score: number;
  observedDelta: string;
  // "Receipts" evidence precomputed by scripts/evidence.ts (main-branch feature):
  // per-dimension before/after GIBS pairs + colormap-inverted metrics + local
  // Gemma read. Attached in analyzePolicy; absent when `observations` is unseeded.
  evidence?: SatelliteEvidence;
};

// The enriched hero-case document as stored in Mongo (seed = data/hero-cases.json).
type AnalogDoc = {
  policyId: string;
  title: string;
  region: string;
  enactedYear: number;
  domain?: "land_cover" | "air_quality";
  worldcoverClass?: string;
  bbox: [number, number, number, number];
  observableWindow: { t0: string; t1: string };
  documentedOutcome: string;
  precomputedCounterfactual: {
    avoidedLossKm2: number | null;
    ci95: [number, number] | null;
    method: string;
    cite: string;
    assumptions?: string[];
  };
  score: number;
};

// Profile-independent core, cached by input-policy hash — the Green-AI story.
export type AnalysisCore = {
  inputHash: string;
  contract: PolicyLensContract;
  receipt: CarbonReceipt;
  createdAt: string;
};

// What the API returns: the full contract + legacy convenience fields for the
// current UI + this reader's tailored output.
export type AnalysisResult = AnalysisCore & {
  personalization: Personalization;
  role: UserProfile["role"];
  extraction: PolicyExtraction; // legacy, derived from contract.layer1_mechanisms
  analogues: Analogue[]; // legacy, derived from contract.layer2_analogs
  horizons: Horizon[]; // legacy, derived from contract.layer4_impact.horizons
};

function hashPolicy(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 16);
}

// ── L2: retrieve enriched analogs (MongoDB Atlas Vector Search) ──
async function findAnalogs(searchQuery: string, usages: Usage[]): Promise<AnalogDoc[]> {
  const db = await getDb();
  const queryVector = await embed(searchQuery);
  usages.push({ model: MODELS.embed, promptTokens: Math.ceil(searchQuery.length / 4), outputTokens: 0 });

  const docs = await db
    .collection(COLLECTIONS.policies)
    .aggregate([
      { $vectorSearch: { index: "policy_vector_index", path: "embedding", queryVector, numCandidates: 100, limit: 5 } },
      {
        $project: {
          _id: 0,
          policyId: 1,
          title: 1,
          region: 1,
          enactedYear: 1,
          domain: 1,
          worldcoverClass: 1,
          bbox: 1,
          observableWindow: 1,
          documentedOutcome: 1,
          precomputedCounterfactual: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  return docs as AnalogDoc[];
}

// ── L2 re-rank: Gemini verifies mechanism/context match, kills false analogs ──
// It may reject/flag but must NEVER assert the analog's outcome (plan.md L209).
const RERANK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rankings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          analog_id: { type: Type.STRING },
          verdict: { type: Type.STRING, enum: ["comparable_mechanism", "weak_analog", "rejected"] },
          reason: { type: Type.STRING, description: "Same causal lever + comparable context (biome/economy/scale)? Do NOT state outcomes." },
        },
        required: ["analog_id", "verdict", "reason"],
      },
    },
  },
  required: ["rankings"],
} as const;

type Verdict = { verdict: Layer2Analog["rerank_verdict"]; reason: string };

async function rerankAnalogs(
  extraction: ExtractionResult,
  docs: AnalogDoc[],
  usages: Usage[],
): Promise<Map<string, Verdict>> {
  const candidates = docs.map((d) => ({ analog_id: d.policyId, title: d.title, region: d.region, mechanisms: d.documentedOutcome }));
  const prompt = `Judge whether each candidate enacted policy is a genuine analog for the target policy: same CAUSAL MECHANISM and comparable CONTEXT (biome, economy, scale). Reject textually-similar but mechanistically-different matches (e.g. a temperate law for a tropical case). Do NOT assert what any analog achieved.

TARGET POLICY MECHANISMS:
${JSON.stringify({ summary: extraction.policy_summary, levers: extraction.levers, sectors: extraction.sectors, geography: extraction.geography }, null, 2)}

CANDIDATES:
${JSON.stringify(candidates, null, 2)}`;

  const resp = await gemini().models.generateContent({
    model: MODELS.extract,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: RERANK_SCHEMA, temperature: 0 },
  });
  usages.push(usageOf(MODELS.extract, resp));
  const parsed = JSON.parse(resp.text ?? "{}") as { rankings?: Array<{ analog_id: string; verdict: Verdict["verdict"]; reason: string }> };
  const map = new Map<string, Verdict>();
  for (const r of parsed.rankings ?? []) map.set(r.analog_id, { verdict: r.verdict, reason: r.reason });
  return map;
}

function docToAnalog(doc: AnalogDoc, v?: Verdict): Layer2Analog {
  return {
    analog_id: doc.policyId,
    title: doc.title,
    similarity: Math.round(doc.score * 1000) / 1000,
    rerank_verdict: v?.verdict ?? "unranked",
    rerank_reason: v?.reason,
    region: { name: doc.region, bbox: doc.bbox, geometry_ref: "bbox" },
    enacted_year: doc.enactedYear,
    observable_window: `${doc.observableWindow.t0} vs ${doc.observableWindow.t1}`,
    documented_outcome: doc.documentedOutcome,
    precomputed_counterfactual: {
      avoided_loss_km2: doc.precomputedCounterfactual?.avoidedLossKm2 ?? null,
      ci95: doc.precomputedCounterfactual?.ci95 ?? null,
      method: doc.precomputedCounterfactual?.method ?? "",
      cite: doc.precomputedCounterfactual?.cite ?? "",
    },
    domain: doc.domain ?? "land_cover",
  };
}

// ── L3.5: precomputed hero-case counterfactual [MODELED] ──
function buildCounterfactual(doc: AnalogDoc): Layer3_5Counterfactual {
  const pc = doc.precomputedCounterfactual;
  return {
    source: "precomputed_hero_case",
    method: pc?.method ?? "",
    avoided_loss_km2: pc?.avoidedLossKm2 ?? null,
    ci95: pc?.ci95 ?? null,
    placebo_p: null,
    assumptions: pc?.assumptions ?? [],
    fallback_used: false,
    cite: pc?.cite ?? "",
    PROVENANCE_TAG: "MODELED",
  };
}

// A Layer3Observed placeholder when the sidecar is unreachable — keeps the
// contract shape valid; the demo continues without imagery (plan.md L374).
function emptyObserved(reason: string): Layer3Observed {
  return {
    land_cover: {
      imagery: null,
      ndvi_mean_t0: null,
      ndvi_mean_t1: null,
      ndvi_delta: null,
      nbr_delta: null,
      changed_area_fraction: null,
      PROVENANCE_TAG: "OBSERVED",
      flags: [reason],
    },
    fire: { firms_fire_count_t0: null, firms_fire_count_t1: null, firms_fire_count_delta: null, firms_frp_sum_delta: null, PROVENANCE_TAG: "OBSERVED" },
    air_quality: { s5p_no2_delta_pct: null, aerosol_index_delta: null, openaq_pm25_crosscheck: null, PROVENANCE_TAG: "OBSERVED" },
  };
}

function extractionToLayer1(extraction: ExtractionResult): Layer1Mechanisms {
  // Layer1Mechanisms is ExtractionResult minus the auxiliary search_query.
  const { search_query: _sq, ...layer1 } = extraction;
  return layer1;
}

// ── Core orchestrator: full pipeline -> the data contract, cache-first ──
async function analyzeCore(policyText: string, policySource: string, usages: Usage[]): Promise<AnalysisCore> {
  const inputHash = hashPolicy(policyText);
  const db = await getDb();

  const cached = await db.collection<AnalysisCore>(COLLECTIONS.analyses).findOne({ inputHash }, { projection: { _id: 0 } });
  if (cached && cached.contract) return cached; // no marginal cost — reflected in the receipt

  // L1 — extraction (mechanisms + levers + WorldCover categories, validated)
  const extraction = await extractMechanisms(policyText, policySource, usages);

  // L2 — enriched retrieval + Gemini re-rank
  const docs = await findAnalogs(extraction.search_query, usages);
  const verdicts = docs.length > 1 ? await rerankAnalogs(extraction, docs, usages) : new Map<string, Verdict>();
  const byId = new Map(docs.map((d) => [d.policyId, d]));
  const analogs = docs.map((d) => docToAnalog(d, verdicts.get(d.policyId)));

  // Primary analog = first not rejected by the re-ranker (else top vector hit).
  const primaryAnalog = analogs.find((a) => a.rerank_verdict !== "rejected") ?? analogs[0];
  const primaryDoc = primaryAnalog ? byId.get(primaryAnalog.analog_id) : undefined;

  // L2.5 + L3 — real EO via the sidecar (soft-fails to imagery-less contract)
  let observed: Layer3Observed | null = null;
  let geometry: PolicyLensContract["layer2_5_geometry"] = null;
  if (primaryAnalog && primaryDoc) {
    const eo = await callEo(eoRequestForAnalog(primaryAnalog, primaryDoc.observableWindow));
    if (eo) {
      observed = eo.layer3_observed;
      geometry = eo.layer2_5_geometry;
    }
  }

  // L3.5 — precomputed counterfactual from the primary analog
  const counterfactual = primaryDoc ? buildCounterfactual(primaryDoc) : null;

  // L4 — Gemini vision corroboration + three-horizon report
  const observedForL4 = observed ?? emptyObserved("sidecar_unavailable");
  const cite = primaryAnalog?.precomputed_counterfactual.cite || null;
  const layer4 = await buildLayer4(extraction, analogs, observedForL4, cite, usages);

  const contract: PolicyLensContract = {
    layer1_mechanisms: extractionToLayer1(extraction),
    layer2_analogs: analogs,
    layer2_5_geometry: geometry,
    layer3_observed: observed,
    layer3_5_counterfactual: counterfactual,
    layer4_impact: layer4,
  };

  const core: AnalysisCore = { inputHash, contract, receipt: receiptFrom(usages), createdAt: new Date().toISOString() };
  await db.collection(COLLECTIONS.analyses).insertOne({ ...core });
  return core;
}

// ── Derive the legacy fields the current analyzer UI renders ──
const SCOPE_MAP: Record<string, PolicyExtraction["geography"]["scope"]> = {
  local: "local",
  subnational: "regional",
  national: "national",
  supranational: "supranational",
};

function deriveLegacy(contract: PolicyLensContract): {
  extraction: PolicyExtraction;
  analogues: Analogue[];
  horizons: Horizon[];
} {
  const l1 = contract.layer1_mechanisms;
  const title = (l1.policy_summary || l1.sectors[0] || "Policy").split(/\s+/).slice(0, 8).join(" ");
  const extraction: PolicyExtraction = {
    title,
    summary: l1.policy_summary,
    sectors: l1.sectors,
    levers: l1.levers.map((lv) => ({ mechanism: lv.name, obvious: !lv.non_obvious, direction: "ambiguous" })),
    geography: { scope: SCOPE_MAP[l1.geography.scope] ?? "national", regions: l1.geography.region_query ? [l1.geography.region_query] : [] },
    timescale: "years",
    searchQuery: "",
  };
  const analogues: Analogue[] = contract.layer2_analogs.map((a) => ({
    policyId: a.analog_id,
    title: a.title ?? a.analog_id,
    region: a.region.name,
    enactedYear: a.enacted_year,
    score: a.similarity,
    observedDelta: a.documented_outcome,
  }));
  const h = contract.layer4_impact?.horizons;
  const horizons: Horizon[] = h
    ? [
        { years: 3, label: "observed", assessment: h["3y"].summary },
        { years: 10, label: "extrapolated", assessment: h["5_10y"].summary },
        { years: 30, label: "speculative", assessment: h["30y"].summary },
      ]
    : [];
  return { extraction, analogues, horizons };
}


// The reader's reading level governs LANGUAGE for both outputs; Simple vs
// Detailed governs DEPTH. Picking "explain it like I'm five" must therefore
// make the detailed view kid-readable too — more ground covered, same words.
// Bump when the personalization prompt changes, so cached output from an older
// prompt isn't served forever (the key is otherwise only policy + profile).
const PROMPT_VERSION = "v2-reading-level";

const LEVEL_GUIDE: Record<string, string> = {
  elementary: `Write for a five-year-old, and mean it.
  - Sentences under about 10 words. Common words only.
  - No percentages, no units, no dates, no decimals, no jargon.
  - Say "grown-ups made a new rule", not "the government enacted a policy".
  - Explain by comparing to things a small child knows: campfire smoke, a hot
    playground, puddles after rain, plants going brown when nobody waters them.
  - You may say "we looked at pictures taken from space".
  - Never use: emissions, policy, index, data, instrument names, degrees,
    hectares, confidence, estimate, projection.`,
  high_school: `Write for a bright 15-year-old: short plain sentences, everyday
  words, define any term you must use, round numbers rather than decimals.`,
  undergraduate: `Write for an educated non-specialist: plain professional prose,
  technical terms allowed if defined once, real numbers with units.`,
  graduate: `Write for a domain expert: precise terminology, exact values with
  units and instruments, explicit uncertainty and confounds.`,
};

// ── Personalization (unchanged intent; fed from the derived legacy evidence) ──
const PERSONALIZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simple: {
      type: Type.STRING,
      description:
        "The single most important consequence, 2-4 sentences, written at the reader stated reading level.",
    },
    briefing: {
      type: Type.STRING,
      description:
        "Covers far more ground than simple — cause-and-effect chain, what was measured and how, confidence in each part, and what might be wrong — but at the SAME reading level as simple, never a more technical register.",
    },
    local: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING },
        headline: { type: Type.STRING, description: "One visceral local number for THIS location, e.g. '≈ +6 smoke days/year in NYC within 3 years'." },
        pathway: { type: Type.STRING, description: "How the distant policy reaches this location: winds, watershed, trade, migration, markets." },
        reachesReader: { type: Type.BOOLEAN, description: "False only if the reader's location is genuinely outside any plausible reach." },
      },
      required: ["location", "headline", "pathway", "reachesReader"],
    },
  },
  required: ["simple", "briefing", "local"],
} as const;

async function personalizeFor(
  legacy: { extraction: PolicyExtraction; analogues: Analogue[]; horizons: Horizon[] },
  profile: Pick<UserProfile, "role" | "location" | "education">,
  usages: Usage[],
): Promise<Personalization> {
  const model = MODELS.synth;
  const prompt = `Turn this grounded policy analysis into output tailored to one specific reader.

ANALYSIS (already grounded in observed satellite precedent):
${JSON.stringify(legacy, null, 2)}

READER:
- Role: ${profile.role} (${profile.role === "lawmaker" ? "lead with mechanisms, confidence, citations" : "lead with what it means for daily life"})
- Reading level: ${EDUCATION_LABELS[profile.education]}
- Location: ${profile.location}

Core idea — "Downwind": a policy enacted ANYWHERE can reach this reader through the
atmosphere, watersheds, trade, or migration. Reason explicitly about the physical/
economic pathway from the affected regions to ${profile.location}, and only set
reachesReader=false if there is genuinely no plausible pathway.

Produce, in one pass, THREE outputs.

READING LEVEL — binds BOTH "simple" and "briefing", without exception:
"${EDUCATION_LABELS[profile.education]}"
${LEVEL_GUIDE[profile.education] ?? LEVEL_GUIDE.high_school}

"simple" and "briefing" must differ in DEPTH AND COVERAGE ONLY — never in
reading level. If the reader asked to have it explained like they are five, the
detailed version is still explained like they are five; it simply covers more
ground. Do not switch to an analyst register for "briefing".

1. "simple" — the single most important thing that happens, in 2-4 sentences.
   Lead with what changes for the reader, not with the policy. One number at
   most, and only if a person can picture it.

2. "briefing" — covers much more ground than "simple", still at the reading
   level above: the chain of cause and effect step by step, what was actually
   measured and how we looked, how sure we are about each part, and what might
   be wrong or missing. Longer and more thorough — not more technical-sounding.

3. "local": the impact grounded in ${profile.location} — a visceral headline, the
   downwind pathway, and whether it reaches the reader.

If the analysis shows the policy IMPROVES conditions, say so just as clearly as
harm — do not force a negative framing.
Never invent precise numbers you cannot ground in the analogues; prefer ranges and state uncertainty.`;

  const resp = await gemini().models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: PERSONALIZE_SCHEMA },
  });
  usages.push(usageOf(model, resp));
  return JSON.parse(resp.text ?? "{}") as Personalization;
}

// ── Public entry point ──
export async function analyzePolicy(
  policyText: string,
  profile: Pick<UserProfile, "role" | "location" | "education">,
): Promise<AnalysisResult> {
  const usages: Usage[] = [];
  const db = await getDb();

  const core = await analyzeCore(policyText, "user_paste", usages);
  const legacy = deriveLegacy(core.contract);

  // Join the precomputed satellite "Receipts" (before/after GIBS pairs +
  // colormap-inverted metrics + local Gemma read) cached in `observations` by
  // scripts/evidence.ts. Best-effort: missing evidence just omits the panel.
  const analogIds = legacy.analogues.map((a) => a.policyId);
  if (analogIds.length) {
    const evidence = await db
      .collection<SatelliteEvidence>(COLLECTIONS.observations)
      .find({ policyId: { $in: analogIds } }, { projection: { _id: 0 } })
      .toArray();
    const byId = new Map(evidence.map((e) => [e.policyId, e]));
    for (const a of legacy.analogues) a.evidence = byId.get(a.policyId);
  }

  const persoKey = `${core.inputHash}:${profileHash(profile)}:${PROMPT_VERSION}`;
  const cachedPerso = await db
    .collection<{ key: string; personalization: Personalization }>(COLLECTIONS.personalizations)
    .findOne({ key: persoKey }, { projection: { _id: 0 } });

  let personalization: Personalization;
  if (cachedPerso) {
    personalization = cachedPerso.personalization;
  } else {
    personalization = await personalizeFor(legacy, profile, usages);
    await db.collection(COLLECTIONS.personalizations).insertOne({ key: persoKey, personalization, createdAt: new Date().toISOString() });
  }

  const receipt = usages.length === 0 ? cachedReceipt(core.receipt) : receiptFrom(usages);
  return { ...core, receipt, personalization, role: profile.role, ...legacy };
}

export { EMBED_DIM };
