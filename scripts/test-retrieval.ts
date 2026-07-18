/**
 * Isolated L2 test: L1 extract -> Atlas vector search -> Gemini re-rank.
 * Verifies the seeded index + retrieval + re-rank with timing per step.
 * Needs GEMINI_API_KEY + MONGODB_URI. No sidecar, no vision.
 */
import { getDb, COLLECTIONS } from "../src/lib/mongodb";
import { embed } from "../src/lib/gemini";
import { extractMechanisms } from "../src/lib/extract";
import type { Usage } from "../src/lib/greenai";

const POLICY = `A national bill cuts the federal wildfire-suppression and forest-management budget by 40%,
eliminates funding for prescribed burns, and removes reporting requirements for timber concessions —
framed purely as deficit reduction with no climate language.`;

const t = (s: number) => `${((Date.now() - s) / 1000).toFixed(1)}s`;

async function main() {
  const usages: Usage[] = [];

  let s = Date.now();
  const extraction = await extractMechanisms(POLICY, "user_paste", usages);
  console.log(`L1 extract: ${t(s)} — ${extraction.levers.length} levers, search_query="${extraction.search_query.slice(0, 80)}..."`);

  s = Date.now();
  const vec = await embed(extraction.search_query);
  console.log(`embed: ${t(s)} — dim ${vec.length}`);

  s = Date.now();
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.policies)
    .aggregate([
      { $vectorSearch: { index: "policy_vector_index", path: "embedding", queryVector: vec, numCandidates: 100, limit: 5 } },
      { $project: { _id: 0, policyId: 1, title: 1, score: { $meta: "vectorSearchScore" } } },
    ])
    .toArray();
  console.log(`vectorSearch: ${t(s)} — ${docs.length} hits`);
  for (const d of docs) console.log(`   • ${d.policyId}  (${(d.score as number).toFixed(3)})  ${d.title}`);

  console.log("\n✅ L2 retrieval OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ FAILED:", e);
  process.exit(1);
});
