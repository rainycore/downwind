# Downwind EO sidecar

Thin Python FastAPI service that owns the geospatial/EO work: it turns a region +
two season-matched time windows into **real satellite before/after imagery +
numeric NDVI/NBR deltas**, returning the `layer2_5_geometry` + `layer3_observed`
slice of the shared data contract. Next.js owns Gemini + Mongo + Auth0 + UI; this
owns pixels + numbers. Pure REST — **no GDAL/GEE/geopandas** (plan.md L360).

## The seam

```
POST /eo
{ "bbox": [minLon,minLat,maxLon,maxLat] | null,   // null => geocode region_query
  "region_query": "Pará, Brazil",
  "window_t0": "2019-06-01/2019-09-30",            // season-matched to t1
  "window_t1": "2023-06-01/2023-09-30",
  "domain": "land_cover" }
->
{ "layer2_5_geometry": {...}, "layer3_observed": { "land_cover": {...}, "fire": {...}, "air_quality": {...} } }
```

`GET /health` reports which providers are configured. `GET /docs` is the OpenAPI UI.

## Providers (graceful degradation)

| Provider | Gives | Auth | When |
|---|---|---|---|
| **Sentinel Hub (CDSE)** | 10 m before/after PNG **+ numeric NDVI/NBR deltas** | OAuth (`SH_CLIENT_ID/SECRET`) | primary |
| **NASA GIBS Worldview Snapshots** | 250 m before/after PNG, **pixels only (no numbers)** | none | fallback / no keys |
| **NASA FIRMS** | fire-count + FRP delta | free `FIRMS_MAP_KEY` | add-on |
| **Nominatim/OSM** | region → bbox (novel pastes) | none (1 req/s, custom UA) | when no bbox given |

With **no keys at all** the sidecar still returns real imagery via GIBS — verified
live against the Legal Amazon (returns genuine MODIS true-color frames). Numeric
deltas require Sentinel Hub creds.

## Run

```bash
cd sidecar
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # optionally add SH_* / FIRMS_MAP_KEY
./.venv/bin/uvicorn app.main:app --reload --port 8000
# smoke test (no keys needed):
curl -s -X POST localhost:8000/eo -H 'content-type: application/json' \
  -d '{"bbox":[-63.5,-10.5,-62.5,-9.5],"region_query":"Rondonia","window_t0":"2019-07-01/2019-08-31","window_t1":"2023-07-01/2023-08-31","domain":"land_cover"}'
```

## Hardening baked in (plan.md L248-253)

- **Season-matching** enforced; mismatched windows flagged `not_season_matched`.
- **Cloud-widen**: Statistical API retried at higher `maxCloudCoverage` before giving up; still empty → `null` + flag (never fabricated).
- **Min-bbox guard** flags tiny AOIs (too few 10 m pixels → unreliable stats).
- **OAuth token cache + refresh** (60 s early); **429/5xx retry with backoff**.
- **Two-tier cache** keyed by `(bbox, windows, domain)` so rehearsed demo runs are instant.
- Missing data is always `null` + a `flags` entry — **the sidecar never invents a number or a pixel.**

## ⚠ Verify before shipping (plan.md L240)

The CDSE endpoint paths moved in the March-2026 change (`/api/v1/*` vs
`/process/v1`, `/statistics/v1`). All three URLs are env-overridable in
`.env` (`SH_PROCESS_URL`, `SH_STATISTICS_URL`, `SH_TOKEN_URL`) — confirm against
current docs and the Statistical response shape (`data[].outputs.<id>.bands.B0.stats.mean`).

**Known limitation:** single-date GIBS snapshots over a wide bbox can show a MODIS
orbit swath gap (a black diagonal). The Sentinel Hub primary path mosaics this
away; for the GIBS fallback prefer tighter bboxes.
