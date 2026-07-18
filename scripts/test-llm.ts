/**
 * End-to-end backend smoke test — LLM + VLM serving on REAL satellite imagery.
 *
 * Needs ONLY GEMINI_API_KEY (in .env.local) + the EO sidecar running on
 * localhost:8000 (which itself needs no keys — it uses zero-auth GIBS).
 * No MongoDB, no Auth0, no Sentinel Hub required.
 *
 *   Terminal 1:  cd sidecar && ./.venv/bin/uvicorn app.main:app --port 8000
 *   Terminal 2:  npm run test:llm
 */
import { extractMechanisms } from "../src/lib/extract";
import { buildLayer4 } from "../src/lib/vision";
import { callEo } from "../src/lib/sidecar";
import type { Usage } from "../src/lib/greenai";
import type { Layer2Analog } from "../src/lib/contract";

const SAMPLE_POLICY = `The state of Pará establishes new federal conservation units and indigenous
lands across the eastern Amazon, expands real-time satellite enforcement by IBAMA, and restricts
subsidized rural credit to municipalities with high illegal-deforestation rates. The measure has no
explicit emissions target and is framed as a land-tenure and fiscal-credit reform.`;

// A stand-in analog so L4 has documented-outcome context (mirrors a hero case).
const ANALOG: Layer2Analog = {
  analog_id: "br-ppcdam-2004",
  title: "Brazil PPCDAm (2004)",
  similarity: 0.0,
  rerank_verdict: "comparable_mechanism",
  region: { name: "Pará, Brazil", bbox: [-53.5, -6.5, -50.5, -3.5], geometry_ref: "bbox" },
  enacted_year: 2004,
  observable_window: "2016-06-01/2016-09-30 vs 2023-06-01/2023-09-30",
  documented_outcome: "Amazon annual forest loss fell ~84% 2004->2012 (PRODES).",
  precomputed_counterfactual: { avoided_loss_km2: 73000, ci95: [50000, 96000], method: "municipality-panel DiD", cite: "Assuncao et al. 2015" },
  domain: "land_cover",
};

async function main() {
  const usages: Usage[] = [];

  console.log("── L1: Gemini extraction ──");
  const extraction = await extractMechanisms(SAMPLE_POLICY, "user_paste", usages);
  console.log("finish_reason:", extraction.finish_reason);
  console.log("summary:", extraction.policy_summary);
  console.log("sectors:", extraction.sectors);
  console.log("levers:");
  for (const l of extraction.levers) console.log(`  • [${l.type}${l.non_obvious ? "/hidden" : ""}] ${l.name}  — "${l.source_span.slice(0, 60)}" (${l.confidence})`);
  console.log("categories:");
  for (const c of extraction.categories) console.log(`  • ${c.worldcover_class} (${c.code}) → ${c.worldcover_to_ipcc}: ${c.change_direction}/${c.change_magnitude_ordinal}`);
  console.log("domain_routing:", extraction.domain_routing);

  console.log("\n── L3: real EO via sidecar (GIBS, zero-auth) ──");
  const eo = await callEo({
    bbox: ANALOG.region.bbox,
    region_query: ANALOG.region.name,
    window_t0: "2016-06-01/2016-09-30",
    window_t1: "2023-06-01/2023-09-30",
    domain: "land_cover",
  });
  if (!eo) {
    console.log("  sidecar unreachable — start it on :8000. Continuing with empty imagery.");
  } else {
    const lc = eo.layer3_observed.land_cover;
    console.log("  imagery source:", lc.imagery?.source, "| ndvi_delta:", lc.ndvi_delta, "| flags:", lc.flags);
  }

  console.log("\n── L4: Gemini VISION corroboration + three horizons ──");
  const observed = eo?.layer3_observed ?? {
    land_cover: { imagery: null, ndvi_mean_t0: null, ndvi_mean_t1: null, ndvi_delta: null, nbr_delta: null, changed_area_fraction: null, PROVENANCE_TAG: "OBSERVED" as const, flags: ["no_sidecar"] },
    fire: { firms_fire_count_t0: null, firms_fire_count_t1: null, firms_fire_count_delta: null, firms_frp_sum_delta: null, PROVENANCE_TAG: "OBSERVED" as const },
    air_quality: { s5p_no2_delta_pct: null, aerosol_index_delta: null, openaq_pm25_crosscheck: null, PROVENANCE_TAG: "OBSERVED" as const },
  };
  const layer4 = await buildLayer4(extraction, [ANALOG], observed, ANALOG.precomputed_counterfactual.cite, usages);
  console.log("visible_change:", layer4.vlm_corroboration.visible_change);
  console.log("direction_agrees_with_tools:", layer4.vlm_corroboration.direction_agrees_with_tools, "| note:", layer4.vlm_corroboration.discrepancy_note);
  console.log("evidence:", layer4.vlm_corroboration.evidence);
  console.log("3y  [OBSERVED]:", layer4.horizons["3y"].summary);
  console.log("5-10y [MODELED]:", layer4.horizons["5_10y"].summary, "\n  method:", layer4.horizons["5_10y"].method);
  console.log("30y [SPECULATIVE]:", layer4.horizons["30y"].summary);

  const totalTokens = usages.reduce((s, u) => s + u.promptTokens + u.outputTokens, 0);
  console.log(`\n✅ Done. ${usages.length} model calls, ~${totalTokens.toLocaleString()} tokens.`);
}

main().catch((e) => {
  console.error("\n❌ FAILED:", e);
  process.exit(1);
});
