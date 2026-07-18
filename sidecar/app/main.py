"""Downwind EO sidecar — FastAPI.

The seam (plan.md L361): Next.js POSTs {bbox|region_query, window_t0, window_t1,
domain} and gets back {layer2_5_geometry, layer3_observed}. The sidecar owns
geospatial/EO; Next.js owns Gemini + Mongo + Auth0 + UI.

Run:  uvicorn app.main:app --reload --port 8000   (from the sidecar/ dir)
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from . import config
from .contract import EoRequest, EoResponse
from .eo import run_eo

app = FastAPI(title="Downwind EO sidecar", version="0.1.0")


@app.get("/health")
def health() -> dict:
    """Liveness + which providers are configured (keys present, not tested)."""
    return {
        "ok": True,
        "providers": {
            "sentinelhub": config.has_sentinelhub(),  # primary: 10 m + numbers
            "firms": config.has_firms(),  # fire add-on
            "gibs": True,  # zero-auth fallback — always available
        },
    }


@app.post("/eo", response_model=EoResponse)
def eo(req: EoRequest) -> EoResponse:
    try:
        return run_eo(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"EO fetch failed: {type(e).__name__}: {e}")
