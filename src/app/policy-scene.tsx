"use client";

import { useEffect, useRef, useState } from "react";
import type { DimensionReading } from "@/lib/reader";

// A small cartoon scene that visualises the policy's MEASURED effect: sky haze
// comes from aerosol (AOD), the tree's fullness from vegetation (NDVI), the sun
// from land-surface temperature, the pond from precipitation.
//
// It is a continuous animation, not a two-frame flip: a requestAnimationFrame
// loop sweeps a 0..1 clock that every visual property is interpolated against,
// so the world is always mid-change. While an analysis is still loading it
// breathes between a healthy and a stressed world; once readings arrive it
// sweeps between the real before and after satellite values.

type Phase = "before" | "after";
type Scene = { green: number; haze: number; warm: number; water: number };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// While loading we have no measurements yet — sweep between a thriving and a
// stressed world so the scene reads as "still working".
const LOADING_A: Scene = { green: 0.85, haze: 0.08, warm: 0.35, water: 0.6 };
const LOADING_B: Scene = { green: 0.4, haze: 0.55, warm: 0.72, water: 0.3 };
const NEUTRAL: Scene = { green: 0.65, haze: 0.15, warm: 0.4, water: 0.45 };

// Normalise physical units into 0..1 scene knobs.
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
    green: ndvi == null ? NEUTRAL.green : clamp01(ndvi / 0.85), // NDVI 0..0.85
    haze: aod == null ? NEUTRAL.haze : clamp01(aod / 0.6), // AOD 0..0.6
    warm: lst == null ? NEUTRAL.warm : clamp01((lst - 5) / 30), // 5..35 °C
    water: precip == null ? NEUTRAL.water : clamp01(precip / 1.5), // 0..1.5 mm/hr
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

const CYCLE_MS = 7000; // one full there-and-back sweep

