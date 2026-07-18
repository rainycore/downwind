/**
 * Precompute multi-dimension satellite EVIDENCE for each case study and cache it
 * in Atlas.
 *
 * Usage:  npm run evidence
 *
 * For every case, for every climate dimension it declares, it:
 *   1. builds a before/after NASA GIBS image pair (deterministic URLs, no auth),
 *   2. fetches both PNGs,
 *   3. inverts the GIBS colormap to a REAL physical value (NDVI, °C, AOD, DU,
 *      mm/hr, % …) and computes the before→after delta — no GPU, no raster API,
 *   4. optionally adds a qualitative read from local Gemma vision (if up),
 *   5. upserts a SatelliteEvidence doc into `observations` keyed by policyId.
 *
 * Production (Vercel) just reads the cache. Re-run to refresh.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";
import { dimensionPair, fetchPng, DIMENSIONS, type DimensionKey } from "../src/lib/gibs";
import { fetchColorMap, meanValue, type ColorMap } from "../src/lib/colormap";
import { interpretImagePair, ollamaUp, OLLAMA_MODEL } from "../src/lib/ollama";
import type { SatelliteEvidence, DimensionReading } from "../src/lib/reader";

type Case = {
  policyId: string;
  region: string;
  enactedYear: number;
  loc: { coordinates: [number, number] };
  window?: { beforeDate: string; afterDate: string; boxDeg?: number };
  dimensions?: DimensionKey[];
};

const MIN_COVERAGE = 0.05; // below this the scene is too gap-covered to trust

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB ?? "downwind";
  if (!uri) throw new Error("MONGODB_URI is not set.");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "data", "case-studies.json"), "utf8");
  const cases: Case[] = JSON.parse(raw);

  const hasOllama = await ollamaUp();
  console.log(hasOllama ? `Ollama up — adding Gemma reads with ${OLLAMA_MODEL}` : "Ollama not reachable — physical metrics only (no VLM read)");

  // Cache parsed colormaps across cases (they're per-layer, not per-region).
  const cmCache = new Map<string, Promise<ColorMap>>();
  const colorMap = (key: DimensionKey) => {
    const spec = DIMENSIONS[key];
    if (!cmCache.has(spec.colormap)) cmCache.set(spec.colormap, fetchColorMap(spec.colormap, spec.validRange));
    return cmCache.get(spec.colormap)!;
  };

  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection<SatelliteEvidence>("observations");

  for (const c of cases) {
    if (!c.window || !c.dimensions?.length) {
      console.log(`  – ${c.policyId}: no window/dimensions, skipping`);
      continue;
    }
    const [lon, lat] = c.loc.coordinates;
    console.log(`\n${c.policyId} (${c.region}) — ${c.dimensions.length} dimensions`);
    const readings: DimensionReading[] = [];
    let model: string | null = null;

    for (const key of c.dimensions) {
      const spec = DIMENSIONS[key];
      const pair = dimensionPair({ dimension: key, lon, lat, beforeDate: c.window.beforeDate, afterDate: c.window.afterDate, halfDeg: c.window.boxDeg });

      let metric: DimensionReading["metric"] = null;
      let interpretation: DimensionReading["interpretation"] = null;
      let beforePng: Buffer | null = null;
      let afterPng: Buffer | null = null;

      try {
        [beforePng, afterPng] = await Promise.all([fetchPng(pair.before.url), fetchPng(pair.after.url)]);
        const cm = await colorMap(key);
        const mb = meanValue(beforePng, cm);
        const ma = meanValue(afterPng, cm);
        const conv = spec.convert ?? ((v: number) => v);
        const cov = Math.min(mb.coverage, ma.coverage);
        if (Number.isFinite(mb.mean) && Number.isFinite(ma.mean) && cov >= MIN_COVERAGE) {
          const before = conv(mb.mean);
          const after = conv(ma.mean);
          metric = {
            unit: spec.unitLabel ?? cm.units ?? "index",
            before: round(before),
            after: round(after),
            deltaPct: before !== 0 ? Math.round(((after - before) / Math.abs(before)) * 1000) / 10 : 0,
            coverage: Math.round(cov * 100) / 100,
            goodDirection: spec.goodDirection,
          };
          console.log(`  ✓ ${key.padEnd(13)} ${metric.before} → ${metric.after} ${metric.unit}  (${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}%, cov ${Math.round(cov * 100)}%)`);
        } else {
          console.log(`  ~ ${key.padEnd(13)} low coverage (${Math.round(cov * 100)}%) — image only`);
        }
      } catch (err) {
        console.warn(`  ! ${key.padEnd(13)} ${(err as Error).message} — skipped`);
        continue; // no imagery → don't emit a reading
      }

      if (hasOllama && beforePng && afterPng) {
        try {
          const context = `Region: ${c.region}. Observable: ${spec.label}. Before: ${pair.before.date}, after: ${pair.after.date}. Spans a policy enacted around ${c.enactedYear}.`;
          interpretation = await interpretImagePair({
            beforeB64: beforePng.toString("base64"),
            afterB64: afterPng.toString("base64"),
            context,
          });
          if (interpretation) model = OLLAMA_MODEL;
        } catch {
          /* best-effort */
        }
      }

      readings.push({
        key,
        label: spec.label,
        dataset: spec.dataset,
        before: pair.before,
        after: pair.after,
        metric,
        interpretation,
      });
    }

    const evidence: SatelliteEvidence = { policyId: c.policyId, region: c.region, model, readings };
    await col.updateOne({ policyId: c.policyId }, { $set: evidence }, { upsert: true });
    console.log(`  → cached ${readings.length} readings`);
  }

  await col.createIndex({ policyId: 1 }, { unique: true });
  await client.close();
  console.log("\nDone. Evidence cached in `observations`.");
}

function round(n: number): number {
  const abs = Math.abs(n);
  const dp = abs >= 100 ? 1 : abs >= 1 ? 2 : 3; // more precision for small values (NDVI, AOD)
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
