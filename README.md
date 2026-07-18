# Downwind

**Climate-policy debates run on rhetoric; satellites have been keeping receipts for 40 years. Downwind connects the two.**

> Paste any bill — transport, housing, agriculture, trade, defense. Downwind screens it for hidden climate levers, finds real regions that enacted something similar, and reports what observably happened next, from orbit.

---

## The pitch

This summer, wildfire smoke pushed Toronto's air quality to among the worst on Earth. Everyone argued about which policies made it worse — with **zero evidence on any side**. But smoke was just the visible symptom. Climate consequences hide inside housing bills, highway budgets, trade deals — policies that never mention the word *"climate."* Satellites have been recording those consequences for 40 years. **Nobody connects the two. We built the connector.**

Downwind doesn't forecast — an LLM "30-year forecast" is confident confabulation any domain judge will attack. It **retrieves observed precedent** and labels everything by how much we actually know.

## What it does

Paste any bill. Downwind first **screens** it for hidden climate levers — a highway expansion is an emissions bill, a zoning reform is a heat-island bill, a farm subsidy is a land-use bill. **No policy is assumed climate-neutral until checked.**

It then finds real regions that enacted similar policies and reports what observably happened next, from orbit, across the **full climate surface** — each grounded in satellite evidence, labelled by confidence (3 years from observed precedent, 30 flagged as scenario), with **Receipts mode** linking every claim to the exact image pair and dataset behind it.

| Impact dimension | Satellite observable |
| --- | --- |
| Air quality | Sentinel-5P aerosols / NO₂ · OpenAQ ground truth |
| Extreme heat | Landsat thermal (surface temperature) |
| Vegetation & land cover | NDVI · NBR burn severity |
| Flood & drought | Sentinel-1 flood extent · NDWI |
| Emissions | Sentinel-5P column densities |
| Water resources | NDWI · surface-water extent |

Because the audience is lawmakers and the people they answer to, every analysis renders **twice** from the same JSON:

- **Briefing mode** — mechanisms, confidence intervals, citations.
- **Simple mode** — a TL;DR a five-year-old could follow (*"This bill means more very hot days and dirtier air in your city within 3 years"*), plus local numbers you actually feel: smoke days, extreme-heat days, flood-risk change where you live.

## How we built it

**The Precedent Engine:**

1. **Screen + extract** — Gemini Flash screens each bill against our climate-lever taxonomy and extracts mechanisms into structured JSON. → [`src/lib/schemas.ts`](src/lib/schemas.ts)
2. **Retrieve** — MongoDB Atlas **Vector Search** over Climate Policy Radar embeddings finds analogous enacted policies; a **`2dsphere`** geospatial index maps analogue regions to imagery. → [`src/lib/pipeline.ts`](src/lib/pipeline.ts)
3. **Ground per dimension** — real observables are computed per impact dimension — NDVI, NBR, Landsat thermal, NDWI, Sentinel-1, Sentinel-5P — and **Gemini Pro** interprets image pairs + numbers, with function calls into **NASA FIRMS** and **OpenAQ** ground truth.
4. **Dual output + self-consistency** — both output modes are generated from the same analysis in one pass and cached in Atlas; each analysis runs **N× with variance shown in the UI** (`CONSISTENCY_RUNS`).
5. **Auth + sharing** — **Auth0** handles passwordless sign-in with optional MFA, saved workspaces, and shareable reports.

**One hard rule throughout: pasted policy text can never write to the evidence graph.** User input drives *retrieval and interpretation only* — it never mutates the seeded precedent corpus.

## Hackathon tracks

