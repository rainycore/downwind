"""Layer 2.5 + Layer 3 orchestration (plan.md L219-259).

Resolve geometry, then fetch real EO: Sentinel Hub primary (10 m PNG + numeric
NDVI/NBR deltas), GIBS zero-auth fallback (250 m PNG, no numbers), FIRMS fire
add-on. Enforces the hardening guards: season-match, min-bbox, cloud-widen,
retry (in the SH client), and cache. Never fabricates — missing data -> null + flag.
"""
from __future__ import annotations

from . import cache, config, firms, geocode, gibs, sentinelhub
from .contract import (
    AirQualityObserved,
    EoRequest,
    EoResponse,
    Layer2_5Geometry,
    Layer3Observed,
    LandCoverObserved,
)
from .windows import is_season_matched


def _resolve_geometry(req: EoRequest) -> Layer2_5Geometry | None:
    if req.bbox is not None:
        return geocode.prestored(req.bbox)  # demo-safe pre-stored path
    if req.region_query:
        return geocode.geocode_bbox(req.region_query)
    return None


def _bbox_too_small(bbox) -> bool:
    lon_span = abs(bbox[2] - bbox[0])
    lat_span = abs(bbox[3] - bbox[1])
    return lon_span < config.MIN_BBOX_SIDE_DEG or lat_span < config.MIN_BBOX_SIDE_DEG


def _land_cover(bbox, req: EoRequest) -> LandCoverObserved:
    flags: list[str] = []
    if not is_season_matched(req.window_t0, req.window_t1):
        flags.append("not_season_matched")  # plan.md L249 — measuring seasonal swing, not policy
    if _bbox_too_small(bbox):
        flags.append("min_bbox_guard")  # too few 10 m pixels -> stats unreliable

    lc = LandCoverObserved(flags=flags)

    # Primary: Sentinel Hub (imagery + numbers). Fall back to GIBS for imagery.
    if config.has_sentinelhub():
        try:
            lc.imagery = sentinelhub.truecolor_pair(bbox, req.window_t0, req.window_t1)
            stats = sentinelhub.ndvi_nbr_deltas(bbox, req.window_t0, req.window_t1)
            lc.ndvi_mean_t0 = stats["ndvi_mean_t0"]
            lc.ndvi_mean_t1 = stats["ndvi_mean_t1"]
            lc.ndvi_delta = stats["ndvi_delta"]
            lc.nbr_delta = stats["nbr_delta"]
            lc.flags += stats["flags"]
            return lc
        except sentinelhub.SentinelHubError as e:
            lc.flags.append(f"sentinelhub_fallback:{type(e).__name__}")

    # Fallback (or no SH creds): GIBS gives pixels only — no NDVI/NBR numbers.
    try:
        lc.imagery = gibs.fetch_pair(bbox, req.window_t0, req.window_t1)
        lc.flags.append("gibs_fallback_no_numeric_deltas")
    except Exception as e:  # noqa: BLE001
        lc.imagery = None  # all providers failed -> honest null (plan.md L250)
        lc.flags.append(f"imagery_unavailable:{type(e).__name__}")
    return lc


def run_eo(req: EoRequest) -> EoResponse:
    ck = cache.key(req.model_dump())
    hit = cache.get(ck)
    if hit is not None:
        return EoResponse.model_validate(hit)

    geom = _resolve_geometry(req)
    if geom is None:
        raise ValueError("Could not resolve a bounding box: provide bbox or a geocodable region_query.")
    bbox = tuple(geom.resolved["bbox"])  # type: ignore[index]

    land_cover = _land_cover(bbox, req) if req.domain == "land_cover" else LandCoverObserved(flags=["skipped_non_forest_domain"])
    fire = firms.fire_delta(bbox, req.window_t0, req.window_t1)

    resp = EoResponse(
        layer2_5_geometry=geom,
        layer3_observed=Layer3Observed(land_cover=land_cover, fire=fire, air_quality=AirQualityObserved()),
    )
    cache.put(ck, resp.model_dump())
    return resp
