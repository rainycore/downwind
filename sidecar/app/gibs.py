"""NASA GIBS Worldview Snapshots — the zero-auth before/after fallback.

plan.md L243: one no-auth GET -> JPEG/PNG for a bbox+date. 250 m, coarse but
INSTANT and UNBREAKABLE — swap TIME for before/after. Pixels only: GIBS yields
NO numeric NDVI/NBR, so this path leaves those fields null and flags it.

Bbox order for EPSG:4326 is lat-first: `minLat,minLon,maxLat,maxLon`.
"""
from __future__ import annotations

import base64

import httpx

from . import config
from .contract import BBox, ObservedImagery
from .windows import midpoint

SNAPSHOT_URL = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
TRUE_COLOR_LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor"


def _dims(bbox: BBox) -> tuple[int, int]:
    """Aspect-preserving pixel dims, long side = config.IMAGE_PX."""
    lon_span = max(abs(bbox[2] - bbox[0]), 1e-6)
    lat_span = max(abs(bbox[3] - bbox[1]), 1e-6)
    aspect = lon_span / lat_span
    px = config.IMAGE_PX
    if aspect >= 1:
        return px, max(1, round(px / aspect))
    return max(1, round(px * aspect)), px


def _snapshot(client: httpx.Client, bbox: BBox, day: str) -> str:
    """Fetch one GIBS snapshot -> data URI (raises on non-image response)."""
    width, height = _dims(bbox)
    # EPSG:4326 wants lat-first BBOX: minLat,minLon,maxLat,maxLon.
    bbox_latfirst = f"{bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]}"
    params = {
        "REQUEST": "GetSnapshot",
        "TIME": day,
        "BBOX": bbox_latfirst,
        "CRS": "EPSG:4326",
        "LAYERS": TRUE_COLOR_LAYER,
        "WRAP": "day",
        "FORMAT": "image/jpeg",
        "WIDTH": str(width),
        "HEIGHT": str(height),
    }
    resp = client.get(SNAPSHOT_URL, params=params, timeout=30.0)
    resp.raise_for_status()
    ctype = resp.headers.get("content-type", "")
    if not ctype.startswith("image/"):
        raise RuntimeError(f"GIBS returned non-image response ({ctype}): {resp.text[:200]}")
    b64 = base64.b64encode(resp.content).decode("ascii")
    return f"data:{ctype};base64,{b64}"


def fetch_pair(bbox: BBox, window_t0: str, window_t1: str) -> ObservedImagery:
    """Before/after GIBS true-color pair at the midpoint date of each window."""
    d0 = midpoint(window_t0).isoformat()
    d1 = midpoint(window_t1).isoformat()
    with httpx.Client() as client:
        before = _snapshot(client, bbox, d0)
        after = _snapshot(client, bbox, d1)
    return ObservedImagery(
        product="MODIS Terra Corrected Reflectance (True Color)",
        composite="single-date snapshot (no cloud filtering)",
        t0=d0,
        t1=d1,
        source="NASA GIBS Worldview Snapshots",
        before_png_ref=before,
        after_png_ref=after,
        baseline_year_staleness="250 m; single-date, cloud not filtered",
    )
