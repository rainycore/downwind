# Downwind / PolicyLens — "What observably happened, from space, where a policy like this ran"

**Policy text → Gemini mechanism extraction → analog-policy retrieval → real satellite before/after + honest counterfactual → Gemini *vision corroboration* + three-horizon narrative, everything provenance-tagged.**

> Build target: **≤48h hackathon sprint.** Stack: **Next.js frontend (existing repo) + a thin Python EO sidecar.** VLM role: **corroborator/translator, never a measurer.** This document is grounded in a deep, web-sourced, adversarially-verified research pass; primary sources cited at the end. Sections marked **[MVP]** ship in 48h; **[STRETCH]** only if time remains.

---

## Context

**What you're building.** A user pastes a free-text environmental/climate **policy** (or picks one from a small curated corpus). The system answers one question honestly: **"Here is what observably happened, from space, in places that enacted a policy like this one."** It returns a satellite-grounded, honestly-caveated impact read across three time horizons, with every number provenance-tagged. Judging criteria: **environmental impact · innovation · technical feasibility · presentation.**

**Locked design decisions (this build):**
1. **Spine = cross-policy analog retrieval, not within-region estimation.** Paste/pick a policy → retrieve *enacted, spatially-localizable, old-enough* analog policies + their regions → show *their* real before/after. This is the only design that handles a *proposed* policy (which has no observable effect yet).
2. **Stack = Next.js (existing) + Python EO sidecar.** The existing repo keeps **Auth0** (MLH prize track), **MongoDB Atlas Vector Search** (corpus + caching + receipts), the analyzer UI, and Gemini calls (`@google/genai`, TS). A **thin Python FastAPI sidecar** owns only the geospatial/EO work (imagery + numeric deltas), because the research is unambiguous that Node's geospatial ecosystem is weak (2–3/10) vs. Python's. Clean seam: **Python returns numbers + images; Next.js does Gemini + Mongo + Auth0 + UI.**
3. **LLM/VLM stack = Gemini end-to-end.** Gemini does structured extraction (L1), analog re-ranking (L2), and **vision corroboration + narrative** (L4). One provider, one SDK on the Next.js side; Google-sponsor-aligned.
4. **Primary domain = forest / land-cover.** [MVP] This is the domain where change is *visible in imagery*, which is exactly what the VLM-corroborator needs (fishbone clearing, canopy loss, burn scars are legible to a VLM). **Air quality (Sentinel-5P NO₂/aerosol, OpenAQ) is [STRETCH]** — it is *invisible* in true-color imagery, so it powers charts and the "secret economic levers" story, not the VLM. **FIRMS fire counts** are a cheap numeric add-on [MVP-lite] because burn scars are semi-visible and the API is trivial.
5. **Counterfactual = precomputed hero-case DiD is the PRIMARY path** [MVP]; **live recompute is a visible [STRETCH] button.** Reproducing a matched difference-in-differences *live on an arbitrary region* is a research task, not a 48h build. Precompute the hero cases from published figures, tag them `MODELED` with the citation, and offer "recompute live" as the wow-if-it-works stretch — never on the critical path.
6. **VLM = corroborator + translator, never a measurer** [MVP]. Every number comes from deterministic tools (L3). The VLM (a) describes the *visible* change a human would see, (b) **cross-checks the *direction* of change against the computed deltas and flags disagreement**, and (c) drives the before/after visual moment. It emits **no magnitudes, rates, or impact numbers.**
7. **Impact framing = three horizons, provenance-tagged:** 3y = observed analogues `[OBSERVED]`, 5–10y = statistical extrapolation `[MODELED]`, 30y = scenario narrative `[LLM_NARRATIVE]`, explicitly flagged speculative.
8. **Closing visual = a real historical satellite timelapse of the analog region — NOT a generated future.** [STRETCH] Season-matched annual composites of what *actually* happened. A synthetic 30y projection video was **deliberately cut**: for a project whose thesis is *precedent, not prediction*, generating a fake future — even watermarked — undercuts the brand and is the lowest-credibility, highest-risk item. Real footage of the observed past is both more credible and fully on-thesis.

**Feasibility verdict: YES for the MVP, with the scope cut above.** Every MVP layer maps onto mature, mostly-free, **no-verification-wait** building blocks. The real risk is **confident fabrication in fluent prose or vivid pixels** — an LLM inventing a change number, a VLM narrating causation from two pictures. The impact-evaluation literature quantifies the trap: naive before/after or protected-vs-unprotected comparisons **overestimate avoided deforestation by ~50–65%** due to non-random siting ("rock and ice" bias). A knowledgeable judge catches this instantly. The answer is the provenance discipline below, plus the precomputed matched counterfactual for the hero cases.

**The one principle that makes it defensible (apply at every layer):**
> **The LLM/VLM interprets, retrieves, corroborates, and narrates. Deterministic, unit-tested code produces every number. Every number is provenance-tagged. Generated pixels are outputs, never inputs.**

This is also your **innovation + presentation edge**: the NL-to-satellite chatbot category is saturated (NASA Earth Copilot, ESA EVE, Microsoft Planetary Explorer). Your novelty is the **analog-retrieval + honest-counterfactual + VLM-as-visual-cross-check + radical-honesty layer** on top.

---

## The 48h MVP cut-line (read this first)

