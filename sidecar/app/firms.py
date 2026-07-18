"""NASA FIRMS fire add-on (plan.md L246) — trivial, no OAuth.

GET /api/area/csv/[MAP_KEY]/VIIRS_SNPP_NRT/[W,S,E,N]/[DAY_RANGE]/[DATE] -> CSV of
detections. Count rows + sum `frp` per window -> firms_fire_count_delta. DAY_RANGE
caps at 5, so a season-long window is stitched from 5-day chunks. Ties
fire-suppression levers to observable fire activity.
"""
from __future__ import annotations

import csv
import io

import httpx

from . import config
from .contract import BBox, FireObserved
from .windows import chunk_days

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCE = "VIIRS_SNPP_NRT"
MAX_CHUNKS = 30  # bound the stitching: 30 * 5 = 150 days ~ a long season


def _count_window(client: httpx.Client, bbox: BBox, window: str) -> tuple[int, float, int, bool]:
    """(count, frp_sum, days_covered, truncated) for one window via stitched calls."""
    chunks = chunk_days(window, max_span=5)
    truncated = len(chunks) > MAX_CHUNKS
    chunks = chunks[:MAX_CHUNKS]

    west, south, east, north = bbox
    area = f"{west},{south},{east},{north}"  # FIRMS wants W,S,E,N == our bbox order
    count = 0
    frp_sum = 0.0
    days = 0
    for end_date, day_range in chunks:
        url = f"{FIRMS_BASE}/{config.FIRMS_MAP_KEY}/{SOURCE}/{area}/{day_range}/{end_date.isoformat()}"
        resp = client.get(url, timeout=30.0)
        resp.raise_for_status()
        text = resp.text.strip()
        days += day_range
        # Empty windows return a header-only CSV (or a short note) — guard for zero rows.
        if not text or text.lower().startswith("no data") or "\n" not in text:
            continue
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            count += 1
            try:
                frp_sum += float(row.get("frp") or 0.0)
            except ValueError:
                pass
    return count, round(frp_sum, 2), days, truncated


def fire_delta(bbox: BBox, window_t0: str, window_t1: str) -> FireObserved:
    if not config.has_firms():
        return FireObserved(flags=["firms_no_map_key"])
    try:
        with httpx.Client() as client:
            c0, f0, _, tr0 = _count_window(client, bbox, window_t0)
            c1, f1, _, tr1 = _count_window(client, bbox, window_t1)
    except Exception as e:  # noqa: BLE001 — never fail the whole EO call on the add-on
        return FireObserved(flags=[f"firms_error:{type(e).__name__}"])

    flags: list[str] = []
    if tr0 or tr1:
        flags.append("firms_window_truncated_to_150d")
    return FireObserved(
        firms_fire_count_t0=c0,
        firms_fire_count_t1=c1,
        firms_fire_count_delta=c1 - c0,
        firms_frp_sum_delta=round(f1 - f0, 2),
        flags=flags,
    )
