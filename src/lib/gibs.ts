// NASA GIBS / Worldview Snapshots — pre-rendered satellite imagery, no auth.
// Given a bbox + date + layer, the Snapshots API returns a static PNG. Each
// climate DIMENSION maps to a GIBS layer plus its official colormap, so we can
// both show the before/after pair (Receipts) and invert the pixels to a real
// physical value (see colormap.ts).
//
// Endpoint: https://wvs.earthdata.nasa.gov/api/v1/snapshot
// BBOX order for CRS=EPSG:4326 is: minLat,minLon,maxLat,maxLon (S,W,N,E).

const SNAPSHOT_BASE = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";

export type DimensionKey =
  | "vegetation"
  | "heat"
  | "aerosol"
  | "ozone"
  | "no2"
  | "precipitation"
  | "snow";

export type DimensionSpec = {
  label: string; // human dimension name
  layer: string; // GIBS WMTS layer id (comma-separated stack allowed)
  colormap: string; // colormap XML filename for value inversion
  dataset: string; // provenance label for Receipts
  validRange?: [number, number]; // physical values to keep (drops sentinel codes)
  unitLabel?: string; // overrides the colormap's units string (e.g. after convert)
  convert?: (v: number) => number; // physical-value transform, e.g. Kelvin → °C
  goodDirection: "up" | "down" | "neutral"; // is an increase environmentally good?
};

// Verified against the live API + colormaps: every layer returns real data and
// inverts to physically sane values (NDVI ~0.8, LST in °C, AOD, DU, mm/hr, %).
export const DIMENSIONS: Record<DimensionKey, DimensionSpec> = {
  vegetation: {
    label: "Vegetation & land cover",
    layer: "MODIS_Terra_L3_NDVI_16Day",
    colormap: "MODIS_L3_NDVI.xml",
    dataset: "MODIS Terra NDVI (16-day)",
    unitLabel: "NDVI",
    goodDirection: "up",
  },
  heat: {
    label: "Land surface temperature",
    layer: "MODIS_Terra_Land_Surface_Temp_Day",
    colormap: "MODIS_Land_Surface_Temp.xml",
    dataset: "MODIS Terra LST (day)",
    unitLabel: "°C",
    convert: (k) => k - 273.15,
    goodDirection: "down",
  },
  aerosol: {
    label: "Air quality — aerosols (smoke/haze)",
    layer: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    colormap: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly.xml",
    dataset: "MERRA-2 aerosol optical thickness (monthly)",
    unitLabel: "AOD",
    goodDirection: "down",
  },
  ozone: {
    label: "Total column ozone",
    layer: "OMPS_Ozone_Total_Column",
    colormap: "OMPS_Ozone_Total_Column.xml",
    dataset: "OMPS total column ozone",
    goodDirection: "up",
  },
  no2: {
    label: "Nitrogen dioxide (emissions)",
    layer: "OMI_Nitrogen_Dioxide_Tropo_Column",
    colormap: "OMI_Nitrogen_Dioxide_Tropo_Column.xml",
    dataset: "OMI tropospheric NO₂",
    goodDirection: "down",
  },
  precipitation: {
    label: "Precipitation",
    layer: "IMERG_Precipitation_Rate",
    colormap: "GPM_Precipitation_Rate.xml",
    dataset: "GPM IMERG precipitation rate",
    goodDirection: "neutral",
  },
  snow: {
    label: "Snow cover",
    layer: "MODIS_Aqua_L3_NDSI_Snow_Cover_Daily",
    colormap: "MODIS_NDSI_Snow_Cover.xml",
    dataset: "MODIS Aqua NDSI snow cover",
    validRange: [0, 100], // exclude cloud/night/water sentinel codes
    unitLabel: "% cover",
    goodDirection: "neutral",
  },
};

export type BBox = { minLat: number; minLon: number; maxLat: number; maxLon: number };

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
  layer: string;
  date: string; // YYYY-MM-DD
  bbox: BBox;
  width?: number;
  height?: number;
}): string {
  const { layer, date, bbox, width = 512, height = 512 } = opts;
  const params = new URLSearchParams({
    REQUEST: "GetSnapshot",
    LAYERS: layer,
    CRS: "EPSG:4326",
    TIME: date,
    BBOX: `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`,
    FORMAT: "image/png",
    WIDTH: String(width),
    HEIGHT: String(height),
  });
  return `${SNAPSHOT_BASE}?${params.toString()}`;
}

export type Snapshot = { date: string; url: string };

// A before/after pair of snapshot URLs for one dimension over one region.
export function dimensionPair(opts: {
  dimension: DimensionKey;
  lon: number;
  lat: number;
  beforeDate: string;
  afterDate: string;
  halfDeg?: number;
}): { before: Snapshot; after: Snapshot } {
  const { dimension, lon, lat, beforeDate, afterDate, halfDeg } = opts;
  const layer = DIMENSIONS[dimension].layer;
  const bbox = bboxAround(lon, lat, halfDeg);
  return {
    before: { date: beforeDate, url: snapshotUrl({ layer, date: beforeDate, bbox }) },
    after: { date: afterDate, url: snapshotUrl({ layer, date: afterDate, bbox }) },
  };
}

// Fetch a PNG as raw bytes. Throws on non-image / blank tiles so callers degrade.
export async function fetchPng(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS ${res.status} for ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`GIBS returned ${type}, not an image`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error("GIBS returned a blank tile (no data for date)");
  return buf;
}

export async function fetchPngBase64(url: string): Promise<string> {
  return (await fetchPng(url)).toString("base64");
}