**Ships in 48h [MVP] — the demo-critical spine:**
- L1 Gemini extraction (mechanisms + levers + WorldCover categories + source-spans) — *reuse existing TS code, harden.*
- L2 retrieval over a **curated enriched index of ~8–15 forest hero cases** in MongoDB Atlas Vector Search + Gemini re-rank — *reuse existing vector search.*
- L2.5 region → **bounding box** (geocode only; polygons are stretch).
- L3 **real** forest EO deltas via REST (Sentinel Hub CDSE Process + Statistical API) → before/after PNG pair + NDVI/NBR/fraction deltas. FIRMS fire-count delta as add-on.
- L3.5 **precomputed** hero-case counterfactual number (curated, cited, `MODELED`).
- L4 Gemini **vision corroboration** over the before/after pair + numeric evidence → three-horizon report, provenance-tagged.
- **Receipts mode** (the credibility payload) + the existing Auth0/onboarding/carbon-receipt UI.

**Only if time remains [STRETCH], in rough priority order:**
1. GADM/ecoregion **polygons** instead of bounding boxes (sharper clips).
2. **Air-quality** sub-pipeline (S5P NO₂ + OpenAQ) as charts + the "secret levers" story.
3. **Live** counterfactual recompute button (covariate matching + DiD + placebo).
4. Policy-diff (two bills side by side).
5. Self-consistency / narrative-stability meter.
6. Real satellite timelapse of the analog region (the on-thesis closing visual).

**If a layer isn't done, stub it against the JSON contract and move on.** The contract is the safety net — any layer can return canned data and the demo still runs.

---

## Architecture overview

