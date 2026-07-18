"""Tiny on-disk cache for derived EO outputs (plan.md L253).

Keyed by (bbox, windows, domain) so a rehearsed demo run is instant and a slow
API can't kill the live demo. Memory + JSON-file two-tier; safe to delete.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import config

_ROOT = Path(__file__).resolve().parent.parent
_DIR = _ROOT / config.EO_CACHE_DIR
_mem: dict[str, dict] = {}


def key(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()[:24]


def get(k: str) -> dict | None:
    if k in _mem:
        return _mem[k]
    f = _DIR / f"{k}.json"
    if f.exists():
        try:
            val = json.loads(f.read_text())
            _mem[k] = val
            return val
        except (OSError, json.JSONDecodeError):
            return None
    return None


def put(k: str, value: dict) -> None:
    _mem[k] = value
    try:
        _DIR.mkdir(parents=True, exist_ok=True)
        (_DIR / f"{k}.json").write_text(json.dumps(value))
    except OSError:
        pass  # cache is best-effort; never fail the request over it
