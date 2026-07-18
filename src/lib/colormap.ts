import { decodePng } from "./png";

// Invert a NASA GIBS colormapped PNG back into PHYSICAL values.
//
// Every GIBS science layer ships an official colormap XML mapping RGB → a
// physical value range (NDVI index, Kelvin, Dobson Units, mm/hr, …). We parse
// it, then for each image pixel find the nearest palette colour and read off its
// value — giving a real measured mean (and before→after delta) with no GPU and
// no external raster service. Colormap:
//   https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml

const COLORMAP_BASE = "https://gibs.earthdata.nasa.gov/colormaps/v1.3";

export type ColorMap = {
  units: string;
  entries: { r: number; g: number; b: number; v: number }[];
};

function parseBound(s: string): number {
  if (/^-?inf$/i.test(s.trim())) return s.trim()[0] === "-" ? -Infinity : Infinity;
  return parseFloat(s);
}

// Parse a GIBS colormap XML. `validRange` drops sentinel/mask entries (e.g. the
// snow layer's cloud/night codes) that would otherwise skew the mean.
export function parseColorMap(xml: string, validRange?: [number, number]): ColorMap {
  const units = (xml.match(/<ColorMap [^>]*units="([^"]+)"/) ?? [])[1] ?? "";
  const entries: ColorMap["entries"] = [];
  for (const tag of xml.match(/<ColorMapEntry[^>]*\/>/g) ?? []) {
    if (/nodata="true"/.test(tag) || /transparent="true"/.test(tag)) continue;
    const rgb = tag.match(/rgb="(\d+),(\d+),(\d+)"/);
    const val = tag.match(/value="\[([^,\]]+)(?:,([^)\]]+))?[)\]]"/);
    if (!rgb || !val) continue;
    const lo = parseBound(val[1]);
    const hi = val[2] !== undefined ? parseBound(val[2]) : lo;
    let v: number;
    if (!isFinite(lo) && !isFinite(hi)) continue;
    else if (!isFinite(lo)) v = hi;
    else if (!isFinite(hi)) v = lo;
    else v = (lo + hi) / 2;
    if (validRange && (v < validRange[0] || v > validRange[1])) continue;
    entries.push({ r: +rgb[1], g: +rgb[2], b: +rgb[3], v });
  }
  return { units, entries };
}

export async function fetchColorMap(name: string, validRange?: [number, number]): Promise<ColorMap> {
  const res = await fetch(`${COLORMAP_BASE}/${name}`);
  if (!res.ok) throw new Error(`colormap ${res.status} for ${name}`);
  const cm = parseColorMap(await res.text(), validRange);
  if (!cm.entries.length) throw new Error(`colormap ${name} parsed 0 entries`);
  return cm;
}

// A 32³ RGB→value lookup so per-pixel inversion is O(1). Each coarse bin is
// matched to the nearest palette entry once; pixels farther than `thresh` from
// any palette colour (labels, borders, anti-aliasing) are left unmatched.
function buildLut(cm: ColorMap, thresh = 48): Float32Array {
  const lut = new Float32Array(32768).fill(NaN);
  const t2 = thresh * thresh;
  for (let bin = 0; bin < 32768; bin++) {
    const r = (((bin >> 10) & 31) << 3) | 4;
    const g = (((bin >> 5) & 31) << 3) | 4;
    const b = ((bin & 31) << 3) | 4;
    let best = Infinity;
    let bv = NaN;
    for (const e of cm.entries) {
      const d = (r - e.r) ** 2 + (g - e.g) ** 2 + (b - e.b) ** 2;
      if (d < best) {
        best = d;
        bv = e.v;
      }
    }
    if (best <= t2) lut[bin] = bv;
  }
  return lut;
}

export type MeanValue = { mean: number; coverage: number };

// Mean physical value over the image's matched pixels, plus coverage (fraction
// of opaque pixels that mapped to a palette colour — low coverage flags a
// swath-gapped or cloudy scene).
export function meanValue(png: Buffer, cm: ColorMap): MeanValue {
  const { rgba } = decodePng(png);
  const lut = buildLut(cm);
  let sum = 0;
  let matched = 0;
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue; // transparent / no data
    opaque++;
    const bin = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    const v = lut[bin];
    if (!Number.isNaN(v)) {
      sum += v;
      matched++;
    }
  }
  return { mean: matched ? sum / matched : NaN, coverage: opaque ? matched / opaque : 0 };
}