```
┌───────────────────────────── Next.js app (existing repo) ─────────────────────────────┐
│  Auth0 login · onboarding/profile · analyzer UI · MongoDB Atlas (corpus + cache + receipts)│
│                                                                                            │
│  [Corpus] curated forest hero cases ── pick one ──┐                                         │
│  free-text policy paste ──────────────────────────┤                                        │
│   ▼                                                                                        │
│  [L1 · Gemini extraction  @google/genai TS] → PolicyMechanisms JSON                         │
│   • sectors · levers (incl. non-obvious: zoning, fire-suppression budgets, ag subsidies)   │
│   • geography · timescale · WorldCover categories + direction + ORDINAL magnitude + quote  │
│   • NO invented numbers                                                                     │
│   ▼                                                                                        │
│  [L2 · Analog retrieval] Atlas $vectorSearch over ENRICHED index + Gemini re-rank           │
│   • each analog carries: region bbox · observable window · precomputed counterfactual · cite│
│   ▼                                                                                        │
│   └──────── POST region+window ──────►  ┌──────── Python EO sidecar (FastAPI) ────────┐     │
│                                          │ [L2.5] geocode → bounding box               │     │
│                                          │ [L3] Sentinel Hub CDSE:                     │     │
│                                          │   • Process API → before/after true-color PNG│    │
│                                          │   • Statistical API → NDVI/NBR/fraction Δ   │     │
│                                          │   • FIRMS → fire-count Δ (add-on)           │     │
│                                          │ (PC / GIBS Snapshots = zero-auth fallback)  │     │
│   ◄──────── numbers + image bytes ──────  └─────────────────────────────────────────────┘   │
│   ▼                                                                                        │
│  [L3.5 · precomputed counterfactual] curated hero-case DiD number  [MODELED]                │
│   ▼                                                                                        │
│  [L4 · Gemini VISION corroboration  @google/genai TS] → three-horizon ImpactReport          │
│   • reads before/after pair → describes VISIBLE change, cross-checks DIRECTION vs. tools     │
│   • 3y observed [OBSERVED] · 5–10y extrapolation [MODELED] · 30y scenario [LLM_NARRATIVE]    │
│   ▼                                                                                        │
│  [Presentation] Receipts mode · (stretch: policy diff · stability meter · real timelapse)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**The spine = one JSON contract that grows as it flows through the layers.** Discipline: numbers come from the Python tools, not token generation. Gemini is confined to L1 (parse), L2 (re-rank), and L4 (corroborate + narrate).

---

## The data contract (the glue between layers)

Define this first — every layer plugs into it, any layer can be stubbed, and it is what "receipts mode" renders. Shared between Next.js (TS type) and the Python sidecar (Pydantic model); keep them in sync.

```json
{
  "layer1_mechanisms": {
    "policy_source": "curated:forest_hero_ppcdam | user_paste",
    "policy_summary": "...",
    "sectors": ["forestry", "energy"],
    "levers": [
      {"name": "protected-area designation", "type": "land_use_control",
       "non_obvious": false, "source_span": "\"...establish federal conservation units...\"", "confidence": "high"},
      {"name": "fire-suppression budget cut", "type": "fiscal", "non_obvious": true,
       "source_span": "\"...reduce wildfire management appropriations by...\"", "confidence": "medium"}
    ],
    "geography": {"region_query": "Pará, Brazil", "scope": "subnational"},
    "timescale": {"enacted_year": 2004, "horizon_years": [3, 10, 30]},
    "domain_routing": {"land_cover": true, "air_quality": false},
    "categories": [
      {"worldcover_class": "Tree cover", "code": 10,
       "change_direction": "decrease",
       "change_magnitude_ordinal": "large",   // enum: none|slight|moderate|large|unknown — NOT a float
       "source_span": "\"...halt illegal deforestation across the state...\"",
       "worldcover_to_ipcc": "Forest land"}
    ],
    "model_stated_confidence_uncalibrated": 0.0,
    "finish_reason": "STOP"
  },
  "layer2_analogs": [
    {"analog_id": "PPCDAm-BR-2004", "similarity": 0.0, "rerank_verdict": "comparable_mechanism",
     "region": {"name": "Pará, Brazil", "bbox": [-59.0, -9.8, -46.0, 2.6], "geometry_ref": "bbox|GADM:BRA.14_1"},
     "enacted_year": 2004, "observable_window": "2019-06/2019-09 vs 2023-06/2023-09",
     "documented_outcome": "~84% Amazon deforestation reduction 2004→2012 (cite)",
     "precomputed_counterfactual": {"avoided_loss_km2": 340, "ci95": [180, 510], "method": "matched DiD (published)", "cite": "..."},
     "domain": "land_cover"}
  ],
  "layer2_5_geometry": {
    "resolved": {"source": "Nominatim bbox", "bbox": [-59.0, -9.8, -46.0, 2.6], "is_admin_unit": false},
    "resolver_path": "bbox | admin | ecoregion | city", "geocoder_confidence": 0.0, "candidates": []
  },
  "layer3_observed": {
    "land_cover": {
      "imagery": {"product": "Sentinel-2 L2A", "composite": "least-cloud mosaic",
                  "t0": "2019-06/2019-09", "t1": "2023-06/2023-09", "source": "Sentinel Hub CDSE Process API",
                  "before_png_ref": "...", "after_png_ref": "..."},
      "ndvi_mean_t0": 0.71, "ndvi_mean_t1": 0.60, "ndvi_delta": -0.11,
      "nbr_delta": -0.04, "changed_area_fraction": 0.09,
      "PROVENANCE_TAG": "OBSERVED"
    },
    "fire": {"firms_fire_count_t0": 0, "firms_fire_count_t1": 0, "firms_fire_count_delta": 0, "PROVENANCE_TAG": "OBSERVED"},
    "air_quality": {  // [STRETCH] — null in MVP
      "s5p_no2_delta_pct": null, "aerosol_index_delta": null, "openaq_pm25_crosscheck": null,
      "PROVENANCE_TAG": "OBSERVED"
    }
  },
  "layer3_5_counterfactual": {
    "source": "precomputed_hero_case",   // MVP; "live" only when the stretch button runs
    "method": "matched DiD (published figures)",
    "avoided_loss_km2": 340, "ci95": [180, 510], "placebo_p": null,
    "assumptions": ["non-random siting corrected in source study", "SUTVA/leakage NOT controlled", "time-varying unobservables NOT controlled"],
    "fallback_used": false,
    "PROVENANCE_TAG": "MODELED"
  },
  "layer4_impact": {
    "vlm_corroboration": {
      "visible_change": "NW quadrant: contiguous canopy fragments into fishbone road-led clearing.",
      "direction_agrees_with_tools": true,     // false ⇒ surfaced as an honesty flag
      "discrepancy_note": null,
      "PROVENANCE_TAG": "LLM_NARRATIVE"
    },
    "horizons": {
      "3y": {"summary": "...", "PROVENANCE_TAG": "OBSERVED"},
      "5_10y": {"summary": "...", "method": "trend extrapolation + CI", "PROVENANCE_TAG": "MODELED"},
      "30y": {"summary": "...", "flag": "SPECULATIVE_SCENARIO", "PROVENANCE_TAG": "LLM_NARRATIVE"}
    },
    "local_translation": {"metric": "smoke_days_per_year", "place": "Toronto",
      "value": 0, "method": "published FRP→PM2.5 smoke-day coefficient (cite)", "PROVENANCE_TAG": "MODELED"},
    "caveats": ["Sentinel-2 change != permanent deforestation", "illumination/season not controlled beyond season-matching", "..."],
    "per_number_provenance": {"...": "OBSERVED | MODELED | LLM_NARRATIVE"},
    "self_consistency": {"runs": 1, "narrative_variance": "n/a in MVP"}
  }
}
```

---

## Layer 1 — Policy text → structured mechanisms (Gemini, Next.js/TS) `[MVP]`

**Model & mechanism.** Gemini via `@google/genai` (already in the repo). Use **`gemini-2.5-flash`** for extraction — GA, cheap, reliable structured output; escalate to **`gemini-2.5-pro`** only if extraction quality demands it (⚠ verify current GA model IDs at build; they move). Force structure with `config: { responseMimeType: "application/json", responseSchema }`; parse `response.text`. Gemini's long context (~1M tokens) means you feed the *entire* policy document without chunking.

**Critical anti-hallucination design (load-bearing):**
- Gemini emits **interpretation only**: sectors + levers + geography + timescale + relevant **categories from the ESA WorldCover enum** + change **direction** + an **ordinal magnitude enum** (`none|slight|moderate|large|unknown`) + a **mandatory source-span quote** per lever/category.
- It must **NOT** emit numeric baseline fractions or float change magnitudes — a bare float is a hallucination generator. All numbers come from EO (L3).
- **"Secret levers" — with a leash.** Surfacing non-obvious climate levers (zoning, fire-suppression budgets, ag subsidies) is Gemini's genuine edge and a core demo hook, but it *over-reads*. Guard with (a) a mandatory `source_span` per lever, (b) a `non_obvious` flag + `confidence` enum, (c) a fixed **lever-type taxonomy** so it cannot invent freeform mechanisms.
- Constrain `worldcover_class` to the exact 11-class enum. Keep WorldCover→IPCC AFOLU crosswalk **in code**.

**Gemini API caveats to handle (do not skip):**
- `responseSchema` constrains structure but **not** value ranges. Enforce range/membership as **post-parse validators** (TS: a small Zod/hand-rolled guard). Compare enum casing case-insensitively.
- **Branch on `finishReason` before trusting the parse.** Reasons include `SAFETY`, `MAX_TOKENS`, and — critically — **`RECITATION`** (Gemini blocks output that too closely reproduces training data). **Quoting verbatim policy spans can trip RECITATION.** Mitigate: keep quoted spans short, prefer character offsets into the provided text, treat a `RECITATION`/`SAFETY` block as a structured error + retry (shorter span, lower temperature), never a silent malformed struct. Set `maxOutputTokens` generously.

**Datasets / references:** ESA WorldCover v200 taxonomy (canonical enum); IPCC AFOLU 6-category crosswalk (static dict); fixed lever-type taxonomy (in code).
**Validate:** run canonical prompts (Pará deforestation; a solar-on-cropland case; a "secret lever" fire-suppression budget bill); assert categories ∈ taxonomy, levers carry source-spans, `finishReason` branching + RECITATION retry work, the model never emits a bare baseline number.

---

## Layer 2 — Analog retrieval (the spine) — curated index + MongoDB Atlas Vector Search `[MVP]`

This is the layer that makes the whole framing true, and **the real work is the enriched index, not the ANN query.** Reuses the existing `policies` collection + `$vectorSearch` wiring in the repo.

**The hard truth — a raw vector search does NOT return satellite-ready analogs.** Vector search returns *textually similar* policies. A usable analog must be **enacted + spatially-localizable + old enough for observable before/after (≥3–5y) + have a documented outcome.** So:

- **Build an ENRICHED analog index — ~8–15 curated forest hero cases for the MVP** (expandable). Each entry = policy text embedding **+ region bounding box + enacted year + observable window + domain (`land_cover`) + a documented real-world outcome + citation + a precomputed counterfactual number.** This curated table is the actual deliverable of L2.
- **Retrieve:** embed L1 mechanisms with **`gemini-embedding-001`** (768-dim, already used by the repo's `embed()`); query with Atlas **`$vectorSearch`**.
- **Gemini re-ranker (mechanism/context verifier):** top-k candidates → Gemini judges "same *mechanism*, comparable *context* (biome/economy/scale)?" This kills false analogs (a temperate forest law retrieved for a tropical case). **The re-ranker may reject/flag, but must NEVER assert the analog's outcome** — that comes from the index's cited data and L3's live EO.

**Seed forest hero cases (MVP):** Brazil **PPCDAm** (2004, Pará/Amazon); Indonesia peatland/forest moratorium; Costa Rica PES reforestation; China Grain-for-Green; a solar-buildout-on-cropland case; plus the existing repo seeds (BC FireSmart, Ontario forest-budget cuts) which pair naturally with the FIRMS add-on.
**Air-quality seeds are [STRETCH]** (China Air Pollution Action Plan 2013; COVID-2020 NO₂ drop) — add only with the air sub-pipeline.

**Datasets:** curated hero-case table (hand-built; optionally seeded from Climate Policy Radar / Climate Change Laws of the World dumps). Embeddings: `gemini-embedding-001`. Store: MongoDB Atlas Vector Search.
**Validate:** each canonical L1 output retrieves ≥1 curated analog with correct domain; the re-ranker rejects a deliberately-planted false analog; every returned analog has bbox + observable window + citation + precomputed counterfactual.

---

## Layer 2.5 — Region → geometry (Python sidecar) `[MVP = bbox]`

Resolves the geometry of the **retrieved analog's** region (and, for a live paste with no analog, the paste's own region). This is the layer that breaks prototypes — so for the MVP, **use bounding boxes, not polygons.**

**MVP path — bounding box only:** `geopy` → Nominatim returns candidates + `boundingbox`. Respect the **strict policy**: max 1 req/s (use `RateLimiter`), mandatory custom `User-Agent`. **Return multiple candidates** — do not trust a single self-reported flag (it misses the "confidently wrong Pará"). A bbox is all Sentinel Hub / Planetary Computer / FIRMS need. For the hero cases, **pre-store the bbox in the enriched index** so the demo path never depends on live geocoding.

**[STRETCH] — authoritative polygon:** GADM v4.1 (`geopandas` + `pyogrio`) for sharper clips; add a biome/ecoregion resolver (RESOLVE Ecoregions / WWF biomes) for "Amazon"-type extents with no admin polygon; a city-boundary path for any air-quality analog. Record `resolver_path` in the contract. **License note:** GADM is non-commercial → swap to **geoBoundaries (CC-BY)** or **Natural Earth (public domain)** for any commercial angle.

**Tools (MVP):** `geopy` only. **(Stretch adds** `geopandas`, `pyogrio`, `shapely`.**)**
**Validate:** resolve every hero-case region to a sane bbox; confirm the bbox clips correctly in L3; keep pre-stored bboxes as the demo-safe default.

---

## Layer 3 — LIVE EO fetch + real deltas (forest, Python sidecar) `[OBSERVED]` `[MVP]`

Only clipping a real raster to the real region yields a mapping that is a **measured property of a real place** (not a mood board). This is where the "real satellite" claim is earned — and, critically, **the whole MVP EO stack is plain REST with no verification wait** (GEE is demoted to stretch precisely because its noncommercial verification can cost 2–3 days you don't have).

**Primary provider — Sentinel Hub on Copernicus Data Space Ecosystem (CDSE).** One free account, one OAuth client (`client_credentials`), and it serves **both** things you need:
- **Process API** (`POST https://sh.dataspace.copernicus.eu/api/v1/process`): send `bbox + timeRange + maxCloudCoverage + evalscript` → get an **exact-bbox true-color PNG** at 10 m, server-side cloud-mosaicked. Fire it twice (t0, t1) → the before/after pair the VLM will read.
- **Statistical API** (`.../api/v1/statistics`): same bbox + an NDVI/NBR evalscript emitting `dataMask` → **JSON `mean`/`stDev` per interval** → subtract two intervals for `ndvi_delta` / `nbr_delta`. **No image download, no raster math in your code.**
- Auth: token from `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`; tokens are short-lived (~10 min) — **cache + refresh**. Free tier: **10,000 processing units/month, 300/min** — ample for a demo. No credit card.
- ⚠ Verify the exact endpoint path (`/api/v1/...` vs the newer `/process/v1`, `/statistics/v1` — both currently work as of the March-2026 path change) and the Statistical request shape against current CDSE docs before shipping.

