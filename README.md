# Downwind

**Climate-policy debates run on rhetoric; satellites have been keeping receipts for 40 years. Downwind connects the two.**

> Paste a policy — a climate law, or an *economic* one that never mentions the climate — and Downwind tells you what observably happened, from space, in places that already tried something like it.

---

## The pitch

In Toronto we just lived through a wildfire-smog summer, and a lot of the online argument was about *policy*: which decisions amplified a natural disaster into a public-health event. The honest problem is that nobody can **forecast** the climate impact of a policy from a chat model — a "30-year forecast" from an LLM is confident confabulation, and any domain judge will say so.

So Downwind doesn't forecast. **It retrieves precedent.**

> *"Here's what measurably happened, from orbit, in regions that enacted a policy like this one."*

That reframe — **prediction → precedent** — is the whole idea. It turns an indefensible claim into a grounded, cited one, and it surfaces the non-obvious levers: zoning rules, fire-suppression budgets, agricultural subsidies, conservation-authority funding cuts — *economic* policies that quietly move the climate.

## What it does

1. **Extract** — Gemini reads free-text policy and returns structured JSON: sectors, causal levers (flagging the *hidden* economic ones), geography, timescale. → [`src/lib/schemas.ts`](src/lib/schemas.ts)
2. **Retrieve** — the policy's mechanisms are embedded and matched against a corpus of **enacted** policies via **MongoDB Atlas Vector Search**, with a `2dsphere` geo-index for region lookups. → [`src/lib/pipeline.ts`](src/lib/pipeline.ts)
3. **Ground** — Gemini compares the analogues' **observed satellite outcomes** (NDVI / NBR burn severity / aerosols / FIRMS fire counts) and produces three horizons with **honest epistemic labels**:
   - **3y → observed** (grounded in real measured deltas)
   - **10y → extrapolated** (trend from the analogues)
   - **30y → speculative** (scenario narrative, explicitly flagged)
4. **Translate** — the near-term impact is rendered as a visceral local metric: *"≈ +6 smoke days/year in Toronto."*
5. **Receipts** — every claim links to the analogue + dataset it came from, and a **carbon receipt** reports tokens / Wh / gCO₂e per analysis.

Honesty-in-the-UI (labelled uncertainty, cache-hit disclosure, self-consistency variance) is itself the differentiator — most demos fake certainty.

## Hackathon tracks

| Track | How Downwind hits it |
| --- | --- |
| **Deloitte — Best Environmental Hack / AI for Green** *(target)* | Climate decision-support graded on Impact / Innovation / Feasibility / Presentation. The **Green-AI** story is built in: cheap Flash/Gemma for extraction, Gemini Pro only for synthesis, aggressive MongoDB caching, and a live **tokens-per-analysis carbon receipt**. |
| **MLH — Best Use of Gemini API** | Structured outputs (`responseSchema`), multimodal image-pair reasoning, function-calling for live datasets, tiered models. |
| **MLH — Best Use of MongoDB Atlas** | Vector Search over policy embeddings + `2dsphere` geospatial index + result cache. |
| **MLH — Best Use of Auth0** | Non-trivial: passwordless **magic-link** login + **MFA** toggle, shareable saved analyses — not just a login box. |
| **Phoebe — decision-support agent** | The function-calling pipeline is an agent that helps people make better policy decisions. |

## Architecture

```
User pastes policy
      │
      ▼
[Gemini Flash] extract mechanisms ──► structured JSON (hidden levers surfaced)
      │
      ▼  embed(searchQuery)  → gemini-embedding-001 (768-dim)
[MongoDB Atlas] $vectorSearch on `policies` ──► top-k enacted analogues + observed deltas
      │
      ▼
[Gemini Pro] synthesize 3/10/30y horizons + local translation
      │
      ▼
cache in `analyses` (cache-first next time)  +  🌱 carbon receipt
```

## Tech stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4 + TypeScript
- **Gemini API** via `@google/genai` — tiered models in [`src/lib/gemini.ts`](src/lib/gemini.ts)
- **MongoDB Atlas** (Vector Search + geospatial) — [`src/lib/mongodb.ts`](src/lib/mongodb.ts)
- **Auth0** (`@auth0/nextjs-auth0` v4) — [`src/lib/auth0.ts`](src/lib/auth0.ts), [`src/middleware.ts`](src/middleware.ts)

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
2. Set **Allowed Callback URLs** to `http://localhost:3000/auth/callback` and **Allowed Logout URLs** to `http://localhost:3000`.
3. Enable a **Passwordless → Email (magic link)** connection, and turn on **Multi-factor Auth** under Security.
4. Fill `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and generate `AUTH0_SECRET` with `openssl rand -hex 32`.

Auth routes (`/auth/login`, `/auth/logout`, `/auth/callback`) are mounted automatically by [`src/middleware.ts`](src/middleware.ts).

### 5. Run

```bash
npm run dev   # http://localhost:3000
```

Sign in, paste a policy (or hit **Use sample policy**), and retrieve precedent.

---

## Demo strategy

Never call a live Earth-observation API on stage. The seeded [`data/case-studies.json`](data/case-studies.json) ships four analogues with dramatic, visible-from-space deltas:

- **Brazil** Amazon enforcement rollback (2019–2022)
- **Indonesia** peatland moratorium (2016→2019)
- **BC FireSmart** fuel-management funding (2018→) — the local-judge angle
- **Ontario** forest-management budget cuts (2019) — an economic policy with no climate language

Pitch line: *"Climate policy debates run on rhetoric; satellites have been keeping receipts for 40 years. Downwind connects the two."*

## Status / roadmap

This is a hackathon scaffold — the pipeline, caching, auth, and UI are wired end-to-end against seeded data. Next steps: live Sentinel-2 / NASA GIBS image-pair fetching, self-consistency variance display, policy-diff (two bills side by side), and the Climate Policy Radar corpus (~5,000 laws) as the retrieval base.