export default function PolicyScene({
  readings,
  loading = false,
}: {
  readings: DimensionReading[];
  loading?: boolean;
}) {
  // `t` sweeps 0→1→0 forever, easing at the turns. Every visual property is a
  // function of it, so nothing ever "jumps" between two states.
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setT(1); // hold the "after" state rather than animating
      return;
    }
    let start: number | null = null;
    const tick = (ts: number) => {
      start ??= ts;
      const p = ((ts - start) % CYCLE_MS) / CYCLE_MS; // 0..1 sawtooth
      const tri = p < 0.5 ? p * 2 : 2 - p * 2; // 0..1..0 ping-pong
      setT(tri * tri * (3 - 2 * tri)); // smoothstep easing
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const measured = readings.some((r) => r.metric);
  const from = loading || !measured ? LOADING_A : sceneFrom(readings, "before");
  const to = loading || !measured ? LOADING_B : sceneFrom(readings, "after");
  const s = lerpScene(from, to, t);

  const dates = readings.find((r) => r.metric);

  // Derived palette — every colour is a continuous function of a measured value.
  const sky = css(mix(mix([142, 203, 255], [201, 178, 140], s.haze), [255, 183, 120], s.warm * 0.2));
  const grass = css(mix([176, 154, 107], [86, 171, 74], s.green));
  const foliage = css(mix([150, 120, 60], [46, 125, 50], s.green));
  const sun = css(mix([255, 213, 79], [255, 112, 67], s.warm));
  const foliageR = 11 + s.green * 8; // canopy grows with NDVI
  const pondRx = 12 + s.water * 22; // pond widens with precipitation
  const maskOn = clamp01((s.haze - 0.32) / 0.22); // mask fades in with haze
  const puffOn = clamp01((s.haze - 0.28) / 0.3);
  const sunY = 26 - s.warm * 4; // sun rides a little higher when hotter
  const duckX = Math.sin(t * Math.PI * 2) * (pondRx * 0.3); // duck paddles about

  return (
    <figure className="pointer-events-none fixed bottom-4 right-4 z-40 hidden w-[208px] rounded-xl border border-neutral-200 bg-white/90 p-2 shadow-lg backdrop-blur sm:block dark:border-neutral-700 dark:bg-neutral-900/90">
      <svg viewBox="0 0 200 150" role="img" aria-label="Animated scene showing the measured effect of the policy" className="w-full rounded-lg">
        <rect x="0" y="0" width="200" height="150" fill={sky} />

        {/* sun — colour, height and glow all track temperature */}
        <circle cx="168" cy={sunY} r={20 + s.warm * 6} fill={sun} opacity={0.18} />
        <circle cx="168" cy={sunY} r={13 + s.warm * 3} fill={sun} />

        <g className="dw-drift" opacity={0.85}>
          <ellipse cx="45" cy="26" rx="16" ry="8" fill="#ffffff" />
          <ellipse cx="58" cy="28" rx="11" ry="6" fill="#ffffff" />
        </g>

        <rect x="0" y="104" width="200" height="46" fill={grass} />

        {/* tree — canopy size + colour track NDVI */}
        <rect x="34" y="66" width="7" height="42" rx="2" fill="#6d4c41" />
        <g className="dw-sway" style={{ transformOrigin: "38px 70px" }}>
          <circle cx="38" cy="62" r={foliageR} fill={foliage} />
          <circle cx="26" cy="72" r={foliageR * 0.68} fill={foliage} />
          <circle cx="50" cy="70" r={foliageR * 0.72} fill={foliage} />
        </g>
        {/* a leaf drifts down as the canopy thins */}
        <circle className="dw-fall" cx="46" cy="78" r="1.8" fill={foliage} opacity={clamp01((0.75 - s.green) * 2)} />

        {/* pond — width tracks precipitation */}
        <ellipse cx="148" cy="128" rx={pondRx} ry="9" fill="#7ec8e3" opacity={0.9} />

        {/* the cute yellow duck, bobbing and paddling across the pond */}
        <g className="dw-bob" transform={`translate(${duckX} 0)`}>
          <ellipse cx="148" cy="122" rx="10" ry="7" fill="#ffd93d" />
          <circle cx="156" cy="115" r="5.5" fill="#ffd93d" />
          <polygon points="161,115 168,117 161,119" fill="#ff9f1c" />
          <circle cx="157.5" cy="113.5" r="1.1" fill="#3d2c00" />
          <path d="M143 122 q5 4 10 0" stroke="#f0c419" strokeWidth="1.2" fill="none" />
        </g>

        {/* cartoon girl — her mask fades in as measured haze rises */}
        <g>
          <ellipse cx="95" cy="126" rx="11" ry="3" fill="rgba(0,0,0,.12)" />
          <rect x="92" y="108" width="2.5" height="14" fill="#5b4636" />
          <rect x="97" y="108" width="2.5" height="14" fill="#5b4636" />
          <path d="M87 108 L95 88 L103 108 Z" fill="#ef6f9c" />
          <g className="dw-wave" style={{ transformOrigin: "88px 96px" }}>
            <rect x="80" y="94" width="9" height="2.4" rx="1.2" fill="#ffdbac" transform="rotate(-18 88 96)" />
          </g>
          <rect x="101" y="94" width="9" height="2.4" rx="1.2" fill="#ffdbac" transform="rotate(14 102 96)" />
          <circle cx="95" cy="84" r="8" fill="#ffdbac" />
          <path d="M87 82 a8 8 0 0 1 16 0 q-8 -6 -16 0 Z" fill="#5b4636" />
          <path d="M92 87 q3 2.5 6 0" stroke="#c4744f" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity={1 - maskOn} />
          <rect x="90" y="85" width="10" height="5.5" rx="2" fill="#e8f1f8" stroke="#b9cddb" strokeWidth="0.6" opacity={maskOn} />
          <circle cx="92.3" cy="83" r="0.9" fill="#3d2c00" />
          <circle cx="97.7" cy="83" r="0.9" fill="#3d2c00" />
        </g>

        {/* smog veil + rising puffs, scaled continuously by measured aerosol */}
        <rect x="0" y="0" width="200" height="150" fill="rgb(150,125,95)" opacity={s.haze * 0.45} />
        <g opacity={puffOn * 0.55} fill="#8d7b66">
          <circle className="dw-puff" cx="120" cy="113" r="3.5" />
          <circle className="dw-puff dw-puff-2" cx="70" cy="115" r="2.6" />
          <circle className="dw-puff dw-puff-3" cx="175" cy="112" r="3" />
        </g>
      </svg>

      <figcaption className="mt-1 px-1 text-[10px] text-neutral-500">
        {loading || !measured ? (
          <span className="dw-shimmer font-medium">Reading the satellites…</span>
        ) : (
          <>
            {/* a timeline the sweep rides along, so the motion reads as time passing */}
            <div className="relative h-0.5 w-full rounded bg-neutral-200 dark:bg-neutral-700">
              <div
                className="absolute -top-[3px] h-2 w-2 rounded-full bg-emerald-500"
                style={{ left: `calc(${t * 100}% - 4px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between">
              <span>{dates?.before.date}</span>
              <span>{dates?.after.date}</span>
            </div>
          </>
        )}
      </figcaption>
    </figure>
  );
}