**Zero-auth fallbacks (wire at least one — the demo-safety net):**
- **NASA Worldview Snapshots (GIBS):** one no-auth GET → JPEG/PNG for a bbox+date (`https://wvs.earthdata.nasa.gov/api/v1/snapshot?...&TIME=YYYY-MM-DD&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&...`). 250 m, coarse but *instant and unbreakable* — swap `TIME` for before/after. **Note the bbox order for EPSG:4326 is `minLat,minLon,maxLat,maxLon` (lat first).** Good enough for wide-area deforestation.
- **Microsoft Planetary Computer:** zero-auth STAC search → hosted `preview.png` for Sentinel-2 at 10 m (bbox cropping is slightly fiddlier than Sentinel Hub).

**FIRMS fire add-on [MVP-lite]** — trivial, no OAuth: `GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/VIIRS_SNPP_NRT/[W,S,E,N]/[DAY_RANGE]/[DATE]` → CSV of detections. Count rows and sum the `frp` column per window → `firms_fire_count_delta`. Get a free `MAP_KEY` by email; rate limit 5000/10min; **max `DAY_RANGE` = 5** (stitch multiple calls for longer windows). Confidence encoding differs by sensor (VIIRS `l/n/h` vs MODIS `0–100`) — branch on source. Ties fire-suppression levers to observable fire activity.

