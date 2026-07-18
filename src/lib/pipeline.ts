import { createHash } from "node:crypto";
import { Type } from "@google/genai";
import { getDb, COLLECTIONS } from "./mongodb";
import { gemini, embed, usageOf, MODELS, EMBED_DIM } from "./gemini";
import { POLICY_EXTRACTION_SCHEMA, type PolicyExtraction, type Horizon } from "./schemas";
import { receiptFrom, cachedReceipt, type Usage, type CarbonReceipt } from "./greenai";

export type Analogue = {
  policyId: string;
  title: string;
  region: string;
  enactedYear: number;
  score: number;
  observedDelta: string; // human summary of the satellite-observed change
};

export type AnalysisResult = {
  inputHash: string;
  extraction: PolicyExtraction;
  analogues: Analogue[];
  horizons: Horizon[];
  localTranslation: string; // e.g. "≈ +6 smoke days/year in Toronto"
  receipt: CarbonReceipt;
  createdAt: string;
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
    localTranslation: {
      type: Type.STRING,
      description: "Translate the projected change into a visceral local metric, e.g. smoke days/year in Toronto.",
    },
  },
  required: ["horizons", "localTranslation"],
} as const;

async function synthesize(
  extraction: PolicyExtraction,
  analogues: Analogue[],
  usages: Usage[],
): Promise<{ horizons: Horizon[]; localTranslation: string }> {
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
Then translate the near-term impact into a local metric (smoke days/year in Toronto).
Never invent precise numbers you cannot ground; prefer ranges and state uncertainty.`;

  const resp = await gemini().models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: HORIZON_SCHEMA },
  });
  usages.push(usageOf(model, resp));
  const parsed = JSON.parse(resp.text ?? "{}") as { horizons: Horizon[]; localTranslation: string };
  return { horizons: parsed.horizons ?? [], localTranslation: parsed.localTranslation ?? "" };
}

// ── Orchestrator: cache-first, then run the full pipeline ──
export async function analyzePolicy(policyText: string): Promise<AnalysisResult> {
  const inputHash = hashPolicy(policyText);
  const db = await getDb();

  // Cache hit → near-zero marginal cost, report it in the receipt.
  const cached = await db.collection<AnalysisResult>(COLLECTIONS.analyses).findOne({ inputHash });
  if (cached) {
    return { ...cached, receipt: cachedReceipt(cached.receipt) };
  }

  const usages: Usage[] = [];
  const extraction = await extractMechanisms(policyText, usages);
  const analogues = await findAnalogues(extraction, usages);
  const { horizons, localTranslation } = await synthesize(extraction, analogues, usages);

  const result: AnalysisResult = {
    inputHash,
    extraction,
    analogues,
    horizons,
    localTranslation,
    receipt: receiptFrom(usages),
    createdAt: new Date().toISOString(),
  };

  await db.collection(COLLECTIONS.analyses).insertOne({ ...result });
  return result;
}

export { EMBED_DIM };
