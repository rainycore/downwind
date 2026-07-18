"""Layer 2.5 — region -> bounding box via Nominatim (plan.md L219-228).

MVP = bbox only (polygons are stretch). Respect the OSM policy: 1 req/s, a real
custom User-Agent, and RETURN MULTIPLE CANDIDATES — never trust a single
self-reported flag (it misses the "confidently wrong Pará").

For the hero cases the bbox is pre-stored in the enriched index, so the demo
path never depends on live geocoding; this is the fallback for a novel paste.
"""
from __future__ import annotations

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim

from . import config
from .contract import BBox, GeocodeCandidate, Layer2_5Geometry

_geocode = RateLimiter(
    Nominatim(user_agent=config.NOMINATIM_USER_AGENT).geocode,
    min_delay_seconds=1.1,  # OSM policy: max ~1 req/s
    max_retries=2,
    swallow_exceptions=True,
)


def _bbox_from_raw(raw: dict) -> BBox | None:
    # Nominatim boundingbox is [south_lat, north_lat, west_lon, east_lon] (strings).
    bb = raw.get("boundingbox")
    if not bb or len(bb) != 4:
        return None
    south, north, west, east = (float(x) for x in bb)
    return (west, south, east, north)  # -> [minLon, minLat, maxLon, maxLat]


def geocode_bbox(region_query: str) -> Layer2_5Geometry | None:
    """Resolve a free-text region to a bbox + candidate list, or None on miss."""
    results = _geocode(region_query, exactly_one=False, addressdetails=True, limit=5)
    if not results:
        return None

    candidates: list[GeocodeCandidate] = []
    for r in results:
        bbox = _bbox_from_raw(r.raw)
        if bbox:
            candidates.append(GeocodeCandidate(name=str(r.address), bbox=bbox))
    if not candidates:
        return None

    top = candidates[0]
    top_raw = results[0].raw
    is_admin = top_raw.get("addresstype") in {"state", "county", "country", "region", "province"}
    # importance is Nominatim's own 0..1 relevance score; a reasonable confidence proxy.
    confidence = float(top_raw.get("importance") or 0.0)
    return Layer2_5Geometry(
        resolved={"source": "Nominatim bbox", "bbox": top.bbox, "is_admin_unit": is_admin},
        resolver_path="bbox",
        geocoder_confidence=round(confidence, 3),
        candidates=candidates,
    )


def prestored(bbox: BBox) -> Layer2_5Geometry:
    """Wrap a pre-stored hero-case bbox — the demo-safe default path."""
    return Layer2_5Geometry(
        resolved={"source": "prestored_hero_case", "bbox": bbox, "is_admin_unit": True},
        resolver_path="prestored",
        geocoder_confidence=1.0,
        candidates=[],
    )
