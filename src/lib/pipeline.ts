import { createHash } from "node:crypto";
import { getDb, COLLECTIONS } from "./mongodb";
import caseStudies from "../../data/case-studies.json";
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
  loc?: { type: "Point"; coordinates: [number, number] }; // GeoJSON — drives the precedent map
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

// ── Atlas vs. local-fallback selection ──
// When MONGODB_URI is a real connection string we use Atlas $vectorSearch and
// the result cache. Otherwise (local dev without a cluster) we run a real
// in-process vector search over the seeded case studies using live Gemini
// embeddings, and skip the cache. The Gemini pipeline is identical either way.
function mongoConfigured(): boolean {
  const uri = process.env.MONGODB_URI ?? "";
  return uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://");
}

type CaseStudy = {
  policyId: string;
  title: string;
  region: string;
  enactedYear: number;
  loc?: { type: "Point"; coordinates: [number, number] };
  text: string;
  observedDelta: string;
};

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Embed the seeded corpus once per process (mirrors seed.ts: `title\ntext`).
let _localCorpus: { doc: CaseStudy; vector: number[] }[] | null = null;
async function localCorpus(usages: Usage[]): Promise<{ doc: CaseStudy; vector: number[] }[]> {
  if (_localCorpus) return _localCorpus;
  const docs = caseStudies as unknown as CaseStudy[];
  const out: { doc: CaseStudy; vector: number[] }[] = [];
  for (const d of docs) {
    const vector = await embed(`${d.title}\n${d.text}`);
    usages.push({ model: MODELS.embed, promptTokens: Math.ceil((d.title.length + d.text.length) / 4), outputTokens: 0 });
    out.push({ doc: d, vector });
  }
  _localCorpus = out;
  return out;
}

async function localAnalogues(queryVector: number[], usages: Usage[]): Promise<Analogue[]> {
  const corpus = await localCorpus(usages);
  return corpus
    .map(({ doc, vector }) => ({
      policyId: doc.policyId,
      title: doc.title,
      region: doc.region,
      enactedYear: doc.enactedYear,
      observedDelta: doc.observedDelta,
      loc: doc.loc,
      score: cosine(queryVector, vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
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
  const queryVector = await embed(extraction.searchQuery);
  usages.push({ model: MODELS.embed, promptTokens: Math.ceil(extraction.searchQuery.length / 4), outputTokens: 0 });

  // Local dev without Atlas: cosine search over the seeded corpus.
  if (!mongoConfigured()) {
    return localAnalogues(queryVector, usages);
  }

  // Atlas is configured — use $vectorSearch, but degrade gracefully to the
  // local corpus if the cluster is unreachable or the index isn't ready yet
  // (unseeded collection, index still building, venue network blip).
  try {
    const db = await getDb();
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
            loc: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    if (docs.length > 0) return docs as Analogue[];
    console.warn("Atlas vector search returned 0 docs — falling back to local corpus.");
  } catch (err) {
    console.warn("Atlas vector search unavailable — falling back to local corpus:", (err as Error).message);
  }
  return localAnalogues(queryVector, usages);
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
  let useMongo = mongoConfigured();

  // Cache-first, but only when a real cluster is reachable.
  if (useMongo) {
    try {
      const db = await getDb();
      const cached = await db.collection<AnalysisResult>(COLLECTIONS.analyses).findOne({ inputHash });
      if (cached) {
        return { ...cached, receipt: cachedReceipt(cached.receipt) };
      }
    } catch (err) {
      console.warn("Atlas cache unavailable — proceeding without cache:", (err as Error).message);
      useMongo = false; // don't attempt the write later either
    }
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

  if (useMongo) {
    try {
      const db = await getDb();
      await db.collection(COLLECTIONS.analyses).insertOne({ ...result });
    } catch (err) {
      console.warn("Atlas cache write failed — result still returned:", (err as Error).message);
    }
  }
  return result;
}
