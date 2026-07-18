import { createHash } from "node:crypto";
import { getDb, COLLECTIONS } from "./mongodb";
import { gemini, embed, usageOf, MODELS } from "./gemini";
import {
  POLICY_EXTRACTION_SCHEMA,
  SYNTHESIS_SCHEMA,
  type PolicyExtraction,
  type SynthesisOutput,
  type Horizon,
  type DimensionImpact,
} from "./schemas";
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
  dimensions: DimensionImpact[];
  horizons: Horizon[];
  localTranslation: string;
  briefing: string; // lawmaker mode
  simple: string; // five-year-old mode
  agreement: number; // 0..1 self-consistency across runs (1 = single run)
  receipt: CarbonReceipt;
  createdAt: string;
};

// Self-consistency: run synthesis N times and surface variance. Costs N× the
// synth step, so keep it small; default 1 for cheap demos, bump to 3 on stage.
const CONSISTENCY_RUNS = Math.max(1, Number(process.env.CONSISTENCY_RUNS ?? "1"));

function hashPolicy(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 16);
}

// ── Step 1: screen + extract mechanisms (cheap model, structured output) ──
async function extractMechanisms(policyText: string, usages: Usage[]): Promise<PolicyExtraction> {
  const resp = await gemini().models.generateContent({
    model: MODELS.extract,
    contents: `Screen this policy against the climate-lever taxonomy. NO bill is assumed climate-neutral until checked — a highway bill is an emissions bill, a zoning reform is a heat bill, a farm subsidy is a land-use bill. Surface the hidden economic levers.\n\nPOLICY:\n${policyText}`,
    config: { responseMimeType: "application/json", responseSchema: POLICY_EXTRACTION_SCHEMA },
  });
  usages.push(usageOf(MODELS.extract, resp));
  return JSON.parse(resp.text ?? "{}") as PolicyExtraction;
}

// ── Step 2: vector search for analogous enacted policies (MongoDB Atlas) ──
async function findAnalogues(extraction: PolicyExtraction, usages: Usage[]): Promise<Analogue[]> {
  const db = await getDb();
  const queryVector = await embed(extraction.searchQuery);
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

// ── Step 3: synthesize the impact surface + dual output ──
// Runs once; the orchestrator may call it N times for self-consistency.
async function synthesizeOnce(
  extraction: PolicyExtraction,
  analogues: Analogue[],
  usages: Usage[],
): Promise<SynthesisOutput> {
  const prompt = `You are grounding a policy-impact assessment in OBSERVED satellite precedent, not forecasting from scratch.

POLICY (screened mechanisms):
${JSON.stringify(extraction, null, 2)}

OBSERVED ANALOGUES (satellite-measured outcomes of similar enacted policies):
${JSON.stringify(analogues, null, 2)}

Report across the full climate surface (air quality, extreme heat, vegetation/land cover, flood/drought, emissions, water), each grounded in the analogues' observables and labelled by confidence:
- observed  -> directly measured in the analogues (~3y horizon)
- extrapolated -> trend from the analogues (~10y horizon)
- speculative -> scenario narrative (~30y), explicitly uncertain
Give three horizons (3/10/30y) and a visceral local metric (smoke days / extreme-heat days per year in Toronto).
Finally, write the SAME conclusion twice: a "briefing" for lawmakers (mechanisms, confidence, citations) and a "simple" TL;DR a five-year-old follows.
Never invent precise numbers you cannot ground; prefer ranges and state uncertainty.`;

  const resp = await gemini().models.generateContent({
    model: MODELS.synth,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: SYNTHESIS_SCHEMA },
  });
  usages.push(usageOf(MODELS.synth, resp));
  return JSON.parse(resp.text ?? "{}") as SynthesisOutput;
}

// Agreement = fraction of dimensions whose `direction` is the modal value
// across runs, averaged over dimensions. 1.0 for a single run.
function agreementOf(runs: SynthesisOutput[]): number {
  if (runs.length < 2) return 1;
  const keys = runs[0].dimensions?.map((d) => d.key) ?? [];
  if (keys.length === 0) return 1;
  let sum = 0;
  for (const key of keys) {
    const dirs = runs.map((r) => r.dimensions.find((d) => d.key === key)?.direction).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const d of dirs) counts[d as string] = (counts[d as string] ?? 0) + 1;
    const modal = Math.max(...Object.values(counts));
    sum += modal / runs.length;
  }
  return Math.round((sum / keys.length) * 100) / 100;
}

// ── Orchestrator: cache-first, then run the full pipeline ──
export async function analyzePolicy(policyText: string): Promise<AnalysisResult> {
  const inputHash = hashPolicy(policyText);
  const db = await getDb();

  const cached = await db.collection<AnalysisResult>(COLLECTIONS.analyses).findOne({ inputHash });
  if (cached) {
    return { ...cached, receipt: cachedReceipt(cached.receipt) };
  }

  const usages: Usage[] = [];
  const extraction = await extractMechanisms(policyText, usages);
  const analogues = await findAnalogues(extraction, usages);

  const runs: SynthesisOutput[] = [];
  for (let i = 0; i < CONSISTENCY_RUNS; i++) {
    runs.push(await synthesizeOnce(extraction, analogues, usages));
  }
  const primary = runs[0];
  const agreement = agreementOf(runs);

  const result: AnalysisResult = {
    inputHash,
    extraction,
    analogues,
    dimensions: primary.dimensions ?? [],
    horizons: primary.horizons ?? [],
    localTranslation: primary.localTranslation ?? "",
    briefing: primary.briefing ?? "",
    simple: primary.simple ?? "",
    agreement,
    receipt: receiptFrom(usages),
    createdAt: new Date().toISOString(),
  };

  await db.collection(COLLECTIONS.analyses).insertOne({ ...result });
  return result;
}
