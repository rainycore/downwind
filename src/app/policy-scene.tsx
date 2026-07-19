"use client";

import { useEffect, useRef, useState } from "react";
import type { DimensionReading } from "@/lib/reader";

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

export const MIN_LOADING_MS = 7000;
const TAU_MS = MIN_LOADING_MS * 0.5;
const FINISH_MS = 900;
const CEILING = 0.9;

// Spread across the full width so the strip reads as landscape, not a vignette.
const TREES = [
  { x: 70, s: 1.0 }, { x: 196, s: 0.72 }, { x: 330, s: 0.88 },
  { x: 900, s: 0.8 }, { x: 1040, s: 1.05 }, { x: 1160, s: 0.7 },
];
const BLOOMS = [
  { x: 130, y: 176 }, { x: 262, y: 184 }, { x: 400, y: 178 }, { x: 470, y: 188 },
  { x: 700, y: 182 }, { x: 960, y: 178 }, { x: 1100, y: 186 },
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
  const dates = readings.find((r) => r.metric);

  // Is this policy making things better or worse? Greener and clearer air both
  // count as better. Drives the celebratory cues (butterflies, blossom, sun).
  const before = measured ? sceneFrom(readings, "before") : LOADING_A;
  const after = measured ? sceneFrom(readings, "after") : LOADING_B;
  const improvement = (after.green - before.green) * 2.2 + (before.haze - after.haze) * 2.2;
  const better = clamp01(improvement) * progress; // reveals as the sweep completes
  const worse = clamp01(-improvement) * progress;

  const hazeRGB: RGB = [150, 125, 95];
  const grass = css(mix([176, 154, 107], [86, 171, 74], s.green));
  const foliage = css(mix([150, 120, 60], [46, 125, 50], s.green));
  const sun = css(mix([255, 213, 79], [255, 112, 67], s.warm));
  const foliageR = 13 + s.green * 9;
  const pondRx = 26 + s.water * 30;
  const maskOn = clamp01((s.haze - 0.32) / 0.22);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[34vh] max-h-[250px] min-h-[160px]">
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="xMidYMax slice"
        className="h-full w-full"
        role="img"
        aria-label="Animated strip showing the measured effect of the policy on air, vegetation and water"
      >
        <defs>
          {/* The air tint fades out upward, so the strip melts into the page
              instead of sitting in a box. */}
          <linearGradient id="dw-air" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={css(hazeRGB)} stopOpacity="0" />
            <stop offset="100%" stopColor={css(hazeRGB)} stopOpacity={s.haze * 0.6} />
          </linearGradient>
          {/* Clear-air glow when the policy improves things. */}
          <linearGradient id="dw-clear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bde9ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#bde9ff" stopOpacity={better * 0.35} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="1200" height="200" fill="url(#dw-clear)" />
        <rect x="0" y="0" width="1200" height="200" fill="url(#dw-air)" />

        {/* sun low on the horizon, warming with temperature */}
        <circle cx="1090" cy="150" r={26 + s.warm * 6} fill={sun} opacity={0.5 + better * 0.3} />

        {/* rolling ground, meeting the bottom edge */}
        <path d="M0 148 Q180 128 380 142 T760 138 T1200 150 L1200 200 L0 200 Z" fill={grass} />

        {TREES.map((t, i) => (
          <g key={i} transform={`translate(${t.x} 150) scale(${t.s})`}>
            <rect x="-4" y="-22" width="8" height="28" rx="3" fill="#6d4c41" />
            <g className="dw-sway" style={{ transformOrigin: "50% 100%" }}>
              <circle cx="0" cy="-34" r={foliageR} fill={foliage} />
              <circle cx="-13" cy="-22" r={foliageR * 0.66} fill={foliage} />
              <circle cx="13" cy="-23" r={foliageR * 0.7} fill={foliage} />
            </g>
          </g>
        ))}

        {/* pond + the duck, paddling */}
        <ellipse cx="820" cy="176" rx={pondRx} ry="11" fill="#7ec8e3" opacity="0.9" />
        <g className="dw-paddle">
          <g className="dw-bob">
            <ellipse cx="820" cy="168" rx="12" ry="8.5" fill="#ffd93d" />
            <circle cx="830" cy="159" r="6.5" fill="#ffd93d" />
            <polygon points="836,159 845,161 836,163" fill="#ff9f1c" />
            <circle cx="831.5" cy="157.5" r="1.3" fill="#3d2c00" />
          </g>
        </g>

        {/* the girl — mask fades in with haze, arms lift when things improve */}
        <ellipse cx="600" cy="186" rx="13" ry="3.5" fill="rgba(0,0,0,.12)" />
        <g className="dw-girl-sway">
          <rect x="596" y="164" width="3" height="18" fill="#5b4636" />
          <rect x="602" y="164" width="3" height="18" fill="#5b4636" />
          <path d="M590 164 L600 138 L610 164 Z" fill="#ef6f9c" />
          <g className="dw-wave" style={{ transformOrigin: "592px 148px" }}>
            <rect x="582" y="146" width="11" height="3" rx="1.5" fill="#ffdbac"
              transform={`rotate(${-18 - better * 40} 592 148)`} />
          </g>
          <rect x="607" y="146" width="11" height="3" rx="1.5" fill="#ffdbac"
            transform={`rotate(${14 + better * 40} 608 148)`} />
          <circle cx="600" cy="132" r="10" fill="#ffdbac" />
          <path d="M590 130 a10 10 0 0 1 20 0 q-10 -7 -20 0 Z" fill="#5b4636" />
          <path d="M596 136 q4 3.5 8 0" stroke="#c4744f" strokeWidth="1.4" fill="none"
            strokeLinecap="round" opacity={1 - maskOn} />
          <rect x="594" y="133" width="12" height="7" rx="2.5" fill="#e8f1f8"
            stroke="#b9cddb" strokeWidth="0.7" opacity={maskOn} />
          <circle cx="596.6" cy="130.5" r="1.1" fill="#3d2c00" />
          <circle cx="603.4" cy="130.5" r="1.1" fill="#3d2c00" />
        </g>

        {/* Blossom that opens as things get better */}
        <g opacity={better}>
          {BLOOMS.map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${b.y})`}>
              <path d="M0 0 L0 -13" stroke="#4c9f5a" strokeWidth="2" strokeLinecap="round" />
              <circle cx="0" cy="-17" r="4" fill={i % 3 === 0 ? "#ff9ec4" : i % 3 === 1 ? "#ffd166" : "#c9a7ff"} />
              <circle cx="-4" cy="-14" r="3.2" fill={i % 3 === 0 ? "#ff9ec4" : i % 3 === 1 ? "#ffd166" : "#c9a7ff"} />
              <circle cx="4" cy="-14" r="3.2" fill={i % 3 === 0 ? "#ff9ec4" : i % 3 === 1 ? "#ffd166" : "#c9a7ff"} />
            </g>
          ))}
        </g>

        {/* Butterflies only turn up when the air is getting cleaner */}
        <g opacity={better} fill="none" stroke="#ff8fc7" strokeWidth="2.4" strokeLinecap="round">
          <g className="dw-flit">
            <path d="M470 120 q7 -7 14 0 q7 -7 14 0" />
          </g>
          <g className="dw-flit dw-flit-2" stroke="#8fd0ff">
            <path d="M720 108 q6 -6 12 0 q6 -6 12 0" />
          </g>
        </g>

        {/* Smog puffs when it's getting worse */}
        <g opacity={worse * 0.6} fill="#8d7b66">
          <circle className="dw-puff" cx="250" cy="170" r="5" />
          <circle className="dw-puff dw-puff-2" cx="520" cy="176" r="4" />
          <circle className="dw-puff dw-puff-3" cx="1000" cy="172" r="4.5" />
        </g>
      </svg>

      {/* A hairline timeline along the very bottom — reinforces "time passing"
          without putting the scene in a box. */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-1">
        <div className="relative h-[3px] w-full rounded-full bg-black/10 dark:bg-white/15">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
          {loading || !measured ? (
            <span className="dw-shimmer">Reading the satellites…</span>
          ) : (
            <>
              <span>{dates?.before.date}</span>
              <span className={better > 0.15 ? "text-emerald-600 dark:text-emerald-400" : worse > 0.15 ? "text-rose-600 dark:text-rose-400" : ""}>
                {better > 0.15 ? "improving" : worse > 0.15 ? "degrading" : ""}
              </span>
              <span>{dates?.after.date}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
