// Decorative storybook meadow behind the whole app: rolling hills, chunky
// outlined trees and flowers, puffy clouds, and a smiling sun that becomes a
// smiling moon with stars after dark. Purely presentational and aria-hidden —
// page content sits on opaque surfaces above it.
//
// Every colour is a --bd-* token, and the day/night scenery swap is pure CSS
// (.bd-day / .bd-night), so switching theme never causes a hydration mismatch.
// Motion is CSS-only and respects prefers-reduced-motion.

const INK = "var(--bd-ink)";
const INK_W = 3;

type Tree = { x: number; y: number; s: number };
type Flower = { x: number; y: number; c: string };

const TREES: Tree[] = [
  { x: 110, y: 706, s: 1.0 },
  { x: 246, y: 688, s: 0.72 },
  { x: 432, y: 702, s: 1.16 },
  { x: 638, y: 690, s: 0.86 },
  { x: 858, y: 686, s: 1.06 },
  { x: 1064, y: 708, s: 0.78 },
];

const FLOWERS: Flower[] = [
  { x: 60, y: 772, c: "var(--bd-flower-a)" },
  { x: 168, y: 784, c: "var(--bd-flower-b)" },
  { x: 305, y: 768, c: "var(--bd-flower-c)" },
  { x: 396, y: 788, c: "var(--bd-flower-a)" },
  { x: 528, y: 774, c: "var(--bd-flower-b)" },
  { x: 690, y: 786, c: "var(--bd-flower-c)" },
  { x: 792, y: 770, c: "var(--bd-flower-a)" },
  { x: 930, y: 784, c: "var(--bd-flower-b)" },
  { x: 1080, y: 772, c: "var(--bd-flower-c)" },
  { x: 1160, y: 788, c: "var(--bd-flower-a)" },
];

// Clouds at assorted heights and sizes; each index maps to a .bd-cloud-N rule
// in globals.css that sets its drift speed and start offset.
const CLOUDS = [
  { y: 128, s: 1.0 },
  { y: 246, s: 0.72 },
  { y: 74, s: 0.5 },
  { y: 188, s: 0.86 },
  { y: 330, s: 0.6 },
  { y: 40, s: 0.68 },
  { y: 420, s: 0.44 },
];

// A few stars, only visible at night (--bd-star is transparent by day).
const STARS = [
  { x: 120, y: 96, r: 3 }, { x: 300, y: 60, r: 2.4 }, { x: 470, y: 130, r: 3.2 },
  { x: 610, y: 72, r: 2.2 }, { x: 760, y: 150, r: 2.8 }, { x: 200, y: 210, r: 2.4 },
  { x: 880, y: 96, r: 3 }, { x: 1140, y: 250, r: 2.6 }, { x: 60, y: 320, r: 2.2 },
  { x: 400, y: 260, r: 2.6 }, { x: 980, y: 330, r: 2.4 }, { x: 700, y: 300, r: 2.2 },
];

function TreeShape({ x, y, s }: Tree) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect
        x="-7" y="-34" width="14" height="44" rx="6"
        fill="var(--bd-trunk)" stroke={INK} strokeWidth={INK_W}
      />
      <g className="bd-sway" style={{ transformOrigin: "50% 100%" }}>
        <circle cx="-24" cy="-34" r="21" fill="var(--bd-tree-2)" stroke={INK} strokeWidth={INK_W} />
        <circle cx="24" cy="-36" r="22" fill="var(--bd-tree-2)" stroke={INK} strokeWidth={INK_W} />
        <circle cx="0" cy="-54" r="31" fill="var(--bd-tree)" stroke={INK} strokeWidth={INK_W} />
      </g>
    </g>
  );
}

function FlowerShape({ x, y, c }: Flower) {
  // NOTE: the positioning transform and the animation must live on separate
  // elements — a CSS `transform` from an animation overrides the SVG transform
  // *attribute*, which would otherwise collapse every flower to the origin.
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="bd-sway-slow" style={{ transformOrigin: "50% 100%" }}>
        <path d="M0 0 L0 -26" stroke="var(--bd-stem)" strokeWidth="4" strokeLinecap="round" />
        <g stroke={INK} strokeWidth="2.2">
          <circle cx="-9" cy="-27" r="6.5" fill={c} />
          <circle cx="9" cy="-27" r="6.5" fill={c} />
          <circle cx="0" cy="-42" r="6.5" fill={c} />
          <circle cx="0" cy="-32" r="7.5" fill={c} />
        </g>
        <circle cx="0" cy="-32" r="3.4" fill="var(--bd-flower-core)" />
      </g>
    </g>
  );
}

