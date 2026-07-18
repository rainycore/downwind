import zlib from "node:zlib";

// Compute a REAL, measured vegetation index directly from GIBS NDVI-layer pixels
// — no GPU, no external service, pure Node. The MODIS NDVI 16-day layer is a
// colorized ramp (tan/brown = low NDVI, dark green = high NDVI), so per pixel
// (green − red) tracks NDVI. Averaging it over the valid land pixels gives a
// mean-greenness index; the before→after delta is an observed change in
// vegetation. It is a proxy for average NDVI (read off the colormap), not the
// raw NDVI value — labelled honestly as such in the UI.

type DecodedPng = { width: number; height: number; rgba: Buffer };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Minimal PNG decoder for the 8-bit RGBA, non-interlaced PNGs GIBS returns.
function decodePng(buf: Buffer): DecodedPng {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }

  const channels = 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(height * stride);
  const prev = Buffer.alloc(stride);
  let rp = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const cur = rgba.subarray(y * stride, (y + 1) * stride); // view into rgba
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0; // left
      const b = prev[x]; // up
      const c = x >= channels ? prev[x - channels] : 0; // up-left
      let val: number;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      cur[x] = val & 0xff;
    }
    cur.copy(prev);
  }

  return { width, height, rgba };
}

// Mean greenness (0..1) over valid land pixels. Skips transparent no-data and
// near-white pixels (rivers, clouds, masked areas) so they don't dilute the read.
export function meanGreenness(pngBuf: Buffer): number {
  const { rgba } = decodePng(pngBuf);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const alpha = rgba[i + 3];
    if (alpha < 128) continue; // transparent / no data
    if (r > 220 && g > 220 && b > 220) continue; // white: water / cloud / mask
    sum += Math.max(0, (g - r) / (g + r + 1)); // NDVI-colormap proxy
    n++;
  }
  return n ? sum / n : 0;
}

export type GreennessDelta = {
  before: number; // mean greenness index (0..1) in the before image
  after: number; // …in the after image
  deltaPct: number; // signed % change, after vs before
};

// Measured vegetation change between a before/after PNG pair.
export function greennessDelta(beforePng: Buffer, afterPng: Buffer): GreennessDelta {
  const before = meanGreenness(beforePng);
  const after = meanGreenness(afterPng);
  const deltaPct = before > 0 ? ((after - before) / before) * 100 : 0;
  return {
    before: Math.round(before * 1000) / 1000,
    after: Math.round(after * 1000) / 1000,
    deltaPct: Math.round(deltaPct * 10) / 10,
  };
}
