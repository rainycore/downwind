/**
 * Seed the `policies` collection with case-study analogues + Gemini embeddings.
 *
 * Usage:  npm run seed
 *
 * Requires MONGODB_URI and GEMINI_API_KEY in .env.local. After seeding, create
 * the Atlas Vector Search index (see README) so /api/analyze can query it.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";
import { GoogleGenAI } from "@google/genai";

const EMBED_DIM = 768;
const EMBED_MODEL = "gemini-embedding-001";

async function main() {
  const uri = process.env.MONGODB_URI;
  const apiKey = process.env.GEMINI_API_KEY;
  const dbName = process.env.MONGODB_DB ?? "downwind";
  if (!uri) throw new Error("MONGODB_URI is not set.");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "data", "case-studies.json"), "utf8");
  const cases: Array<{ policyId: string; text: string; [k: string]: unknown }> = JSON.parse(raw);

  const ai = new GoogleGenAI({ apiKey });
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection("policies");

  console.log(`Embedding + upserting ${cases.length} policies...`);
  for (const c of cases) {
    const resp = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: `${c.title as string}\n${c.text}`,
      config: { outputDimensionality: EMBED_DIM },
    });
    const embedding = resp.embeddings?.[0]?.values;
    if (!embedding) throw new Error(`Embedding failed for ${c.policyId}`);

    await col.updateOne(
      { policyId: c.policyId },
      { $set: { ...c, embedding } },
      { upsert: true },
    );
    console.log(`  ✓ ${c.policyId}`);
  }

  // Geospatial index for region -> tile lookups (MongoDB 2dsphere story).
  await col.createIndex({ loc: "2dsphere" });
  console.log("  ✓ 2dsphere index on `loc`");

  await client.close();
  console.log("\nDone. Now create the Vector Search index `policy_vector_index` (see README).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