function Cloud({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      {/* one outlined silhouette so the puffs read as a single cloud */}
      <path
        d="M-62 14 a26 26 0 0 1 6 -50 a34 34 0 0 1 58 -14 a30 30 0 0 1 46 20 a24 24 0 0 1 -6 44 Z"
        fill="var(--bd-cloud)"
        stroke={INK}
        strokeWidth={INK_W}
        strokeLinejoin="round"
      />
    </g>
  );
}

// A cheerful face — rosy cheeks and a curved smile — shared by sun and moon.
function Face({ color }: { color: string }) {
  return (
    <g>
      <circle cx="-16" cy="-6" r="4" fill={color} />
      <circle cx="16" cy="-6" r="4" fill={color} />
      <path d="M-15 10 q15 14 30 0" stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="-27" cy="6" r="6" fill={color} opacity="0.35" />
      <circle cx="27" cy="6" r="6" fill={color} opacity="0.35" />
    </g>
  );
}

export default function CartoonBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
      >
        <defs>
          <linearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bd-sky-1)" />
            <stop offset="62%" stopColor="var(--bd-sky-2)" />
            <stop offset="100%" stopColor="var(--bd-sky-3)" />
          </linearGradient>
        </defs>

        <rect width="1200" height="800" fill="url(#bd-sky)" />

        {/* stars — transparent by day, twinkling at night */}
        <g>
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="var(--bd-star)"
              className={`bd-twinkle${i % 3 === 1 ? " bd-twinkle-2" : i % 3 === 2 ? " bd-twinkle-3" : ""}`}
            />
          ))}
        </g>

        <g transform="translate(1012 132)">
          {/* daytime: smiling sun with slowly turning rays */}
          <g className="bd-day">
            <circle r="118" fill="var(--bd-sun)" opacity="0.16" />
            <g className="bd-rays" style={{ transformOrigin: "50% 50%" }}>
              {Array.from({ length: 12 }, (_, i) => (
                <rect
                  key={i}
                  x="-5" y="-114" width="10" height="26" rx="5"
                  fill="var(--bd-sun)" stroke={INK} strokeWidth="2"
                  transform={`rotate(${i * 30})`}
                />
              ))}
            </g>
            <circle r="56" fill="var(--bd-sun)" stroke={INK} strokeWidth={INK_W} />
            <Face color="var(--bd-sun-face)" />
          </g>

          {/* night: the same friendly face on a crescent-lit moon */}
          <g className="bd-night">
            <circle r="104" fill="var(--bd-sun)" opacity="0.12" />
            <circle r="56" fill="var(--bd-sun)" stroke={INK} strokeWidth={INK_W} />
            {/* soft craters */}
            <circle cx="-26" cy="-26" r="9" fill="var(--bd-sun-face)" opacity="0.28" />
            <circle cx="30" cy="-30" r="6" fill="var(--bd-sun-face)" opacity="0.22" />
            <circle cx="22" cy="28" r="7" fill="var(--bd-sun-face)" opacity="0.2" />
            <Face color="var(--bd-sun-face)" />
          </g>
        </g>

        {/* Drifting clouds at several depths/speeds. The animated group carries
            only the horizontal drift; the height sits on an inner group so the
            CSS transform can't override it (see FlowerShape). */}
        {CLOUDS.map((c, i) => (
          <g key={i} className={`bd-cloud bd-cloud-${i + 1}`}>
            <g transform={`translate(0 ${c.y})`}>
              <Cloud scale={c.s} />
            </g>
          </g>
        ))}

        {/* two little birds gliding (day only — they're asleep at night) */}
        <g
          className="bd-bird bd-day"
          stroke="var(--bd-bird)"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        >
          <path d="M0 330 q11 -10 22 0 q11 -10 22 0" />
          <path d="M58 362 q8 -7 16 0 q8 -7 16 0" opacity="0.75" />
        </g>

        {/* rolling meadow hills */}
        <path
          d="M0 636 Q210 556 430 618 T830 598 T1200 646 L1200 800 L0 800 Z"
          fill="var(--bd-hill-back)"
          stroke={INK}
          strokeWidth={INK_W}
        />
        <path
          d="M0 702 Q262 628 522 690 T1002 680 T1200 722 L1200 800 L0 800 Z"
          fill="var(--bd-hill-front)"
          stroke={INK}
          strokeWidth={INK_W}
        />

        {TREES.map((t, i) => (
          <TreeShape key={i} {...t} />
        ))}
        {FLOWERS.map((f, i) => (
          <FlowerShape key={i} {...f} />
        ))}
      </svg>
    </div>
  );
}
