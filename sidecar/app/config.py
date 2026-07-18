"""Environment-driven settings for the EO sidecar.

Everything the sidecar needs comes from env (see .env.example). Endpoint bases
are overridable so a provider path change is a config edit, not a code change.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load sidecar/.env if present (does not override real environment vars).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _clean(v: str | None) -> str:
    return (v or "").strip()


# Sentinel Hub / CDSE OAuth.
SH_CLIENT_ID = _clean(os.getenv("SH_CLIENT_ID"))
SH_CLIENT_SECRET = _clean(os.getenv("SH_CLIENT_SECRET"))
SH_TOKEN_URL = _clean(os.getenv("SH_TOKEN_URL")) or (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)
SH_PROCESS_URL = _clean(os.getenv("SH_PROCESS_URL")) or "https://sh.dataspace.copernicus.eu/api/v1/process"
SH_STATISTICS_URL = _clean(os.getenv("SH_STATISTICS_URL")) or "https://sh.dataspace.copernicus.eu/api/v1/statistics"

# NASA FIRMS.
FIRMS_MAP_KEY = _clean(os.getenv("FIRMS_MAP_KEY"))

# Nominatim.
NOMINATIM_USER_AGENT = _clean(os.getenv("NOMINATIM_USER_AGENT")) or "downwind-eo-sidecar/0.1"

# Cache.
EO_CACHE_DIR = _clean(os.getenv("EO_CACHE_DIR")) or ".eo_cache"

# Tunables (plan.md L251-253).
MAX_CLOUD_COVERAGE = int(_clean(os.getenv("SH_MAX_CLOUD")) or "40")
MIN_BBOX_SIDE_DEG = float(_clean(os.getenv("MIN_BBOX_SIDE_DEG")) or "0.02")  # ~2 km guard
IMAGE_PX = int(_clean(os.getenv("EO_IMAGE_PX")) or "512")


def has_sentinelhub() -> bool:
    return bool(SH_CLIENT_ID and SH_CLIENT_SECRET)


def has_firms() -> bool:
    return bool(FIRMS_MAP_KEY)
