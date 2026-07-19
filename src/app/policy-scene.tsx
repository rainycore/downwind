"use client";

import { useEffect, useRef, useState } from "react";
import type { DimensionReading } from "@/lib/reader";
import { useTheme } from "@/components/useTheme";

// A living strip of world along the bottom of the page — not a boxed widget.
// The air tint fades upward into the page so it reads as one continuous scene.
//
// What it shows is MEASURED: haze from aerosol (AOD), the trees from vegetation
// (NDVI), the sun from land-surface temperature, the pond from precipitation.
// It works in both directions — a policy that cleans the air clears the sky,
// regrows the canopy and brings out butterflies and blossom, exactly as a
// harmful one browns it out.
//
// A rAF clock sweeps 0→1 as a progress indicator: it eases toward a ceiling
// while loading, then runs the remainder the moment results land.

type Phase = "before" | "after";
type Scene = { green: number; haze: number; warm: number; water: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const LOADING_A: Scene = { green: 0.85, haze: 0.08, warm: 0.35, water: 0.6 };
const LOADING_B: Scene = { green: 0.4, haze: 0.55, warm: 0.72, water: 0.3 };
const NEUTRAL: Scene = { green: 0.65, haze: 0.15, warm: 0.4, water: 0.45 };

function sceneFrom(readings: DimensionReading[], phase: Phase): Scene {
  const pick = (key: string): number | null => {
    const r = readings.find((x) => x.key === key);
    if (!r?.metric) return null;
    return phase === "before" ? r.metric.before : r.metric.after;
  };
  const ndvi = pick("vegetation");
  const aod = pick("aerosol");
  const lst = pick("heat");
  const precip = pick("precipitation");
  return {
    green: ndvi == null ? NEUTRAL.green : clamp01(ndvi / 0.85),
    haze: aod == null ? NEUTRAL.haze : clamp01(aod / 0.6),
    warm: lst == null ? NEUTRAL.warm : clamp01((lst - 5) / 30),
    water: precip == null ? NEUTRAL.water : clamp01(precip / 1.5),
  };
}

const lerpScene = (a: Scene, b: Scene, t: number): Scene => ({
  green: lerp(a.green, b.green, t),
  haze: lerp(a.haze, b.haze, t),
  warm: lerp(a.warm, b.warm, t),
  water: lerp(a.water, b.water, t),
});

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB =>
  a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t))) as unknown as RGB;
const css = (c: RGB) => `rgb(${c.join(",")})`;


// Day and night palettes — the strip follows the light/dark theme, so at night
// the meadow is moonlit, the sun becomes a moon and the butterflies read as
// fireflies. Endpoints are [dry/low, lush/high] pairs fed through mix().
type Palette = {
  grass: [RGB, RGB];
  foliage: [RGB, RGB];
  orb: [RGB, RGB]; // sun by day, moon by night
  haze: RGB;
  clear: string; // clean-air glow
  sky: [string, string]; // opaque base so page text never bleeds through
  pond: string;
  duck: string;
  beak: string;
  trunk: string;
  dress: string;
  skin: string;
  hair: string;
  flit: [string, string]; // butterflies / fireflies
  blooms: [string, string, string];
  petalDull: RGB; // flowers fade toward this as vegetation drops
  petals: [RGB, RGB, RGB];
  tuft: [RGB, RGB]; // grass tufts, dry -> lush
};

const DAY: Palette = {
  grass: [[176, 154, 107], [86, 171, 74]],
  foliage: [[150, 120, 60], [46, 125, 50]],
  orb: [[255, 213, 79], [255, 112, 67]],
  haze: [150, 125, 95],
  clear: "#bde9ff",
  sky: ["#eaf6ff", "#f7fbe9"] as [string, string],
  pond: "#7ec8e3",
  duck: "#ffd93d",
  beak: "#ff9f1c",
  trunk: "#6d4c41",
  dress: "#ef6f9c",
  skin: "#ffdbac",
  hair: "#5b4636",
  flit: ["#ff8fc7", "#8fd0ff"],
  blooms: ["#ff9ec4", "#ffd166", "#c9a7ff"],
  petalDull: [156, 138, 102],
  petals: [[255, 158, 196], [255, 209, 102], [201, 167, 255]],
  tuft: [[168, 148, 104], [74, 154, 66]],
};

