// NASA GIBS / Worldview Snapshots — pre-rendered satellite imagery, no auth.
// Given a bbox + date + layer, the Snapshots API returns a static PNG. This is
// the "zero processing" visual workhorse: before/after PNGs go straight into the
// map (Receipts mode) and into the Gemma vision model as image input.
//
// Endpoint: https://wvs.earthdata.nasa.gov/api/v1/snapshot
// BBOX order for CRS=EPSG:4326 is: minLat,minLon,maxLat,maxLon (S,W,N,E).

const SNAPSHOT_BASE = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";

// Catalog of the layers we actually use. `id` is a comma-separated GIBS layer
// stack (rendered bottom→top). True color always renders and is the default;
// the thematic layers are per-observable but can be sparse on a given date.
export const GIBS_LAYERS = {
  truecolor: {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    label: "MODIS Terra — true color",
    dataset: "MODIS/Terra Corrected Reflectance",
  },
  vegetation: {
    id: "MODIS_Terra_L3_NDVI_16Day",
    label: "MODIS NDVI (16-day) — vegetation",
    dataset: "MOD13 NDVI",
  },
  fires: {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor,MODIS_Terra_Thermal_Anomalies_All",
    label: "True color + active fires",
    dataset: "MODIS/Terra + MOD14 thermal anomalies",
  },
  no2: {
    id: "OMI_Nitrogen_Dioxide_Tropo_Column",
    label: "OMI tropospheric NO₂",
    dataset: "OMI/Aura NO₂",
  },
} as const;

export type LayerKey = keyof typeof GIBS_LAYERS;

export type BBox = { minLat: number; minLon: number; maxLat: number; maxLon: number };

// Build a square bbox around a point, clamped to valid lat/lon.
export function bboxAround(lon: number, lat: number, halfDeg = 1.5): BBox {
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  const clampLon = (v: number) => Math.max(-180, Math.min(180, v));
  return {
    minLat: clampLat(lat - halfDeg),
    minLon: clampLon(lon - halfDeg),
    maxLat: clampLat(lat + halfDeg),
    maxLon: clampLon(lon + halfDeg),
  };
}

// Deterministic URL for one snapshot — this IS the receipt: anyone can open it.
export function snapshotUrl(opts: {
  layer: LayerKey;
  date: string; // YYYY-MM-DD
  bbox: BBox;
  width?: number;
  height?: number;
}): string {
  const { layer, date, bbox, width = 512, height = 512 } = opts;
  const params = new URLSearchParams({
    REQUEST: "GetSnapshot",
    LAYERS: GIBS_LAYERS[layer].id,
    CRS: "EPSG:4326",
    TIME: date,
    BBOX: `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`,
    FORMAT: "image/png",
    WIDTH: String(width),
    HEIGHT: String(height),
  });
  return `${SNAPSHOT_BASE}?${params.toString()}`;
}

export type ImagePair = {
  layer: LayerKey;
  layerLabel: string;
  dataset: string;
  before: { date: string; url: string };
  after: { date: string; url: string };
};

// A before/after pair for one region + observable, framed around an event year.
export function imagePair(opts: {
  layer: LayerKey;
  lon: number;
  lat: number;
  beforeDate: string;
  afterDate: string;
  halfDeg?: number;
}): ImagePair {
  const { layer, lon, lat, beforeDate, afterDate, halfDeg } = opts;
  const bbox = bboxAround(lon, lat, halfDeg);
  const meta = GIBS_LAYERS[layer];
  return {
    layer,
    layerLabel: meta.label,
    dataset: meta.dataset,
    before: { date: beforeDate, url: snapshotUrl({ layer, date: beforeDate, bbox }) },
    after: { date: afterDate, url: snapshotUrl({ layer, date: afterDate, bbox }) },
  };
}

// Fetch a PNG as raw bytes. Best-effort: throws on non-image / blank responses
// so callers can degrade gracefully.
export async function fetchPng(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS ${res.status} for ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`GIBS returned ${type}, not an image`);
  const buf = Buffer.from(await res.arrayBuffer());
  // A ~1KB PNG from Snapshots is a blank/transparent tile (no data for date).
  if (buf.length < 2000) throw new Error("GIBS returned a blank tile (no data for date)");
  return buf;
}

// Same, base64-encoded — for feeding a local VLM.
export async function fetchPngBase64(url: string): Promise<string> {
  return (await fetchPng(url)).toString("base64");
}
