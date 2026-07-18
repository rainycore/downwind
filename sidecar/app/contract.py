"""Pydantic v2 mirror of the sidecar's slice of the data contract.

This is the SAME contract as src/lib/contract.ts — keep the two in sync. The
sidecar only owns L2.5 (geometry) + L3 (observed EO), so only those pieces (plus
the request/response envelope) are modelled here.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# bbox = [minLon, minLat, maxLon, maxLat] (W,S,E,N) in EPSG:4326.
BBox = tuple[float, float, float, float]

ProvenanceTag = Literal["OBSERVED", "MODELED", "LLM_NARRATIVE"]
Domain = Literal["land_cover", "air_quality"]


# ── Request/response envelope (the Next.js <-> sidecar seam, plan.md L361) ──
class EoRequest(BaseModel):
    bbox: Optional[BBox] = None  # if None, sidecar geocodes region_query
    region_query: str = ""
    window_t0: str  # "YYYY-MM-DD/YYYY-MM-DD" — must be season-matched to t1
    window_t1: str
    domain: Domain = "land_cover"
    worldcover_class: Optional[str] = None


class GeocodeCandidate(BaseModel):
    name: str
    bbox: BBox


class Layer2_5Geometry(BaseModel):
    resolved: dict  # {"source": str, "bbox": BBox, "is_admin_unit": bool}
    resolver_path: Literal["prestored", "bbox", "admin", "ecoregion", "city"]
    geocoder_confidence: float = 0.0
    candidates: list[GeocodeCandidate] = Field(default_factory=list)


class ObservedImagery(BaseModel):
    product: str
    composite: str
    t0: str
    t1: str
    source: str
    before_png_ref: Optional[str] = None  # data URI; None when all-cloudy (never fabricated)
    after_png_ref: Optional[str] = None
    baseline_year_staleness: Optional[str] = None


class LandCoverObserved(BaseModel):
    imagery: Optional[ObservedImagery] = None
    ndvi_mean_t0: Optional[float] = None
    ndvi_mean_t1: Optional[float] = None
    ndvi_delta: Optional[float] = None
    nbr_delta: Optional[float] = None
    changed_area_fraction: Optional[float] = None
    PROVENANCE_TAG: ProvenanceTag = "OBSERVED"
    flags: list[str] = Field(default_factory=list)


class FireObserved(BaseModel):
    firms_fire_count_t0: Optional[int] = None
    firms_fire_count_t1: Optional[int] = None
    firms_fire_count_delta: Optional[int] = None
    firms_frp_sum_delta: Optional[float] = None
    PROVENANCE_TAG: ProvenanceTag = "OBSERVED"
    flags: list[str] = Field(default_factory=list)


class AirQualityObserved(BaseModel):
    # [STRETCH] — null in MVP.
    s5p_no2_delta_pct: Optional[float] = None
    aerosol_index_delta: Optional[float] = None
    openaq_pm25_crosscheck: Optional[float] = None
    PROVENANCE_TAG: ProvenanceTag = "OBSERVED"


class Layer3Observed(BaseModel):
    land_cover: LandCoverObserved
    fire: FireObserved
    air_quality: AirQualityObserved = Field(default_factory=AirQualityObserved)


class EoResponse(BaseModel):
    layer2_5_geometry: Layer2_5Geometry
    layer3_observed: Layer3Observed