| Track | How Downwind hits it |
| --- | --- |
| **Deloitte — Best Environmental Hack / AI for Green** *(target)* | Climate decision-support for lawmakers, graded Impact / Innovation / Feasibility / Presentation. **Green-AI** is built in: cheap Flash/Gemma for screening, Pro only for synthesis, aggressive Atlas caching, and a live **tokens-per-analysis carbon receipt**. |
| **MLH — Best Use of Gemini API** | Structured outputs (`responseSchema`), multimodal image-pair reasoning, function-calling into FIRMS/OpenAQ, tiered models, self-consistency. |
| **MLH — Best Use of MongoDB Atlas** | Vector Search over policy embeddings + `2dsphere` geospatial index + result cache. |
| **MLH — Best Use of Auth0** | Non-trivial: passwordless **magic-link** login + optional **MFA**, saved workspaces, shareable reports. |
| **Phoebe — decision-support agent** | An agent that helps people make better policy decisions. |

## Architecture

```
Paste any bill
      │
      ▼
[Gemini Flash] screen vs lever taxonomy + extract ──► JSON (nothing assumed neutral)
      │
      ▼  embed(searchQuery) → gemini-embedding-001 (768-dim)
[MongoDB Atlas] $vectorSearch on `policies` ──► enacted analogues + observed deltas
      │
      ▼
[Gemini Pro] interpret observables per dimension ──► impact surface + 3/10/30y + local metric
      │                                                + Briefing & Simple (one pass)
      ▼
run N× → self-consistency  ·  cache in `analyses`  ·  🌱 carbon receipt
```

## Tech stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4 + TypeScript
- **Gemini API** via `@google/genai` — tiered models in [`src/lib/gemini.ts`](src/lib/gemini.ts)
- **MongoDB Atlas** (Vector Search + geospatial) — [`src/lib/mongodb.ts`](src/lib/mongodb.ts)
- **Auth0** (`@auth0/nextjs-auth0` v4) — [`src/lib/auth0.ts`](src/lib/auth0.ts), [`src/proxy.ts`](src/proxy.ts)

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in the values below
```

### 2. Gemini

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → `GEMINI_API_KEY`.

### 3. MongoDB Atlas

1. Create a free cluster and put its SRV string in `MONGODB_URI`.
2. Seed the case-study corpus (embeds + inserts, creates the geo-index):

   ```bash
   npm run seed
   ```

3. In the Atlas UI, create a **Vector Search index** named `policy_vector_index` on the `policies` collection:

   ```json
   {
     "fields": [
       { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" }
     ]
   }
   ```

### 4. Auth0 (passwordless + MFA)

1. Create a **Regular Web Application** in the Auth0 dashboard.
2. **Allowed Callback URLs** → `http://localhost:3000/auth/callback`; **Allowed Logout URLs** → `http://localhost:3000`.
3. Enable a **Passwordless → Email (magic link)** connection, and turn on **Multi-factor Auth** under Security.
4. Fill `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`; generate `AUTH0_SECRET` with `openssl rand -hex 32`.

Auth routes (`/auth/login`, `/auth/logout`, `/auth/callback`) mount automatically via [`src/proxy.ts`](src/proxy.ts).

### 5. Run

```bash
npm run dev   # http://localhost:3000
```

Sign in, paste a bill (or hit **Use sample policy**), and retrieve precedent. Bump `CONSISTENCY_RUNS=3` in `.env.local` for the on-stage self-consistency demo.

---

## Demo strategy

Never call a live Earth-observation API on stage. The seeded [`data/case-studies.json`](data/case-studies.json) ships four analogues with dramatic, visible-from-space deltas:

- **Brazil** Amazon enforcement rollback (2019–2022)
- **Indonesia** peatland moratorium (2016→2019)
- **BC FireSmart** fuel-management funding (2018→) — the local-judge angle
- **Ontario** forest-management budget cuts (2019) — an economic bill with no climate language

Pitch line: *"Climate policy debates run on rhetoric; satellites have been keeping receipts for 40 years. Downwind connects the two."*

## Status / roadmap

Hackathon scaffold — screening, retrieval, dual-mode synthesis, caching, auth, and UI are wired end-to-end against seeded data. Next: live Sentinel-2 / NASA GIBS image-pair fetching, map + timeline slider, policy-diff (two bills side by side), the full Climate Policy Radar corpus (~5,000 laws), and — if shipped — a distilled screening model to cut cost/energy per analysis.
