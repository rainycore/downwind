import { createHash } from "node:crypto";
import { Type } from "@google/genai";
import { getDb, COLLECTIONS } from "./mongodb";
import { gemini, embed, usageOf, MODELS, EMBED_DIM } from "./gemini";
import {
  POLICY_EXTRACTION_SCHEMA,
  EDUCATION_LABELS,
  type PolicyExtraction,
  type Horizon,
  type Personalization,
  type UserProfile,
} from "./schemas";
import { profileHash } from "./profile";
import { receiptFrom, cachedReceipt, type Usage, type CarbonReceipt } from "./greenai";

export type Analogue = {
  policyId: string;
  title: string;
  region: string;
  enactedYear: number;
  score: number;
  observedDelta: string; // human summary of the satellite-observed change
};

// Profile-independent core of an analysis. Cached by input-policy hash so the
// expensive extraction/retrieval/synthesis is paid once and reused for every
// reader — the Green-AI story.
export type AnalysisCore = {
  inputHash: string;
  extraction: PolicyExtraction;
  analogues: Analogue[];
  horizons: Horizon[];
  receipt: CarbonReceipt;
  createdAt: string;
};

// What the API returns: the core, tailored to one reader, plus a receipt that
// reflects only the work that actually ran for THIS request.
export type AnalysisResult = AnalysisCore & {
  personalization: Personalization;
  role: UserProfile["role"]; // lets the client pick which mode leads
};

function hashPolicy(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 16);
}

