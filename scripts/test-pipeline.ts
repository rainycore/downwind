/**
 * FULL backend smoke test: the entire analyzePolicy() pipeline end-to-end.
 * L1 extract -> L2 Atlas vector search + Gemini re-rank -> sidecar EO (L2.5/L3)
 * -> L3.5 counterfactual -> L4 vision + horizons -> personalization -> contract.
 *
 * Needs GEMINI_API_KEY + MONGODB_URI (seeded + indexed) + sidecar on :8000.
 *   npm run test:pipeline
 */
import { analyzePolicy } from "../src/lib/pipeline";

const POLICY = `A proposed national bill cuts the federal wildfire-suppression and forest-management
budget by 40%, eliminates funding for prescribed burns and fuel-reduction crews, and removes
reporting requirements for timber concessions. It is framed purely as a deficit-reduction measure
with no climate or environmental language.`;

async function main() {
  const result = await analyzePolicy(POLICY, { role: "citizen", location: "Toronto, Canada", education: "undergraduate" });
  const c = result.contract;

  console.log("═══ L1 mechanisms ═══");
  console.log("summary:", c.layer1_mechanisms.policy_summary);
  for (const l of c.layer1_mechanisms.levers) console.log(`  • [${l.type}${l.non_obvious ? "/hidden" : ""}] ${l.name} (${l.confidence})`);

  console.log("\n═══ L2 analogs (vector search + Gemini re-rank) ═══");
  for (const a of c.layer2_analogs) {
    console.log(`  • ${a.analog_id}  sim=${a.similarity}  verdict=${a.rerank_verdict}`);
    if (a.rerank_reason) console.log(`      ↳ ${a.rerank_reason}`);
  }

  console.log("\n═══ L3 observed (sidecar) ═══");
  const lc = c.layer3_observed?.land_cover;
  console.log("  imagery:", lc?.imagery?.source, "| ndvi_delta:", lc?.ndvi_delta, "| flags:", lc?.flags);
  console.log("  fire delta:", c.layer3_observed?.fire.firms_fire_count_delta, "| flags:", c.layer3_observed?.fire ? (c.layer3_observed.fire as { flags?: string[] }).flags : undefined);

  console.log("\n═══ L3.5 counterfactual [MODELED] ═══");
  const cf = c.layer3_5_counterfactual;
  console.log("  avoided_loss_km2:", cf?.avoided_loss_km2, "| ci95:", cf?.ci95, "| cite:", cf?.cite);

  console.log("\n═══ L4 vision + horizons ═══");
  console.log("  visible_change:", c.layer4_impact?.vlm_corroboration.visible_change);
  console.log("  direction_agrees_with_tools:", c.layer4_impact?.vlm_corroboration.direction_agrees_with_tools);
  console.log("  3y:", c.layer4_impact?.horizons["3y"].summary?.slice(0, 160));
  console.log("  30y flag:", c.layer4_impact?.horizons["30y"].flag);

  console.log("\n═══ Personalization (Toronto citizen) ═══");
  console.log("  simple:", result.personalization.simple?.slice(0, 200));
  console.log("  local headline:", result.personalization.local.headline);
  console.log("  pathway:", result.personalization.local.pathway?.slice(0, 160));

  console.log("\n═══ Receipt ═══");
  console.log("  ", result.receipt.totalTokens, "tokens ·", result.receipt.estGramsCO2, "gCO2e · cached:", result.receipt.cached);
  console.log("\n✅ Full pipeline OK.");
}

main().catch((e) => {
  console.error("\n❌ FAILED:", e);
  process.exit(1);
});
