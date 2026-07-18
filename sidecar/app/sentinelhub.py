"""Sentinel Hub on CDSE — the PRIMARY EO provider (plan.md L232-259).

One OAuth client gives BOTH things we need:
  • Process API      -> exact-bbox true-color PNG at 10 m (before/after pair)
  • Statistical API  -> JSON mean/stDev per interval -> NDVI/NBR deltas (no raster math here)

Tokens are short-lived (~10 min) -> cache + refresh. 429/5xx -> retry w/ backoff.

⚠ VERIFY BEFORE SHIPPING (plan.md L240): the exact endpoint paths moved in the
March-2026 CDSE change (/api/v1/* vs /process/v1, /statistics/v1). Both currently
resolve; all three URLs are env-overridable in config.py so a change is one line.
The Statistical response shape (data[].outputs.<id>.bands.<band>.stats.mean) is
also worth a last-mile check against current docs.
"""
from __future__ import annotations

import base64
import time

import httpx

from . import config
from .contract import BBox, ObservedImagery
from .windows import parse_window, to_rfc3339_range

_CRS = "http://www.opengis.net/def/crs/EPSG/0/4326"

# ── Evalscripts (deterministic; the VLM never touches these) ──
_TRUE_COLOR = """//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04"], output: { bands: 3 } };
}
function evaluatePixel(s) {
  return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02];
}
"""