// ── Step 1: extract mechanisms (cheap model, structured output) ──
async function extractMechanisms(policyText: string, usages: Usage[]): Promise<PolicyExtraction> {
  const resp = await gemini().models.generateContent({
    model: MODELS.extract,
    contents: `Extract the environmental mechanisms of this policy. Surface non-obvious economic levers that indirectly affect the climate.\n\nPOLICY:\n${policyText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: POLICY_EXTRACTION_SCHEMA,
    },
  });
  usages.push(usageOf(MODELS.extract, resp));
  return JSON.parse(resp.text ?? "{}") as PolicyExtraction;
}

// ── Step 2: vector search for analogous enacted policies (MongoDB Atlas) ──
async function findAnalogues(extraction: PolicyExtraction, usages: Usage[]): Promise<Analogue[]> {
  const db = await getDb();
  const queryVector = await embed(extraction.searchQuery);
  // Embedding calls don't report token usage the same way; approximate.
  usages.push({ model: MODELS.embed, promptTokens: Math.ceil(extraction.searchQuery.length / 4), outputTokens: 0 });

  const docs = await db
    .collection(COLLECTIONS.policies)
    .aggregate([
      {
        $vectorSearch: {
          index: "policy_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 100,
          limit: 5,
        },
      },
      {
        $project: {
          _id: 0,
          policyId: "$policyId",
          title: 1,
          region: 1,
          enactedYear: 1,
          observedDelta: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();

  return docs as Analogue[];
}

// ── Step 3: synthesize grounded impact across three honest horizons ──
const HORIZON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
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
  },
  required: ["horizons"],
} as const;

async function synthesize(
  extraction: PolicyExtraction,
  analogues: Analogue[],
  usages: Usage[],
): Promise<Horizon[]> {
  const model = MODELS.synth;
  const prompt = `You are grounding a policy-impact assessment in OBSERVED satellite precedent, not forecasting from scratch.

POLICY MECHANISMS:
${JSON.stringify(extraction, null, 2)}

OBSERVED ANALOGUES (real satellite-measured outcomes of similar enacted policies):
${JSON.stringify(analogues, null, 2)}

Produce three horizons with honest epistemic labels:
- 3 years -> "observed": grounded directly in the analogues' measured deltas.
- 10 years -> "extrapolated": trend extrapolation from the analogues.
- 30 years -> "speculative": scenario narrative, explicitly uncertain.
Never invent precise numbers you cannot ground; prefer ranges and state uncertainty.`;

  const resp = await gemini().models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: HORIZON_SCHEMA },
  });
  usages.push(usageOf(model, resp));
  const parsed = JSON.parse(resp.text ?? "{}") as { horizons?: Horizon[] };
  return parsed.horizons ?? [];
}

// ── Step 4: personalize for one reader (location-aware, dual output) ──
// This is the "Downwind" thesis: a policy enacted anywhere can reach the reader
// on the wind, water, or trade. We ground impact where they actually live and
// render both a lawmaker briefing and a plain-language TL;DR in a single pass.
const PERSONALIZE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simple: {
      type: Type.STRING,
      description: "Plain-language TL;DR written at the reader's reading level. No jargon.",
    },
    briefing: {
      type: Type.STRING,
      description: "Technical briefing: mechanisms, confidence, and which analogue/dataset grounds each claim.",
    },
    local: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING },
        headline: {
          type: Type.STRING,
          description: "One visceral local number for THIS location, e.g. '≈ +6 smoke days/year in NYC within 3 years'.",
        },
        pathway: {
          type: Type.STRING,
          description: "How the distant policy reaches this location: prevailing winds, watershed, trade, migration, markets.",
        },
        reachesReader: {
          type: Type.BOOLEAN,
          description: "False only if the reader's location is genuinely outside any plausible reach of this policy's effects.",
        },
      },
      required: ["location", "headline", "pathway", "reachesReader"],
    },
  },
  required: ["simple", "briefing", "local"],
} as const;

async function personalizeFor(
  core: AnalysisCore,
  profile: Pick<UserProfile, "role" | "location" | "education">,
  usages: Usage[],
): Promise<Personalization> {
  const model = MODELS.synth;
  const prompt = `Turn this grounded policy analysis into output tailored to one specific reader.

ANALYSIS (already grounded in observed satellite precedent):
${JSON.stringify({ extraction: core.extraction, analogues: core.analogues, horizons: core.horizons }, null, 2)}

READER:
- Role: ${profile.role} (${profile.role === "lawmaker" ? "lead with mechanisms, confidence, citations" : "lead with what it means for daily life"})
- Reading level: ${EDUCATION_LABELS[profile.education]}
- Location: ${profile.location}

Core idea — "Downwind": a policy enacted ANYWHERE can reach this reader through the
atmosphere, watersheds, trade, or migration. Toronto's wildfire smoke drifted into
New York City. Do NOT assume the reader is unaffected just because the policy is
elsewhere. Reason explicitly about the physical/economic pathway from the affected
regions to ${profile.location}, and only set reachesReader=false if there is
genuinely no plausible pathway.

Produce, from this same analysis in one pass:
1. "simple": a TL;DR at the reader's reading level ("${EDUCATION_LABELS[profile.education]}").
2. "briefing": a technical briefing with mechanisms, confidence, and which analogue/dataset grounds each claim.
3. "local": the impact grounded in ${profile.location} — a visceral headline number, the downwind pathway, and whether it reaches the reader.
Never invent precise numbers you cannot ground in the analogues; prefer ranges and state uncertainty.`;

  const resp = await gemini().models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: PERSONALIZE_SCHEMA },
  });
  usages.push(usageOf(model, resp));
  return JSON.parse(resp.text ?? "{}") as Personalization;
}

// ── Core orchestrator: cache-first profile-independent analysis ──
async function analyzeCore(policyText: string, usages: Usage[]): Promise<AnalysisCore> {
  const inputHash = hashPolicy(policyText);
  const db = await getDb();

  const cached = await db.collection<AnalysisCore>(COLLECTIONS.analyses).findOne(
    { inputHash },
    { projection: { _id: 0 } },
  );
  if (cached) return cached; // no marginal cost — reflected in the receipt below

  const extraction = await extractMechanisms(policyText, usages);
  const analogues = await findAnalogues(extraction, usages);
  const horizons = await synthesize(extraction, analogues, usages);

  const core: AnalysisCore = {
    inputHash,
    extraction,
    analogues,
    horizons,
    receipt: receiptFrom(usages), // cost of building the core, stored for provenance
    createdAt: new Date().toISOString(),
  };
  await db.collection(COLLECTIONS.analyses).insertOne({ ...core });
  return core;
}

// ── Public entry point: analyze a policy for a specific reader ──
export async function analyzePolicy(
  policyText: string,
  profile: Pick<UserProfile, "role" | "location" | "education">,
): Promise<AnalysisResult> {
  const usages: Usage[] = []; // only work that actually RUNS this request lands here
  const db = await getDb();

  const core = await analyzeCore(policyText, usages);

  // Personalization cache key mixes the policy with the tailoring inputs, so
  // two readers in different places never see each other's tailored text.
  const persoKey = `${core.inputHash}:${profileHash(profile)}`;
  const cachedPerso = await db
    .collection<{ key: string; personalization: Personalization }>(COLLECTIONS.personalizations)
    .findOne({ key: persoKey }, { projection: { _id: 0 } });

  let personalization: Personalization;
  if (cachedPerso) {
    personalization = cachedPerso.personalization;
  } else {
    personalization = await personalizeFor(core, profile, usages);
    await db
      .collection(COLLECTIONS.personalizations)
      .insertOne({ key: persoKey, personalization, createdAt: new Date().toISOString() });
  }

  // Receipt reflects THIS request: if nothing ran, it was a full cache hit.
  const receipt = usages.length === 0 ? cachedReceipt(core.receipt) : receiptFrom(usages);

  return { ...core, receipt, personalization, role: profile.role };
}

export { EMBED_DIM };
