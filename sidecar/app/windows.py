"""Observation-window helpers.

A window is "YYYY-MM-DD/YYYY-MM-DD". Season-matching is non-negotiable (plan.md
L249): comparing the same calendar months across years, or you measure seasonal
NDVI swing, not policy effect.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta


def parse_window(window: str) -> tuple[date, date]:
    lo, hi = window.split("/", 1)
    return _d(lo), _d(hi)


def _d(s: str) -> date:
    return datetime.strptime(s.strip(), "%Y-%m-%d").date()


def midpoint(window: str) -> date:
    lo, hi = parse_window(window)
    return lo + (hi - lo) / 2


def to_rfc3339_range(window: str) -> tuple[str, str]:
    """Window -> Sentinel Hub timeRange (from/to as UTC RFC3339)."""
    lo, hi = parse_window(window)
    return f"{lo.isoformat()}T00:00:00Z", f"{hi.isoformat()}T23:59:59Z"


def is_season_matched(window_t0: str, window_t1: str) -> bool:
    """True iff both windows span the same calendar months (season-matched)."""
    a0, a1 = parse_window(window_t0)
    b0, b1 = parse_window(window_t1)
    return (a0.month, a1.month) == (b0.month, b1.month)


def chunk_days(window: str, max_span: int = 5) -> list[tuple[date, int]]:
    """Split a window into <=max_span-day chunks.

    FIRMS caps DAY_RANGE at 5 (plan.md L246), so a season-long window must be
    stitched. Returns (chunk_end_date, day_range) pairs the FIRMS area API wants.
    """
    lo, hi = parse_window(window)
    out: list[tuple[date, int]] = []
    cur = lo
    while cur <= hi:
        end = min(cur + timedelta(days=max_span - 1), hi)
        span = (end - cur).days + 1
        out.append((end, span))
        cur = end + timedelta(days=1)
    return out