_NDVI_NBR_STATS = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B12", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "nbr", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  let ndvi = index(s.B08, s.B04);
  let nbr = index(s.B08, s.B12);
  return { ndvi: [ndvi], nbr: [nbr], dataMask: [s.dataMask] };
}
"""


class SentinelHubError(RuntimeError):
    pass


# ── OAuth token cache + refresh ──
_token: dict[str, float | str] = {"value": "", "exp": 0.0}


def _access_token(client: httpx.Client) -> str:
    now = time.time()
    if _token["value"] and float(_token["exp"]) - 60 > now:  # refresh 60s early
        return str(_token["value"])
    resp = client.post(
        config.SH_TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": config.SH_CLIENT_ID,
            "client_secret": config.SH_CLIENT_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30.0,
    )
    if resp.status_code != 200:
        raise SentinelHubError(f"OAuth failed {resp.status_code}: {resp.text[:200]}")
    body = resp.json()
    _token["value"] = body["access_token"]
    _token["exp"] = now + float(body.get("expires_in", 600))
    return str(_token["value"])


def _post_with_retry(client: httpx.Client, url: str, *, json: dict, token: str, accept: str) -> httpx.Response:
    """POST with exponential backoff on 429/5xx (plan.md L252)."""
    delay = 1.0
    last: httpx.Response | None = None
    for _ in range(4):
        resp = client.post(
            url,
            json=json,
            headers={"Authorization": f"Bearer {token}", "Accept": accept},
            timeout=60.0,
        )
        if resp.status_code < 400:
            return resp
        last = resp
        if resp.status_code in (429, 500, 502, 503, 504):
            time.sleep(delay)
            delay *= 2
            continue
        break
    raise SentinelHubError(f"{url} -> {last.status_code if last else '??'}: {last.text[:200] if last else ''}")


def _bounds(bbox: BBox) -> dict:
    return {"bbox": list(bbox), "properties": {"crs": _CRS}}


def _process_png(client: httpx.Client, token: str, bbox: BBox, window: str) -> str:
    frm, to = to_rfc3339_range(window)
    w, h = config.IMAGE_PX, config.IMAGE_PX
    body = {
        "input": {
            "bounds": _bounds(bbox),
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": frm, "to": to},
                        "maxCloudCoverage": config.MAX_CLOUD_COVERAGE,
                    },
                    "mosaickingOrder": "leastCC",  # least-cloud composite over the window
                }
            ],
        },
        "output": {
            "width": w,
            "height": h,
            "responses": [{"identifier": "default", "format": {"type": "image/png"}}],
        },
        "evalscript": _TRUE_COLOR,
    }
    resp = _post_with_retry(client, config.SH_PROCESS_URL, json=body, token=token, accept="image/png")
    ctype = resp.headers.get("content-type", "")
    if not ctype.startswith("image/"):
        raise SentinelHubError(f"Process API non-image response ({ctype}): {resp.text[:200]}")
    b64 = base64.b64encode(resp.content).decode("ascii")
    return f"data:{ctype};base64,{b64}"


def _weighted_mean(intervals: list[dict], output_id: str) -> float | None:
    """sampleCount-weighted mean across all returned Statistical intervals."""
    num = 0.0
    den = 0.0
    for iv in intervals:
        stats = (
            iv.get("outputs", {})
            .get(output_id, {})
            .get("bands", {})
            .get("B0", {})
            .get("stats", {})
        )
        mean = stats.get("mean")
        n = stats.get("sampleCount", 0) - stats.get("noDataCount", 0)
        if mean is None or n <= 0:
            continue
        num += mean * n
        den += n
    return round(num / den, 4) if den > 0 else None


def _statistics(client: httpx.Client, token: str, bbox: BBox, window: str, max_cloud: int) -> dict:
    frm, to = to_rfc3339_range(window)
    lo, hi = parse_window(window)
    span_days = (hi - lo).days + 1  # one interval covering the whole window
    body = {
        "input": {
            "bounds": _bounds(bbox),
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {"maxCloudCoverage": max_cloud}}],
        },
        "aggregation": {
            "timeRange": {"from": frm, "to": to},
            "aggregationInterval": {"of": f"P{span_days}D"},
            "evalscript": _NDVI_NBR_STATS,
            "resx": 0.0001,  # ~10 m in degrees
            "resy": 0.0001,
        },
        "calculations": {"default": {}},
    }
    resp = _post_with_retry(client, config.SH_STATISTICS_URL, json=body, token=token, accept="application/json")
    return resp.json()


# ── Public API used by eo.py ──
def truecolor_pair(bbox: BBox, window_t0: str, window_t1: str) -> ObservedImagery:
    frm0, _ = to_rfc3339_range(window_t0)
    frm1, _ = to_rfc3339_range(window_t1)
    with httpx.Client() as client:
        token = _access_token(client)
        before = _process_png(client, token, bbox, window_t0)
        after = _process_png(client, token, bbox, window_t1)
    return ObservedImagery(
        product="Sentinel-2 L2A",
        composite="least-cloud mosaic (maxCC %d%%)" % config.MAX_CLOUD_COVERAGE,
        t0=window_t0,
        t1=window_t1,
        source="Sentinel Hub CDSE Process API",
        before_png_ref=before,
        after_png_ref=after,
        baseline_year_staleness="10 m; season-matched least-cloud composite",
    )


def ndvi_nbr_deltas(bbox: BBox, window_t0: str, window_t1: str) -> dict:
    """Returns {ndvi_mean_t0, ndvi_mean_t1, ndvi_delta, nbr_delta, flags}."""
    flags: list[str] = []
    with httpx.Client() as client:
        token = _access_token(client)

        def means(window: str) -> tuple[float | None, float | None]:
            data = _statistics(client, token, bbox, window, config.MAX_CLOUD_COVERAGE).get("data", [])
            if not data:  # all-cloudy -> widen once (plan.md L250), then give up honestly
                flags.append(f"widened_cloud_{window}")
                data = _statistics(client, token, bbox, window, 90).get("data", [])
            return _weighted_mean(data, "ndvi"), _weighted_mean(data, "nbr")

        ndvi0, nbr0 = means(window_t0)
        ndvi1, nbr1 = means(window_t1)

    if ndvi0 is None or ndvi1 is None:
        flags.append("all_cloudy_no_stats")  # never fabricate
    return {
        "ndvi_mean_t0": ndvi0,
        "ndvi_mean_t1": ndvi1,
        "ndvi_delta": round(ndvi1 - ndvi0, 4) if (ndvi0 is not None and ndvi1 is not None) else None,
        "nbr_delta": round(nbr1 - nbr0, 4) if (nbr0 is not None and nbr1 is not None) else None,
        "flags": flags,
    }
