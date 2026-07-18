"use client";

import { useEffect, useState } from "react";
import type { DimensionReading } from "@/lib/reader";

// A small cartoon scene that visualises the policy's MEASURED effect: sky haze
// comes from aerosol (AOD), the tree's fullness from vegetation (NDVI), the sun
// from land-surface temperature, the pond from precipitation. It loops between
// the before and after readings so you can watch the change happen.

type Phase = "before" | "after";
type Scene = { green: number; haze: number; warm: number; water: number };

const NEUTRAL: Scene = { green: 0.65, haze: 0.15, warm: 0.4, water: 0.45 };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

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

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB =>
  a.map((v, i) => Math.round(v + (b[i] - v) * clamp01(t))) as unknown as RGB;
const css = (c: RGB) => `rgb(${c.join(",")})`;

export default function PolicyScene({
  readings,
  initialPhase = "before", // overridable so a single frame can be previewed/tested
}: {
  readings: DimensionReading[];
  initialPhase?: Phase;
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase);

  // Loop before → after so the change is visible without interaction.
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p === "before" ? "after" : "before")), 3200);
    return () => clearInterval(id);
  }, []);

  const s = sceneFrom(readings, phase);
  const dates = readings.find((r) => r.metric) ?? readings[0];
  const label = phase === "before" ? dates?.before.date : dates?.after.date;

  // Derived palette — every colour is a function of a measured value.
  const sky = css(mix(mix([142, 203, 255], [201, 178, 140], s.haze), [255, 183, 120], s.warm * 0.2));
  const grass = css(mix([176, 154, 107], [86, 171, 74], s.green));
  const foliage = css(mix([150, 120, 60], [46, 125, 50], s.green));
  const sun = css(mix([255, 213, 79], [255, 112, 67], s.warm));
  const foliageR = 11 + s.green * 8; // canopy grows with NDVI
  const pondRx = 12 + s.water * 22; // pond widens with precipitation
  const ease = { transition: "all 1400ms cubic-bezier(.4,0,.2,1)" } as const;

  return (
    <figure className="pointer-events-none fixed bottom-4 right-4 z-40 hidden w-[208px] rounded-xl border border-neutral-200 bg-white/90 p-2 shadow-lg backdrop-blur sm:block dark:border-neutral-700 dark:bg-neutral-900/90">
      <svg viewBox="0 0 200 150" role="img" aria-label="Cartoon scene showing the measured effect of the policy" className="w-full rounded-lg">
        {/* sky */}
        <rect x="0" y="0" width="200" height="150" fill={sky} style={ease} />

        {/* sun — colour and glow track temperature */}
        <circle cx="168" cy="26" r={13 + s.warm * 3} fill={sun} style={ease} className="dw-pulse" />
        <circle cx="168" cy="26" r={20 + s.warm * 6} fill={sun} opacity={0.18} style={ease} />

        {/* drifting clouds */}
        <g className="dw-drift" opacity={0.85}>
          <ellipse cx="45" cy="26" rx="16" ry="8" fill="#ffffff" />
          <ellipse cx="58" cy="28" rx="11" ry="6" fill="#ffffff" />
        </g>

        {/* ground */}
        <rect x="0" y="104" width="200" height="46" fill={grass} style={ease} />

        {/* tree — canopy size + colour track NDVI */}
        <g>
          <rect x="34" y="66" width="7" height="42" rx="2" fill="#6d4c41" />
          <g className="dw-sway" style={{ transformOrigin: "38px 70px" }}>
            <circle cx="38" cy="62" r={foliageR} fill={foliage} style={ease} />
            <circle cx="26" cy="72" r={foliageR * 0.68} fill={foliage} style={ease} />
            <circle cx="50" cy="70" r={foliageR * 0.72} fill={foliage} style={ease} />
          </g>
        </g>

        {/* pond — width tracks precipitation */}
        <ellipse cx="148" cy="128" rx={pondRx} ry="9" fill="#7ec8e3" opacity={0.9} style={ease} />

        {/* the cute yellow duck, bobbing on the pond */}
        <g className="dw-bob">
          <ellipse cx="148" cy="122" rx="10" ry="7" fill="#ffd93d" />
          <circle cx="156" cy="115" r="5.5" fill="#ffd93d" />
          <polygon points="161,115 168,117 161,119" fill="#ff9f1c" />
          <circle cx="157.5" cy="113.5" r="1.1" fill="#3d2c00" />
          <path d="M143 122 q5 4 10 0" stroke="#f0c419" strokeWidth="1.2" fill="none" />
        </g>

        {/* cartoon girl — wears a mask when the measured haze is high */}
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
          {s.haze > 0.45 ? (
            <rect x="90" y="85" width="10" height="5.5" rx="2" fill="#e8f1f8" stroke="#b9cddb" strokeWidth="0.6" />
          ) : (
            <path d="M92 87 q3 2.5 6 0" stroke="#c4744f" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          )}
          <circle cx="92.3" cy="83" r="0.9" fill="#3d2c00" />
          <circle cx="97.7" cy="83" r="0.9" fill="#3d2c00" />
        </g>

        {/* smog veil + rising puffs, scaled by measured aerosol */}
        <rect x="0" y="0" width="200" height="150" fill="rgb(150,125,95)" opacity={s.haze * 0.45} style={ease} />
        {s.haze > 0.4 && (
          <g opacity={Math.min(0.5, s.haze * 0.6)} fill="#8d7b66">
            <circle className="dw-puff" cx="120" cy="113" r="3.5" />
            <circle className="dw-puff dw-puff-2" cx="70" cy="115" r="2.6" />
            <circle className="dw-puff dw-puff-3" cx="175" cy="112" r="3" />
          </g>
        )}
      </svg>

      <figcaption className="mt-1 flex items-center justify-between px-1 text-[10px] text-neutral-500">
        <span className="font-medium capitalize">{phase}</span>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}