**Hardening (mandatory, because L3 runs live):**
- **Season-match the windows** — same calendar months across years, or you're measuring seasonal NDVI swing, not policy effect. Non-negotiable.
- **All-cloudy window** → widen the range (Sentinel Hub `maxCloudCoverage` mosaics; single-date GIBS can't filter) → if still empty, return `imagery: null` + flag. **Never fabricate.**
- **Min-bbox guard** — tiny bbox → too few 10 m pixels → garbage stats.
- OAuth **token cache + refresh**; retry-with-backoff on 429/5xx.
- **Cache every derived output** keyed by `(bbox_hash, window, product)` so a rehearsed run is instant and the live demo can't be killed by a slow API.

**[STRETCH] — Google Earth Engine** for Dynamic World "current" fractions, Hansen loss, and `reduceRegion` on state-sized polygons in one call. Powerful, but **only if a teammate already has a verified EE project today** — otherwise the verification wait eats the sprint.

**Datasets/products:** Sentinel-2 L2A (open); ESA WorldCover v200 = 2021, 10 m (CC-BY-4.0, for baseline fractions if used); FIRMS (NASA, open); Sentinel-5P/TROPOMI (open, air stretch, ≥2018); Hansen GFC (stretch, cite Hansen 2013). Record **baseline-year staleness** in the contract.
**Validate:** season-matched windows enforced; NDVI/NBR deltas directionally sane vs known geography (Pará should show loss); cloud/min-bbox/retry guards fire in tests; before/after PNGs render; FIRMS count delta computes.

---

## Layer 3.5 — Counterfactual `[MODELED]` `[MVP = precomputed]`

This is where "impact" becomes defensible instead of fraudulent. **For the MVP it is precomputed, not live** — a curated, cited DiD number stored per hero case in the enriched index.

**MVP — precomputed hero-case counterfactual:**
- For each forest hero case, curate `avoided_loss_km2` + `ci95` + `method` + `cite` from the published impact-evaluation literature (e.g. PPCDAm's matched-municipality DiD). Store it in `layer2_analogs[].precomputed_counterfactual`; surface it tagged `MODELED` with the citation clickable in receipts.
- This is honest *because it is provenance-tagged and cited* — you are reporting a published matched estimate, not inventing one. State the assumptions (siting bias corrected in the source study; leakage/SUTVA and time-varying unobservables not controlled).

**[STRETCH] — live recompute button:** covariate matching (slope/elevation/dist-to-road/baseline forest) + difference-in-differences + CI + placebo, computed in the Python sidecar (`statsmodels`/`linearmodels`; `pysyncon` for synthetic control). Wrap in a **timeout + complexity budget**; if it can't converge in the demo window, fall back to the precomputed number and set `fallback_used: true` (visible in receipts). **Never let the LLM generate the geospatial/stats code as the load-bearing path** — UnivEARTH: LLM-over-Earth-Engine agents hit ~33% accuracy, >58% code-fails-to-run. Bind fixed, unit-tested tools; Gemini narrates, it does not compute.

**Worked example to validate against (citable):** Brazil PPCDAm — the published ~84% deforestation reduction 2004→2012 / ~60% in targeted vs ~47% non-targeted municipalities (the DiD signal). Your precomputed number should match this order of magnitude.
**Validate:** every hero case carries a cited counterfactual + assumptions; the number renders `MODELED` in receipts; (stretch) live path reproduces PPCDAm order of magnitude and the timeout→fallback path is tested.

---

## Layer 4 — Gemini VISION corroboration → three-horizon ImpactReport (Next.js/TS) `[LLM_NARRATIVE]` `[MVP]`

**The VLM's job here is corroboration + translation, NOT measurement.** Frontier VLMs (Gemini included) weren't trained on overhead imagery — they *fail fluently* on RS-specific perception (counting, magnitude, spectral inference) and hallucinate change from illumination/season/misregistration. So **every number in the report traces to an L3/L3.5 tool output; the VLM never sources a quantity.** What the VLM *does* add — and why it earns its place in the pipeline:

1. **Describe the *visible* change** a human would see ("NW quadrant: contiguous canopy fragments into a fishbone road-led clearing pattern") — turns the abstract `ndvi_delta` into something legible and visceral. Landscape-scale patterns are what VLMs *can* read reliably.
2. **Direction cross-check (the honesty feature):** given the tools say "forest loss (NDVI −0.11)", does the image pair *look* consistent? If the picture disagrees with the sign of the computed delta, set `direction_agrees_with_tools: false` and surface a **discrepancy flag**. A VLM that can dispute the numbers is a genuine innovation beat, not decoration.
3. **Drive the before/after visual moment** in the UI.

**Vision call (`@google/genai`, TS):** pass the t0/t1 composites as inline image parts, **interleaving text labels** — `{text:"BEFORE:"}, before, {text:"AFTER:"}, after` — which is the reliable fix for "model doesn't know which image is which." Feed the **identical season-matched composites** used for the numbers, same stretch/colormap, and **explicitly instruct: illumination, season, cloud, and slight misregistration are NOT land-cover change — exclude them.** Force per-quadrant reasoning-before-conclusion, enumerate change categories including an explicit `no_change`, require a visual `evidence` string per claim. Force structure via `responseSchema`. Cost is negligible (~258 tokens/tile, ~$0.0006/pair on `gemini-2.5-flash`).

**Three-horizon report over the tagged evidence:**
- **3y — observed analogues `[OBSERVED]`:** what the analog region's real data actually shows. Lead with it.
- **5–10y — statistical extrapolation `[MODELED]`:** trend projection **with error bars**, method stated. A fitted trend + CI, not a vibe. (In the MVP this can be a simple linear extrapolation of the observed delta with a stated CI.)
- **30y — scenario narrative `[LLM_NARRATIVE]`, flagged `SPECULATIVE_SCENARIO`:** explicitly cordoned; number-free (or every number `[LLM_NARRATIVE]`-tagged). A sophisticated judge will poke here — make it unmistakably labeled.

**Local translation — "smoke days per year in <city>" `[MODELED]` [STRETCH once air/fire is in]:** your most visceral feature and your highest fabrication risk. **Do not let Gemini invent the transfer function.** Drive it from a **published empirical coefficient** (an FRP/upwind-fire → downwind-PM2.5-smoke-day relationship) implemented in code, tagged `MODELED` with the citation in receipts. If no defensible coefficient exists for a case, show a qualitative statement, not a number.

**Gemini API details:** `finishReason` branching (`SAFETY`/`MAX_TOKENS`/`RECITATION`) as in L1; low temperature for the numeric-narration path; `countTokens` to calibrate cost.
**Validate:** every narrative number carries a provenance tag traceable to a tool; the direction cross-check fires (test a case where you feed a mismatched pair and confirm it flags); the 30y section is flagged speculative and number-free; smoke-days (if present) traces to a cited coefficient.

---

## Presentation & signature features

- **Receipts mode `[MVP]` — build it; highest ROI.** Every claim links to its exact evidence: the image pair, the dataset + request, the delta computation, the counterfactual method/CI + citation, or the `LLM_NARRATIVE` tag. This *is* the provenance layer made clickable — the presentation form of the entire credibility thesis, and what separates you from the saturated chatbot category. Fold in the existing **carbon receipt** UI.
- **Policy diff `[STRETCH]`.** Paste two competing bills → two pipeline runs → side-by-side impact cards. Cheap to compose, great demo, on-theme.
- **Narrative-stability meter `[STRETCH]`.** Run L4 3× and surface variance. **Frame precisely:** the `OBSERVED`/`MODELED` numbers are deterministic and do NOT vary — only the *narrative* varies. Sell it as a "narrative-stability meter" (high variance → trust the story less), not "we re-measured three times."
- **Real satellite timelapse `[STRETCH]` — the closing visual.** Season-matched annual composites of the analog region's *actual* history (Sentinel Hub / GIBS), animated. Real, cheap, and fully on-thesis: footage of what observably happened lands harder than any synthetic clip and never risks the honesty brand. This is the emotional payload for the observed horizons.
- **Cut: synthetic 30y AI projection video.** Deliberately dropped, not deferred. For a project whose thesis is *precedent, not prediction*, generating a fake future — even watermarked and cordoned — cuts against the brand and is the lowest-credibility, highest-risk feature. The real timelapse above replaces it. If a judge asks *"why no future visualization?"*, that answer **is** the pitch.

---

## Honest "impact" framing (non-negotiable mechanics)

**Claim:** *"Observe real, satellite-measured land-cover change in regions that enacted analogous policies, corroborate it visually, and report a clearly-labeled, cited counterfactual estimate — with stated assumptions."*
**Never claim:** *"Measure the real causal impact of this (proposed) policy,"* or *"the AI read the deforestation rate off the satellite image."*

- **Per-number provenance tags** — `OBSERVED` (tool-derived), `MODELED` (counterfactual/extrapolation + method + CI + cite), `LLM_NARRATIVE`. Strongest credibility lever; its absence is the classic over-claim tell.
- **Visible assumptions/limitations panel:** non-random siting bias; leakage/SUTVA displacement; time-varying unobservables; "Sentinel-2 change ≠ permanent deforestation"; illumination/season not fully controlled; 10 m / 250 m resolution error; baseline-year staleness; (air stretch) S5P NO₂ confounded by meteorology + economic activity; COVID = policy *and* recession.
- **Positioning:** the analog-retrieval + honest-counterfactual + VLM-visual-cross-check + honesty layer *is* the novelty; cite the saturated copilot category as prior art and differentiate.

---

## Consolidated dataset & access table (REST-first for the 48h build)

| Dataset / product | Role | Access | Auth / friction | License |
|---|---|---|---|---|
| **Sentinel Hub — Process API (CDSE)** | Before/after true-color PNG at 10 m, exact bbox | `POST /api/v1/process` | OAuth client-creds; **no verification wait**; 10k PU/mo | Open (Copernicus) ✅ |
| **Sentinel Hub — Statistical API (CDSE)** | Numeric NDVI/NBR `mean` per interval → deltas | `POST /api/v1/statistics` | same OAuth | Open ✅ |
| **NASA Worldview Snapshots (GIBS)** | Zero-auth before/after fallback (250 m) | `GET wvs.earthdata.nasa.gov/api/v1/snapshot` | **none** | Open ✅ |
| **Microsoft Planetary Computer** | Zero-auth 10 m Sentinel-2 fallback | STAC → hosted `preview.png` | **none** | Open ✅ |
| **NASA FIRMS** | Fire-count / FRP delta (add-on) | `GET /api/area/csv/[KEY]/...` | free MAP_KEY (email) | Open ✅ |
| **Curated forest hero-case index** | Analog seeds + region bbox + window + cited counterfactual | hand-built → Mongo | — | your data |
| **MongoDB Atlas Vector Search** | Analog k-NN retrieval + cache + receipts | `$vectorSearch` (existing repo) | free tier | service |
| **Gemini 2.5 Flash/Pro + `gemini-embedding-001`** | Extraction · re-rank · vision · embeddings | `@google/genai` (TS) | API key | API (verify pricing/IDs) |
| **Auth0** | Login / MFA / saved analyses (existing) | `@auth0/nextjs-auth0` | existing | service |
| **Nominatim/OSM** | Geocode → bbox (1 req/s, custom UA) | `geopy` (sidecar) | none | ODbL (attribution) |
| **ESA WorldCover v200** (11-class, 10 m) | Taxonomy + baseline fractions | Sentinel Hub / PC | none | CC-BY-4.0 ✅ |
| **Sentinel-5P / TROPOMI** `[STRETCH]` | NO₂ / aerosol (air domain) | Sentinel Hub Statistical / GEE | as above | Open ✅ |
| **OpenAQ** `[STRETCH]` | Ground-truth PM2.5/NO₂ cross-check | OpenAQ API | key | Open ✅ |
| **GADM v4.1 / geoBoundaries** `[STRETCH]` | Admin polygons (sharper clip) | `geopandas` | none | GADM non-commercial ⚠ / geoBoundaries CC-BY |
| **Google Earth Engine** `[STRETCH]` | Dynamic World / Hansen / big-AOI reduce | `earthengine-api` | **service acct + verified project (2–3d wait)** ⚠ | free noncommercial |
| **Hansen GFC** `[STRETCH]` | Deforestation outcome variable | GEE | via GEE | cite Hansen 2013 |

---

## Phased build order (48h, sidecar seam explicit; each layer validated independently)

- **Phase 0 — Contract + skeleton seam (first).** Freeze the JSON contract as a shared TS type + Python Pydantic model. Stand up the FastAPI sidecar with a `/eo` endpoint that returns **canned** contract fragments. Wire Next.js `/api/analyze` → sidecar → back. Everything downstream can now be built against stubs.
- **Phase 1 — Enriched analog index (the spine).** Curate 8–15 forest hero cases with bbox + window + outcome + citation + precomputed counterfactual; load into Atlas Vector Search. Prove retrieval + Gemini re-rank, incl. rejecting a planted false analog. *(Reuses existing repo vector search.)*
- **Phase 2 — Real EO in the sidecar (no LLM).** Sentinel Hub OAuth + Process (before/after PNG) + Statistical (NDVI/NBR delta) for a hardcoded bbox; FIRMS fire delta; GIBS zero-auth fallback. Prove the *real* mapping + season-matching + cloud/min-bbox/cache guards standalone.
- **Phase 3 — Gemini extraction (L1).** Harden the existing TS structured-output call: mechanisms + levers + source-spans + WorldCover enum; validators + `finishReason`/RECITATION handling.
- **Phase 4 — Gemini vision corroboration (L4).** Before/after image-pair → visible-change description + **direction cross-check flag** + three-horizon report over tagged evidence, provenance-tagged. Test the discrepancy flag with a mismatched pair.
- **Phase 5 — Receipts mode + wire the full path.** Every claim resolves to its evidence; precomputed counterfactual rendered `MODELED` with citation; carbon receipt folded in. Cache hero-case outputs for demo determinism.
- **Phase 6 — Stretch, in priority order:** polygons → air-quality charts → live counterfactual button → policy diff → stability meter → real timelapse. *(The synthetic projection video is intentionally NOT on this list — see Presentation.)*
- **Acceptance gate (not nice-to-haves):** numbers from tools not pixels · every number provenance-tagged · ≥1 real analog retrieved + re-rank-verified · real before/after PNG pair rendered from a live EO call · VLM direction cross-check present · precomputed counterfactual shown with CI + citation · visible assumptions panel · receipts resolve for every claim.

---

## Configuration, dependencies, cost

**Next.js app (existing repo).** Env: `GEMINI_API_KEY`, `MONGODB_URI`, Auth0 vars (already set up), `EO_SIDECAR_URL`. Deps: `@google/genai`, `mongodb`, `@auth0/nextjs-auth0` — all present. ⚠ Per repo `AGENTS.md`, this is a **modified Next.js** — after `npm install`, read `node_modules/next/dist/docs/` before writing route/handler code.

**Python EO sidecar (new, thin).** FastAPI + `httpx`/`requests` + `pydantic` v2 + `geopy`. **MVP needs NO GDAL/GEE/geopandas** — it's pure REST over Sentinel Hub / FIRMS / GIBS, which is the whole point of the REST-first choice. Env: `SH_CLIENT_ID`, `SH_CLIENT_SECRET` (CDSE OAuth), `FIRMS_MAP_KEY`. *(Stretch adds* `geopandas`/`pyogrio`/`shapely` for polygons and `earthengine-api`/`statsmodels` for the live counterfactual — those pull GDAL/PROJ and want conda/mamba; keep them out of the MVP.)*
**The seam:** Next.js POSTs `{bbox, window_t0, window_t1, domain}` → sidecar returns `{layer3_observed, before_png, after_png}`. Sidecar owns geospatial/EO; Next.js owns Gemini + Mongo + Auth0 + UI. Deploy sidecar locally (or a small container) for the demo; localhost is fine.

**Orchestrator:** a **plain driver** in the Next.js API route: `l1() → l2() → callSidecar(l2_5+l3) → attachPrecomputed(l3_5) → l4()`, passing the contract forward and caching per input hash in Mongo — **not** an agentic LLM loop (UnivEARTH: >58% codegen failure).
**Cost (order of magnitude; ⚠ verify current Gemini pricing):** L1 (long policy in, small JSON out) + L2 re-rank (small) + L4 vision (~$0.0006 image tokens + evidence JSON in, narrative out). Roughly **sub-cent to cents per run** on `gemini-2.5-flash`; `countTokens` to calibrate.

**Failure-mode handling (state behavior for each external call):**
- Sentinel Hub 429/5xx/timeout → retry-with-backoff → **GIBS Snapshots zero-auth fallback** → if still failing, `imagery:null` + flag.
- OAuth token expiry → cache + refresh proactively.
- S2 all-cloudy → widen window → `imagery:null` + flag (never fabricate).
- FIRMS empty → header-only CSV → guard against zero rows; respect `DAY_RANGE ≤ 5`.
- Nominatim → `RateLimiter` 1 req/s + custom UA; miss → surface candidates; tiny bbox → min-pixel guard. **Hero-case bboxes pre-stored → demo never depends on live geocode.**
- Gemini `SAFETY`/`RECITATION`/`MAX_TOKENS` → structured error + retry, never fabricate.
- MongoDB unreachable → local in-memory index over the same hero cases.
- Sidecar down → Next.js serves cached hero-case contract; demo continues.
- (Stretch) live DiD can't converge → precomputed counterfactual, `fallback_used=true` in receipts.
- (Stretch) timelapse frames slow/missing → fall back to the static before/after pair; demo continues.

---

## Verification (end-to-end)

- **Per-layer:** the validation bullets above.
- **End-to-end:** run canonical forest prompts through the full pipeline; confirm every narrative number traces to a tool output and carries a provenance tag; the retrieved analog is mechanism-verified; a **real** before/after pair renders from a live EO call; the VLM direction cross-check fires; the precomputed counterfactual shows CI + citation; assumptions panel + receipts render.
- **Demo determinism:** hero-case outputs cached in Mongo; zero-auth GIBS fallback wired; hero-case bboxes pre-stored; rehearse the "paste a novel policy" moment with a known-good analog present in the index.

---

## Licensing & attribution checklist (before shipping/presenting)

Attribute **Copernicus Sentinel-2/5P**, **NASA FIRMS / GIBS**, **ESA WorldCover (CC-BY-4.0)**, **Nominatim/OSM (ODbL)**, **Climate Policy Radar** (if used), and (stretch) **OpenAQ**, **Hansen et al. 2013 (Science)**. **GADM & WDPA are non-commercial** (swap to geoBoundaries/Natural Earth for any commercial path). GEE noncommercial only. Confirm Gemini API terms for imagery you send.

---

## Key citations (primary sources)

- Gemini structured output / vision / SDK: `ai.google.dev/gemini-api/docs/structured-output`, `.../image-understanding`, `github.com/googleapis/js-genai`; finish reasons incl. RECITATION: `ai.google.dev/api/generate-content`; pricing/models: `ai.google.dev/gemini-api/docs/pricing`, `.../models`
- Sentinel Hub on CDSE — Process + Statistical + auth + quotas: `documentation.dataspace.copernicus.eu/APIs/SentinelHub/` (Process, Statistical, Overview/Authentication, Quotas); March-2026 API path change: `dataspace.copernicus.eu/news/2026-3-9-api-path-structure-updates-sentinel-hub-services`
- NASA GIBS / Worldview Snapshots: `nasa-gibs.github.io/gibs-api-docs/access-basics/`, `wvs.earthdata.nasa.gov`
- Microsoft Planetary Computer: `planetarycomputer.microsoft.com/docs/quickstarts/using-the-data-api/`
- NASA FIRMS API + MAP_KEY: `firms.modaps.eosdis.nasa.gov/api/area/`, `.../api/map_key/`, `earthdata.nasa.gov/data/tools/firms/faq`
- MongoDB Atlas Vector Search: `mongodb.com/docs/atlas/atlas-vector-search/`
- ESA WorldCover: `developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200`; Sentinel-5P NO₂: `.../COPERNICUS_S5P_OFFL_L3_NO2`
- Climate Policy Radar / CCLW: `climatepolicyradar.org`, `climate-laws.org`
- GADM: `gadm.org/data.html`; geoBoundaries: `geoboundaries.org`; Nominatim policy: `operations.osmfoundation.org/policies/nominatim/`
- LLM+EO brittleness (UnivEARTH, ~33% acc / >58% code fail): `arxiv.org/abs/2504.12110`; prior-art copilots: `github.com/microsoft/Earth-Copilot`
- Counterfactual impact / ~50–65% siting bias: `pmc.ncbi.nlm.nih.gov/articles/PMC4621053/`, `journals.plos.org/plosone/article?id=10.1371/journal.pone.0132590`
- Wildfire-smoke → PM2.5 smoke-days (local translation, air stretch): Childs et al. 2022 (Environ. Sci. Technol.) — use a documented coefficient.
- GEE noncommercial tiers (verification wait, stretch): `developers.google.com/earth-engine/guides/noncommercial_tiers`
