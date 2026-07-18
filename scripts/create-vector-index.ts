/**
 * Create (and wait for) the Atlas Vector Search index `policy_vector_index`
 * that src/lib/pipeline.ts queries. Idempotent: skips if it already exists.
 *
 *   npm run index
 *
 * Requires MONGODB_URI. Atlas Vector Search is supported on all tiers incl. M0.
 */
import { MongoClient } from "mongodb";

const INDEX_NAME = "policy_vector_index";
const EMBED_DIM = 768;

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB ?? "downwind";
  if (!uri) throw new Error("MONGODB_URI is not set.");

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection("policies");

  // The driver types search-index docs narrowly ({name}); the runtime docs also
  // carry status/queryable, so widen the type here.
  type SearchIdx = { name: string; status?: string; queryable?: boolean };
  const list = async (): Promise<SearchIdx[]> => (await col.listSearchIndexes().toArray()) as SearchIdx[];

  const existing = await list();
  if (existing.some((i) => i.name === INDEX_NAME)) {
    console.log(`Index "${INDEX_NAME}" already exists (status: ${existing.find((i) => i.name === INDEX_NAME)?.status}).`);
    await client.close();
    return;
  }

  console.log(`Creating vector search index "${INDEX_NAME}" (${EMBED_DIM}-dim, cosine)...`);
  await col.createSearchIndex({
    name: INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: EMBED_DIM, similarity: "cosine" },
        { type: "filter", path: "domain" },
      ],
    },
  });

  // Poll until queryable (build usually takes well under a minute on M0).
  const deadline = Date.now() + 120_000;
  process.stdout.write("Waiting for index to become queryable");
  while (Date.now() < deadline) {
    const idx = (await list()).find((i) => i.name === INDEX_NAME);
    if (idx?.queryable) {
      console.log(`\n✓ Index "${INDEX_NAME}" is ready.`);
      await client.close();
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("\n⚠ Index created but not queryable yet — it will finish building shortly. Check Atlas.");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
