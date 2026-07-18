# Downwind — Front-End Implementation Plan

A step-by-step plan to turn the current functional MVP ([`src/app/analyzer.tsx`](src/app/analyzer.tsx)) into a **stage-winning demo UI**, tuned to the Deloitte rubric (Impact 30 / Innovation 25 / Feasibility 25 / Presentation 20) and the MLH Gemini / MongoDB / Auth0 tracks.

> **Scope rule for this doc:** this is a *front-end* plan. It touches backend only where the UI is otherwise impossible (two tiny, called-out changes). Everything else renders from the `AnalysisResult` we already return.

---

## 0. Guiding principles

1. **Demo-first.** The judge sees a projector for ~3 minutes. Optimize for *legibility from the back of a room* and a visible "wow" beat, not feature count.
2. **Dependency-light = feasibility points.** No component library, no chart library, no map SDK. Tailwind 4 + hand-rolled inline SVG only. Every dependency added is a feasibility risk and a Green-AI contradiction. (Current deps: React 19, Next 16, Tailwind 4 — keep it that way.)
3. **Render what we already compute.** The `AnalysisResult` (see [`src/lib/pipeline.ts`](src/lib/pipeline.ts#L23-L35)) already carries screening, a 6-dimension impact surface, 3 horizons, analogues, dual-mode text, a self-consistency score, and a carbon receipt with a **per-model token breakdown**. The MVP under-renders all of it. The win is mostly *presentation of existing data*.
4. **Honesty is the brand.** Confidence labels (observed / extrapolated / speculative) and "est." on carbon numbers are differentiators — keep them loud, never hide them.
5. **Respect `AGENTS.md`.** This is a modified Next.js 16. Before writing any route handler, streaming, or metadata code, **read the relevant guide in `node_modules/next/dist/docs/`** — do not assume App Router APIs from memory.

---

## 1. Prerequisites & two enabling backend edits

Do these first; the UI phases depend on them.

### 1.1 Read the framework docs (gate)
- Skim `node_modules/next/dist/docs/` for: App Router file conventions, `route.ts` handlers, streaming/`ReadableStream` responses (only if you attempt SSE in Phase 11), and `Metadata`. Confirm nothing below assumes an old API.

### 1.2 Pass `loc` through to the client *(enables the map, Phase 8)*
The vector-search `$project` currently strips coordinates. In [`src/lib/pipeline.ts`](src/lib/pipeline.ts#L74-L84):
- Add `loc: 1` to the `$project` stage.
- Add `loc?: { type: "Point"; coordinates: [number, number] }` to the `Analogue` type ([`src/lib/pipeline.ts`](src/lib/pipeline.ts#L14-L21)).
- That's it — the seed already stores GeoJSON `loc` for all four case studies ([`data/case-studies.json`](data/case-studies.json)).

### 1.3 Decide the "Receipts" imagery strategy *(enables Phase 7)*
There are **no satellite image URLs** in the data today. Pick one, in order of preference for a hackathon:
- **(A) Static seeded thumbnails (recommended).** Drop 4 before/after image *pairs* into `public/receipts/<policyId>-{before,after}.jpg` (screenshots from Sentinel Hub / NASA Worldview for each `loc`, captured offline). Add an optional `receipts?: { before: string; after: string; caption: string }` field to the seed docs and to `Analogue`. Zero runtime API calls — matches the "never call a live EO API on stage" rule in the README.
- **(B) Graceful placeholder.** If images aren't ready, render the `observedDelta` text inside a "satellite receipt" frame with a subtle scanline/loading-tile motif. Still reads as receipts; no new assets.
- Ship (B) first so the section always renders; upgrade to (A) if time allows.

---

## 2. Design foundation (do once, reuse everywhere)

**Goal:** a small, consistent visual system so every card looks like one product.

### 2.1 Tokens & theme — `src/app/globals.css`
- Define CSS custom properties for the palette so light/dark and projector contrast are controlled in one place:
  - Surface levels: `--bg`, `--surface`, `--surface-2`, `--border`.
  - **Confidence scale** (used by dimensions *and* horizons — unify them): `--c-observed` (emerald), `--c-extrapolated` (amber), `--c-speculative` (rose).
  - **Direction scale**: worse (rose), better (emerald), mixed (amber), negligible (neutral).
  - Brand accent: emerald (already the CTA color).
- Keep the existing `prefers-color-scheme` dark support; make sure every new token has a dark value.

### 2.2 Shared primitives — new folder `src/components/ui/`
Tiny, dumb, reusable. No logic.
- `Card.tsx` — bordered surface with consistent padding/radius (replaces the repeated `rounded-lg border border-neutral-200 p-4 …` string).
- `Badge.tsx` — pill with `tone` prop (`observed | extrapolated | speculative | worse | better | mixed | negligible | neutral`). Centralizes the color maps currently inlined in `analyzer.tsx` (`CONF_STYLE`, `DIR_ICON`).
- `SectionHeading.tsx` — the small uppercase label used above each block.
- `Tooltip.tsx` — CSS-only hover tooltip (for "what is NDVI?", "how is CO₂ estimated?"). Keeps judges from needing you to explain jargon.

### 2.3 Centralize the enums the UI reads
- Reuse `IMPACT_DIMENSIONS` and `CLIMATE_LEVERS` from [`src/lib/schemas.ts`](src/lib/schemas.ts) for labels, icons, and the observable-source tooltip text. Add a small `DIMENSION_META` map (icon + one-line "measured by" string) next to them so the impact grid can show *which satellite* backs each dimension.

---

## 3. Information architecture (the page, top to bottom)

Restructure the single scroll into a deliberate narrative that mirrors the pitch:

```
┌ App shell (sticky header: logo · mode toggle · account)
│
├ 1. HERO / INPUT           ← the hook + the paste box + sample library
├ 2. PIPELINE STEPPER       ← live "Screen → Retrieve → Ground → Synthesize"
│
├── results (appear after run) ──────────────────────────────
├ 3. SCREENING VERDICT       ← "no bill is climate-neutral" — the thesis
├ 4. HEADLINE + DUAL MODE    ← local metric as a big stat + Simple/Briefing
├ 5. IMPACT SURFACE          ← 6-dimension heatmap grid
├ 6. THREE HORIZONS          ← 3/10/30y confidence timeline
├ 7. RECEIPTS                ← analogues w/ before/after + observed delta
├ 8. PRECEDENT MAP           ← 2dsphere regions on a world map
├ 9. GREEN-AI RECEIPT        ← per-model tokens, Wh, CO₂, cache, consistency
└ 10. SAVED WORKSPACES       ← Auth0: history + shareable link
```

Componentize each numbered block as `src/components/report/<Name>.tsx`, each taking a typed slice of `AnalysisResult`. `analyzer.tsx` becomes a thin orchestrator: state + fetch + layout.

---

## 4. Build phases (in order)

Each phase is independently demoable — you can stop after any phase and still have a working, better app.

### Phase 1 — App shell & hero *(1–2h)*
- **`src/components/AppShell.tsx`**: sticky top bar — wordmark "Downwind · *satellites keep the receipts*", a global **Simple / Briefing** segmented toggle (lift `mode` state up so it governs the whole report, not just one card), and the account cluster (email + Log out, or Sign in) moved out of `page.tsx`.
- **Hero** (signed-out and pre-run state): the one-line thesis from the README — *"Climate-policy debates run on rhetoric; satellites have been keeping receipts for 40 years."* — plus a subhead and the sign-in CTA. This is the first projector frame; make it large and centered.
- Keep the Auth0 gate from [`src/app/page.tsx`](src/app/page.tsx): signed-out users see hero + Sign in; signed-in users see the analyzer.

### Phase 2 — Input panel & sample library *(1–2h)*
- Replace the lone textarea with an **`InputPanel`**:
  - Larger textarea, char counter, and the existing 20-char minimum gating the button.
  - **Sample chips** (not one button): 3–4 pre-written bills that each map to a seeded analogue and *look non-climate* — e.g. the Ontario budget cut (already `SAMPLE`), a highway expansion, a zoning reform, a farm subsidy. Clicking fills the textarea. This lets you demo the "hidden lever" reveal on demand and de-risks live typing.
  - Primary CTA "Retrieve precedent" with loading state.

### Phase 3 — Live pipeline stepper *(2h)*
The single most valuable *presentation* upgrade: the current UI shows a dead "Analyzing…" button while Pro synthesis runs (several seconds).
- **`PipelineStepper.tsx`**: four steps — **Screen** (Flash) → **Retrieve** (Atlas Vector Search) → **Ground** (per-dimension observables) → **Synthesize** (Pro, ×N). Each shows the *model/tech* it uses, reinforcing the Gemini + MongoDB stories while the judge watches.
- **Feasibility-first approach:** since `/api/analyze` returns all-at-once, drive the stepper on the **client** with timed stage transitions during the `fetch` (advance on a timer, snap all to "done" on response). Honest enough for a demo and zero backend change.
- **Stretch (Phase 11):** convert `/api/analyze` to a streamed `ReadableStream` that emits real stage events (`screen`/`retrieve`/`synthesize`) — *read the Next 16 streaming docs first*.

### Phase 4 — Screening verdict *(1h)*
This is the thesis on screen; make it the first result block and the boldest.
- **`ScreeningCard.tsx`** from `result.extraction`:
  - Big verdict line: **"Climate-relevant"** vs **"No lever found"** driven by `screening.assumedNeutral`.
  - `matchedLevers` as labeled chips using `CLIMATE_LEVERS` (emissions / land_use / heat / water / fire / air_quality) with an icon each.
  - `screening.rationale` prominent — this is the "here's the *hidden* lever we caught" sentence.
  - `levers[]` as a small list, visually flagging `obvious: false` (the *hidden/economic* levers) with a distinct "hidden lever" tag and a direction arrow (increases/decreases/ambiguous). Hidden levers are the innovation story — surface them.

### Phase 5 — Headline metric + dual mode *(1–2h)*
- **`Headline.tsx`**: render `result.localTranslation` (e.g. *"≈ +6 smoke days/year in Toronto"*) as a **huge stat** — this is the visceral, Impact-scoring number. Big number, small label.
- **`Narrative.tsx`**: the `simple` vs `briefing` text governed by the *global* mode toggle from Phase 1. Style them differently on purpose — Simple = large, warm, short; Briefing = denser, monospace citations feel. Same JSON, two audiences = the "renders twice" differentiator, made obvious.

### Phase 6 — Impact surface heatmap *(2h)*
Upgrade the current 2-column text cards into a **`ImpactSurface.tsx`** grid that reads as one instrument:
- One tile per dimension in `result.dimensions`, ordered by the canonical `IMPACT_DIMENSIONS` order (so the grid is stable across runs).
- Each tile: dimension icon + label, a **direction glyph** (↑ worse / ↓ better / ~ mixed / · negligible), a **confidence-tinted border or corner** (observed/extrapolated/speculative from the unified scale), the `finding` text, and a **"measured by"** micro-caption (the satellite source from `DIMENSION_META`, e.g. "Sentinel-5P NO₂"). Tooltip explains each observable.
- Dimensions the model *didn't* return should render as muted "not assessed" tiles so the full 6-surface is always visible (reinforces "full climate surface", not cherry-picked).

### Phase 7 — Three horizons timeline *(1h)*
- **`Horizons.tsx`**: render `result.horizons` (3/10/30y) as a **left-to-right timeline** rather than three equal cards. Bar/line width or opacity encodes decreasing confidence (`label`: observed → extrapolated → speculative). Label the 30y card explicitly *"scenario, not forecast"* — pre-empts the "you can't predict 30 years" judge attack the README calls out.

### Phase 8 — Receipts + precedent map *(2–3h)*
The "receipts" concept is the memorable hook; currently it's a plain text list.
- **`Receipts.tsx`** from `result.analogues`:
  - Each analogue as a **receipt card**: title, `region · enactedYear`, a **match-score meter** (`score`, currently shown as a bare %), and the `observedDelta` styled as the satellite evidence line.
  - Before/after imagery per the Phase-1.3 strategy (static pairs or framed placeholder). A subtle before→after slider or hover-swap sells "from orbit" without a library.
- **`PrecedentMap.tsx`** *(needs the Phase 1.2 `loc` passthrough)*:
  - A lightweight **inline-SVG world map** (equirectangular — an offline TopoJSON/simplified world outline shipped as a static asset, or a tasteful abstract graticule). Plot each analogue at `loc.coordinates` as an emerald pin sized by `score`. Toronto/the user's region marked as the "downwind" point.
  - This makes the **MongoDB `2dsphere`** story *visible* — judges see geography, not a schema claim. Keep it dependency-free (no Mapbox/Leaflet → no API key, no CSP issue, no feasibility risk).

### Phase 9 — Green-AI carbon receipt *(1–2h)*
Directly serves **Deloitte AI for Green** — make it a first-class panel, not a footnote strip.
- **`CarbonReceipt.tsx`** from `result.receipt`:
  - Headline row: `totalTokens`, `estWattHours` (Wh), `estGramsCO2` (g CO₂e) — each with an **"est."** tag and a tooltip citing the assumptions (0.3 Wh/1k tokens, 400 gCO₂/kWh from [`src/lib/greenai.ts`](src/lib/greenai.ts#L20-L24)).
  - **Per-model breakdown bar** from `receipt.byModel` — this data already exists and is currently unused in the UI. Show a stacked bar: Flash (cheap screening) vs Pro (synthesis) vs embedding, tokens each. The visual point: *"the expensive model runs least."* That's the Green-AI thesis in one chart.
  - **Cache-hit state**: when `receipt.cached`, show a bold "cache hit — ~0 marginal cost" and a struck-through vs-uncached comparison. Re-running the sample on stage → instant + green = a planned demo beat.
  - **Self-consistency**: move `result.agreement` here as a labeled meter ("dimensions agreed across N runs: 92%"), with a tooltip on what N is (`CONSISTENCY_RUNS`).

### Phase 10 — Saved workspaces & sharing (Auth0) *(2–3h, optional but strong)*
Makes the Auth0 track "non-trivial" and adds Impact (people revisit/share findings).
- **Backend (small):**
  - Persist each analysis with the owning `session.user.sub` (extend the `analyses` insert in [`src/lib/pipeline.ts`](src/lib/pipeline.ts#L175) or do it in the route). Note: current cache is keyed only by `inputHash` — add a separate `user_analyses` record so history is per-user without breaking the shared cache.
  - `GET /api/analyses` → the signed-in user's recent runs (title + date + inputHash).
  - `GET /api/report/[hash]` → a read-only fetch for sharing.
  - *Read the Next 16 route-handler & dynamic-segment docs before writing these.*
- **Frontend:**
  - **`WorkspaceDrawer.tsx`**: a "History" list of past analyses; click to re-hydrate the report from cache (instant + cache-hit carbon = another green beat).
  - **Share button**: copies `/report/[hash]` link. A public read-only report page (`src/app/report/[hash]/page.tsx`) reusing the same report components. This is the "shareable reports" Auth0 bullet, realized.
  - Surface the Auth0 features you actually enabled: a tiny "Secured by Auth0 · passwordless + MFA" line near the account menu.

### Phase 11 — Polish pass *(2–3h, do last)*
- **Loading skeletons** for each result block (not just the button) so results feel like they *arrive*.
- **Entrance animation**: stagger result blocks in with a short `translateY`/fade (CSS only). Reveal order = narrative order.
- **Projector readiness**: bump base font size, test at 1080p from ~3 m, ensure confidence colors are distinguishable (add the direction glyph so it's not color-only → accessibility + colorblind judges).
- **Empty/error states**: the current inline error is fine; give it an icon and a retry.
- **Responsive**: the impact grid and horizons should collapse to single-column on narrow screens; verify the header toggle wraps.
- **`layout.tsx` metadata / OG image** so a shared report link unfurls nicely (title/description already set — add an OG image; *check the Next 16 metadata docs*).
- **Stretch:** real streamed stepper (see Phase 3 stretch).

---

## 5. File-by-file change map

| Path | Action |
| --- | --- |
| `src/lib/pipeline.ts` | Add `loc` to `$project` + `Analogue` type (Phase 1.2); optional per-user persistence (Phase 10). |
| `data/case-studies.json` + `public/receipts/` | Optional `receipts` image fields + static pairs (Phase 1.3 / 7). |
| `src/app/globals.css` | Design tokens: confidence/direction scales, surfaces (Phase 2). |
| `src/components/ui/*` | `Card`, `Badge`, `SectionHeading`, `Tooltip` (Phase 2). |
| `src/components/AppShell.tsx` | Sticky header, global mode toggle, account cluster (Phase 1). |
| `src/components/InputPanel.tsx` | Textarea + sample chips (Phase 2). |
| `src/components/PipelineStepper.tsx` | Live 4-step progress (Phase 3). |
| `src/components/report/ScreeningCard.tsx` | Screening verdict + hidden levers (Phase 4). |
| `src/components/report/Headline.tsx` + `Narrative.tsx` | Local metric stat + dual-mode text (Phase 5). |
| `src/components/report/ImpactSurface.tsx` | 6-dimension heatmap grid (Phase 6). |
| `src/components/report/Horizons.tsx` | 3/10/30y timeline (Phase 7). |
| `src/components/report/Receipts.tsx` | Analogue receipts + imagery (Phase 7). |
| `src/components/report/PrecedentMap.tsx` | Inline-SVG 2dsphere map (Phase 8). |
| `src/components/report/CarbonReceipt.tsx` | Per-model token bar, cache, consistency (Phase 9). |
| `src/components/WorkspaceDrawer.tsx` | History + share (Phase 10). |
| `src/app/analyzer.tsx` | Slim down to state + fetch + layout of the above. |
| `src/app/page.tsx` | Hero + gate; delegate chrome to `AppShell`. |
| `src/app/api/analyses/route.ts`, `src/app/report/[hash]/page.tsx` | History + shared report (Phase 10). |

---

## 6. Rubric traceability (what each phase buys you)

| Rubric / track | Carried by |
| --- | --- |
| **Deloitte Impact (30)** | Screening thesis (P4), headline local metric (P5), full impact surface (P6), shareable reports (P10). |
| **Deloitte Innovation (25)** | Hidden-lever detection (P4), receipts + map (P7–8), dual-mode-from-one-JSON (P5). |
| **Deloitte Feasibility (25)** | Dependency-light build, per-model carbon bar + cache beat (P9), everything renders from existing data. |
| **Deloitte Presentation (20)** | Pipeline stepper (P3), heatmap + timeline + map visuals (P6–8), polish pass (P11). |
| **MLH Gemini** | Stepper names Flash/Pro/embeddings (P3); structured outputs already drive the whole UI. |
| **MLH MongoDB** | Precedent map makes `2dsphere` visible (P8); cache-hit beat shows the result cache (P9). |
| **MLH Auth0** | Gate + "passwordless + MFA" surfacing (P1/P10); saved workspaces + shareable reports (P10). |

---

## 7. Suggested order & time budget (~1 hackathon day of FE)

1. **P1 + P2 (design tokens, shell, input, backend `loc` edit)** — ~3h. Foundation; unblocks everything.
2. **P4 + P5 + P6 (screening, headline/dual-mode, impact grid)** — ~4h. This alone is a dramatically better demo.
3. **P3 (pipeline stepper)** — ~2h. Highest presentation-per-hour.
4. **P9 (carbon receipt)** — ~2h. The Deloitte "AI for Green" money shot.
5. **P7 + P8 (receipts + map)** — ~3h. The memorable hook; do the placeholder version if short on time.
6. **P11 (polish)** — ~2h. Always leave time for this; it's 20% of the score.
7. **P10 (workspaces/sharing)** — only if ahead of schedule.

**Minimum winning cut if time collapses:** P1 → P4 → P5 → P6 → P9 → P11. That renders the whole thesis, the impact surface, and the Green-AI receipt beautifully, all from data we already return, with zero new dependencies.

---

## 8. Open decisions to confirm before building

- **Receipts imagery:** static seeded pairs (best) vs framed placeholder (safe)? Default to placeholder now, upgrade if time.
- **Stepper honesty:** client-timed (feasible) vs real SSE streaming (impressive, riskier)? Default client-timed.
- **Map source:** ship a simplified world outline asset, or an abstract graticule? Either is dependency-free; pick based on the offline asset you can get quickly.
- **Sample bills:** finalize the 3–4 sample chips so each maps cleanly onto a seeded analogue for a reliable live demo.