const NIGHT: Palette = {
  grass: [[62, 56, 42], [34, 70, 44]],
  foliage: [[58, 50, 32], [28, 66, 40]],
  orb: [[238, 236, 220], [232, 198, 150]],
  haze: [64, 66, 88],
  clear: "#7fa8d8",
  sky: ["#16233d", "#1c2b22"] as [string, string],
  pond: "#3e7ba0",
  duck: "#d8b845",
  beak: "#c07a1c",
  trunk: "#4a352a",
  dress: "#a8517a",
  skin: "#c9a37f",
  hair: "#3b2e26",
  flit: ["#ffe9a3", "#ffd97a"],
  blooms: ["#a86c86", "#a8904f", "#8878a8"],
  petalDull: [86, 78, 66],
  petals: [[168, 108, 134], [168, 144, 79], [136, 120, 168]],
  tuft: [[70, 64, 48], [40, 78, 48]],
};

export const MIN_LOADING_MS = 7000;
const TAU_MS = MIN_LOADING_MS * 0.5;
const FINISH_MS = 900;
const CEILING = 0.9;

// Spread across the full width so the strip reads as landscape, not a vignette.
const TREES = [
  { x: 70, s: 1.0 }, { x: 196, s: 0.72 }, { x: 330, s: 0.88 },
  { x: 900, s: 0.8 }, { x: 1040, s: 1.05 }, { x: 1160, s: 0.7 },
];
// Flowers/plants dotted along the meadow. They are always present: they stand
// tall and colourful when vegetation is healthy and wilt, droop and fade when
// it isn't — so the vegetation reading is legible in BOTH directions.
const PLANTS = [
  { x: 96, y: 178 }, { x: 168, y: 188 }, { x: 262, y: 182 }, { x: 356, y: 190 },
  { x: 430, y: 179 }, { x: 500, y: 188 }, { x: 660, y: 184 }, { x: 700, y: 192 },
  { x: 760, y: 180 }, { x: 880, y: 190 }, { x: 962, y: 179 }, { x: 1044, y: 189 },
  { x: 1118, y: 182 }, { x: 1176, y: 191 },
];
// Small grass tufts that grow with NDVI.
const TUFTS = [
  { x: 40, y: 186 }, { x: 220, y: 192 }, { x: 300, y: 184 }, { x: 470, y: 194 },
  { x: 560, y: 186 }, { x: 640, y: 193 }, { x: 730, y: 187 }, { x: 840, y: 194 },
  { x: 920, y: 186 }, { x: 1000, y: 193 }, { x: 1080, y: 187 }, { x: 1150, y: 194 },
];

