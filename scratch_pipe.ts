import { analyzePolicy } from "./src/lib/pipeline";
(async () => {
  const bill = "A national government cuts the environmental-inspection agency's budget by 40% and lowers penalties for land-clearing and permit violations, presented as cutting red tape for business.";
  try {
    const r = await analyzePolicy(bill);
    console.log("TITLE:", r.extraction.title);
    console.log("assumedNeutral:", r.extraction.screening.assumedNeutral, "| levers:", r.extraction.screening.matchedLevers.join(","));
    console.log("HIDDEN levers:", r.extraction.levers.filter(l=>!l.obvious).map(l=>l.mechanism).join(" ; "));
    console.log("ANALOGUES:", r.analogues.map(a=>`${a.policyId} (${(a.score*100).toFixed(1)}%) loc=${a.loc?a.loc.coordinates.join(","):"none"}`).join(" | "));
    console.log("DIMENSIONS:", r.dimensions.map(d=>`${d.key}:${d.direction}/${d.confidence}`).join(" | "));
    console.log("HORIZONS:", r.horizons.map(h=>`${h.years}y:${h.label}`).join(" | "));
    console.log("LOCAL:", r.localTranslation);
    console.log("SIMPLE:", (r.simple||"").slice(0,160));
    console.log("RECEIPT:", JSON.stringify(r.receipt));
    console.log("AGREEMENT:", r.agreement);
  } catch(e){ console.log("PIPELINE ERROR:", (e && e.message) ? e.message.slice(0,400) : e); }
  process.exit(0);
})();
