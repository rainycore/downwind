/**
 * Precompute satellite EVIDENCE for each case study and cache it in Atlas.
 *
 * Usage:  npm run evidence
 *
 * For every case with an `imagery` block it:
 *   1. builds a before/after NASA GIBS image pair (deterministic URLs, no auth),
 *   2. fetches both PNGs,
 *   3. if a local Ollama server is up, runs Gemma vision to interpret the pair,
 *   4. upserts a SatelliteEvidence doc into the `observations` collection keyed
 *      by policyId.
 *
 * Production (Vercel) has no Ollama, so this runs on the laptop before demo day
 * and the request-time pipeline just reads the cache. Re-run it to refresh.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";
import { imagePair, fetchPng, type LayerKey } from "../src/lib/gibs";
import { greennessDelta } from "../src/lib/greenness";
import { interpretImagePair, ollamaUp, OLLAMA_MODEL } from "../src/lib/ollama";
import type { SatelliteEvidence } from "../src/lib/reader";

type Case = {
  policyId: string;
  region: string;
  enactedYear: number;
  loc: { coordinates: [number, number] };
  dimension?: string;
  imagery?: { layer: LayerKey; beforeDate: string; afterDate: string; boxDeg?: number };
};

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB ?? "downwind";
  if (!uri) throw new Error("MONGODB_URI is not set.");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "data", "case-studies.json"), "utf8");
  const cases: Case[] = JSON.parse(raw);

  const hasOllama = await ollamaUp();
  console.log(hasOllama ? `Ollama up — interpreting with ${OLLAMA_MODEL}` : "Ollama not reachable — caching image pairs without interpretation");

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection<SatelliteEvidence>("observations");

  for (const c of cases) {
    if (!c.imagery) {
      console.log(`  – ${c.policyId}: no imagery block, skipping`);
      continue;
    }
    const [lon, lat] = c.loc.coordinates;
    const pair = imagePair({
      layer: c.imagery.layer,
      lon,
      lat,
      beforeDate: c.imagery.beforeDate,
      afterDate: c.imagery.afterDate,
      halfDeg: c.imagery.boxDeg,
    });

    let interpretation: SatelliteEvidence["interpretation"] = null;
    let model: string | null = null;
    let greenness: SatelliteEvidence["greenness"] = null;

    // Always fetch the pixels — the greenness delta is measured, no GPU/LLM.
    let beforePng: Buffer | null = null;
    let afterPng: Buffer | null = null;
    try {
      [beforePng, afterPng] = await Promise.all([fetchPng(pair.before.url), fetchPng(pair.after.url)]);
      greenness = greennessDelta(beforePng, afterPng);
      console.log(`  · ${c.policyId}: measured greenness ${greenness.before} → ${greenness.after} (${greenness.deltaPct > 0 ? "+" : ""}${greenness.deltaPct}%)`);
    } catch (err) {
      console.warn(`    ! ${c.policyId}: image fetch/greenness failed — ${(err as Error).message}`);
    }

    // Optional qualitative read from local Gemma vision, if a runner is up.
    if (hasOllama && beforePng && afterPng) {
      try {
        const context = `Region: ${c.region}. Observable: ${c.dimension ?? "surface change"}. Before date: ${pair.before.date}. After date: ${pair.after.date}. This spans a policy enacted around ${c.enactedYear}.`;
        console.log(`  … ${c.policyId}: running Gemma vision…`);
        interpretation = await interpretImagePair({
          beforeB64: beforePng.toString("base64"),
          afterB64: afterPng.toString("base64"),
          context,
        });
        if (interpretation) model = OLLAMA_MODEL;
      } catch (err) {
        console.warn(`    ! ${c.policyId}: interpret failed — ${(err as Error).message}`);
      }
    }

    const evidence: SatelliteEvidence = {
      policyId: c.policyId,
      region: c.region,
      dimension: c.dimension ?? "surface change",
      layerLabel: pair.layerLabel,
      dataset: pair.dataset,
      before: pair.before,
      after: pair.after,
      interpretation,
      model,
      greenness,
    };

    await col.updateOne({ policyId: c.policyId }, { $set: evidence }, { upsert: true });
    console.log(`  ✓ ${c.policyId}${interpretation ? ` — ${interpretation.direction} (${interpretation.confidence})` : " — pair cached, no interpretation"}`);
  }

  await col.createIndex({ policyId: 1 }, { unique: true });
  await client.close();
  console.log("\nDone. Evidence cached in `observations`.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