export default function PolicyScene({
  readings,
  loading = false,
}: {
  readings: DimensionReading[];
  loading?: boolean;
}) {
  const measured = readings.some((r) => r.metric);
  const [scene, setScene] = useState<Scene>(LOADING_A);
  const [progress, setProgress] = useState(0);

  const sceneRef = useRef<Scene>(LOADING_A);
  const targetRef = useRef<Scene>(LOADING_B);
  useEffect(() => {
    targetRef.current = measured ? sceneFrom(readings, "after") : LOADING_B;
  });

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setScene(targetRef.current);
      setProgress(1);
      return;
    }
    let start: number | null = null;
    let snapshot: Scene | null = null;
    let rafId = 0;
    const tick = (ts: number) => {
      start ??= ts;
      const elapsed = ts - start;
      if (loading) {
        const p = CEILING * (1 - Math.exp(-elapsed / TAU_MS));
        const s = lerpScene(LOADING_A, LOADING_B, p);
        sceneRef.current = s;
        setScene(s);
        setProgress(p);
        rafId = requestAnimationFrame(tick);
      } else {
        snapshot ??= sceneRef.current;
        const f = Math.min(1, elapsed / FINISH_MS);
        const e = f * f * (3 - 2 * f);
        const s = lerpScene(snapshot, targetRef.current, e);
        sceneRef.current = s;
        setScene(s);
        setProgress(CEILING + (1 - CEILING) * e);
        if (f < 1) rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [loading]);

  const s = scene;
  const theme = useTheme();
  const dates = readings.find((r) => r.metric);

  // Is this policy making things better or worse? Greener and clearer air both
  // count as better. Drives the celebratory cues (butterflies, blossom, sun).
  const before = measured ? sceneFrom(readings, "before") : LOADING_A;
  const after = measured ? sceneFrom(readings, "after") : LOADING_B;
  const improvement = (after.green - before.green) * 2.2 + (before.haze - after.haze) * 2.2;
  const better = clamp01(improvement) * progress; // reveals as the sweep completes
  const worse = clamp01(-improvement) * progress;

  const P = theme === "dark" ? NIGHT : DAY;
  const hazeRGB: RGB = P.haze;
  const grass = css(mix(P.grass[0], P.grass[1], s.green));
  const foliage = css(mix(P.foliage[0], P.foliage[1], s.green));
  const sun = css(mix(P.orb[0], P.orb[1], s.warm));
  const foliageR = 13 + s.green * 9;
  const pondRx = 26 + s.water * 30;
  const maskOn = clamp01((s.haze - 0.32) / 0.22);
  const tuftCol = css(mix(P.tuft[0], P.tuft[1], s.green));
  const tuftH = 4 + s.green * 8;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col">
      <div
        className="h-10 w-full"
        style={{ backgroundImage: `linear-gradient(to bottom, transparent, ${P.sky[0]})` }}
      />
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="xMidYMax slice"
        className="h-[26vh] max-h-[200px] min-h-[130px] w-full"
        role="img"
        aria-label="Animated strip showing the measured effect of the policy on air, vegetation and water"
      >
        <defs>
          {/* The air tint fades out upward, so the strip melts into the page
              instead of sitting in a box. */}
          <linearGradient id="dw-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.sky[0]} />
            <stop offset="100%" stopColor={P.sky[1]} />
          </linearGradient>
          <linearGradient id="dw-air" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={css(hazeRGB)} stopOpacity={s.haze * 0.25} />
            <stop offset="45%" stopColor={css(hazeRGB)} stopOpacity={s.haze * 0.7} />
            <stop offset="100%" stopColor={css(hazeRGB)} stopOpacity={s.haze * 0.85} />
          </linearGradient>
          {/* Clear-air glow when the policy improves things. */}
          <linearGradient id="dw-clear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.clear} stopOpacity="0" />
            <stop offset="100%" stopColor={P.clear} stopOpacity={better * 0.35} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="1200" height="200" fill="url(#dw-base)" />
        <rect x="0" y="0" width="1200" height="200" fill="url(#dw-clear)" />
        <rect x="0" y="0" width="1200" height="200" fill="url(#dw-air)" />

        {/* sun low on the horizon, warming with temperature */}
        <circle cx="1090" cy="150" r={26 + s.warm * 6} fill={sun} opacity={0.5 + better * 0.3} />

        {/* rolling ground, meeting the bottom edge */}
        <path d="M0 148 Q180 128 380 142 T760 138 T1200 150 L1200 200 L0 200 Z" fill={grass} />

        {TREES.map((t, i) => (
          <g key={i} transform={`translate(${t.x} 150) scale(${t.s})`}>
            <rect x="-4" y="-22" width="8" height="28" rx="3" fill={P.trunk} />
            <g className="dw-sway" style={{ transformOrigin: "50% 100%" }}>
              <circle cx="0" cy="-34" r={foliageR} fill={foliage} />
              <circle cx="-13" cy="-22" r={foliageR * 0.66} fill={foliage} />
              <circle cx="13" cy="-23" r={foliageR * 0.7} fill={foliage} />
            </g>
          </g>
        ))}

        {/* pond + the duck, seated in the water rather than hovering above it */}
        <ellipse cx="820" cy="176" rx={pondRx} ry="11" fill={P.pond} opacity="0.9" />
        <g className="dw-paddle">
          <g className="dw-bob">
            <ellipse cx="820" cy="172" rx="12" ry="8" fill={P.duck} />
            <circle cx="830" cy="163" r="6.5" fill={P.duck} />
            <polygon points="836,163 845,165 836,167" fill={P.beak} />
            <circle cx="831.5" cy="161.5" r="1.3" fill="#3d2c00" />
          </g>
        </g>
        {/* waterline over the duck's belly completes the "floating" read */}
        <ellipse cx="820" cy="179" rx={pondRx} ry="7.5" fill={P.pond} opacity="0.95" />

        {/* the girl — mask fades in with haze, arms lift when things improve */}
        <ellipse cx="600" cy="186" rx="13" ry="3.5" fill="rgba(0,0,0,.12)" />
        <g className="dw-girl-sway">
          <rect x="596" y="164" width="3" height="18" fill={P.hair} />
          <rect x="602" y="164" width="3" height="18" fill={P.hair} />
          <path d="M590 164 L600 138 L610 164 Z" fill={P.dress} />
          <line x1="593" y1="147" x2="583" y2="155" stroke={P.skin} strokeWidth="3.4"
            strokeLinecap="round" transform={`rotate(${-better * 55} 593 147)`} />
          <line x1="607" y1="147" x2="617" y2="155" stroke={P.skin} strokeWidth="3.4"
            strokeLinecap="round" transform={`rotate(${better * 55} 607 147)`} />
          <circle cx="600" cy="132" r="10" fill={P.skin} />
          <path d="M590 130 a10 10 0 0 1 20 0 q-10 -7 -20 0 Z" fill={P.hair} />
          <path d="M596 136 q4 3.5 8 0" stroke="#c4744f" strokeWidth="1.4" fill="none"
            strokeLinecap="round" opacity={1 - maskOn} />
          <rect x="594" y="133" width="12" height="7" rx="2.5" fill="#e8f1f8"
            stroke="#b9cddb" strokeWidth="0.7" opacity={maskOn} />
          <circle cx="596.6" cy="130.5" r="1.1" fill="#3d2c00" />
          <circle cx="603.4" cy="130.5" r="1.1" fill="#3d2c00" />
        </g>

        {/* Grass tufts — height and colour track vegetation (NDVI) */}
        <g stroke={tuftCol} strokeWidth="2" strokeLinecap="round" fill="none">
          {TUFTS.map((t, i) => (
            <g key={i} transform={`translate(${t.x} ${t.y})`} className="dw-sway"
               style={{ transformOrigin: "50% 100%" }}>
              <path d={`M0 0 L${-2.5} ${-tuftH}`} />
              <path d={`M0 0 L0 ${-tuftH * 1.25}`} />
              <path d={`M0 0 L${2.5} ${-tuftH}`} />
            </g>
          ))}
        </g>

        {/* Flowers: upright and vivid when healthy, drooping and drab when not */}
        {PLANTS.map((pl, i) => {
          const petal = css(mix(P.petalDull, P.petals[i % 3], s.green));
          const h = 9 + s.green * 13; // stem height follows vegetation
          const droop = (1 - s.green) * 26 + worse * 16; // wilt angle
          const dx = droop * 0.22;
          return (
            <g key={i} transform={`translate(${pl.x} ${pl.y})`} className="dw-sway-slow"
               style={{ transformOrigin: "50% 100%" }}>
              <path d={`M0 0 Q ${dx * 0.4} ${-h * 0.55} ${dx} ${-h}`}
                stroke={tuftCol} strokeWidth="2" fill="none" strokeLinecap="round" />
              <g transform={`translate(${dx} ${-h}) rotate(${droop})`}>
                <circle cx="-3.6" cy="0" r="3" fill={petal} />
                <circle cx="3.6" cy="0" r="3" fill={petal} />
                <circle cx="0" cy="-3.6" r="3" fill={petal} />
                <circle cx="0" cy="0" r="3.4" fill={petal} />
                <circle cx="0" cy="0" r="1.5" fill={P.blooms[1]} opacity="0.9" />
              </g>
            </g>
          );
        })}

        {/* Butterflies only turn up when the air is getting cleaner */}
        <g opacity={better} fill="none" stroke={P.flit[0]} strokeWidth="2.4" strokeLinecap="round">
          <g className="dw-flit">
            <path d="M470 120 q7 -7 14 0 q7 -7 14 0" />
          </g>
          <g className="dw-flit dw-flit-2" stroke={P.flit[1]}>
            <path d="M720 108 q6 -6 12 0 q6 -6 12 0" />
          </g>
        </g>

        {/* Haze veil over everything — dulls ground and plants, not just sky */}
        <rect x="0" y="0" width="1200" height="200" fill={css(hazeRGB)} opacity={s.haze * 0.3} />

        {/* Smog puffs when it's getting worse */}
        <g opacity={worse * 0.6} fill="#8d7b66">
          <circle className="dw-puff" cx="250" cy="170" r="5" />
          <circle className="dw-puff dw-puff-2" cx="520" cy="176" r="4" />
          <circle className="dw-puff dw-puff-3" cx="1000" cy="172" r="4.5" />
        </g>
      </svg>

      {/* Progress bar under the scene: while loading it shows the analysis
          actually advancing; afterwards it becomes the before→after timeline. */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 pb-2 pt-1.5">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
          {loading || !measured ? (
            <>
              <span className="dw-shimmer text-neutral-600 dark:text-neutral-300">
                Reading the satellites…
              </span>
              <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                {Math.round(progress * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-neutral-500 dark:text-neutral-400">{dates?.before.date}</span>
              <span
                className={
                  better > 0.15
                    ? "text-emerald-600 dark:text-emerald-400"
                    : worse > 0.15
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-neutral-500"
                }
              >
                {better > 0.15 ? "improving" : worse > 0.15 ? "degrading" : "little change"}
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">{dates?.after.date}</span>
            </>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <div
            className={`h-full rounded-full bg-[var(--accent)] ${loading ? "dw-bar" : ""}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
