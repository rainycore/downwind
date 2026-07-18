// Client for the Python EO sidecar (the seam, plan.md L361).
// Next.js POSTs {bbox|region_query, windows, domain}; the sidecar returns
// {layer2_5_geometry, layer3_observed}. Fails SOFT: on any error returns null so
// the orchestrator can degrade to an imagery-less contract instead of 500-ing
// (plan.md L374: "Sidecar down -> Next.js serves cached hero-case contract").

import type { EoRequest, EoResponse, Layer2Analog } from "./contract";

const SIDECAR_URL = process.env.EO_SIDECAR_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 60_000;

export async function callEo(req: EoRequest): Promise<EoResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${SIDECAR_URL}/eo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.error(`EO sidecar ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return null;
    }
    return (await resp.json()) as EoResponse;
  } catch (err) {
    console.error("EO sidecar unreachable:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Build the EO request from the chosen analog's pre-stored bbox + observable
// window (the demo-safe path — never depends on live geocoding).
export function eoRequestForAnalog(analog: Layer2Analog, window: { t0: string; t1: string }): EoRequest {
  return {
    bbox: analog.region.bbox,
    region_query: analog.region.name,
    window_t0: window.t0,
    window_t1: window.t1,
    domain: analog.domain,
  };
}
