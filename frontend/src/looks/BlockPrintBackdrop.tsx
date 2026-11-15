import { Flock, Grain } from "./parts";
import type { BackdropProps } from "./types";
import { useSceneProgress } from "./useSceneProgress";
import { rng } from "./world";

import styles from "./backdrops.module.css";

const MOON = 100; // radius, in a box that runs -250 to 250

// Broken rings cut around the moon: each is a circle stroked in dashes of uneven length
const RINGS = (() => {
  const random = rng(19);

  return Array.from({ length: 13 }, (_, i) => {
    const dashes = Array.from({ length: 8 }, () => (14 + random() * 70).toFixed(0)).join(" ");
    return { radius: MOON + 9 + i * 10.5, width: 1.6 + random() * 1.8, dashes, turn: random() * 360 };
  });
})();

// Gouges across the moon's face
const CRATERS = (() => {
  const random = rng(8);

  return Array.from({ length: 22 }, () => {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * MOON * 0.82;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      length: 5 + random() * 16,
      width: 1.2 + random() * 2.2,
    };
  });
})();

const REEDS_WIDTH = 1600;
const REEDS_HEIGHT = 320;

// Cattails: a bent stem, a fat head near the top, and a blade or two beside it
const REEDS = (() => {
  const random = rng(42);
  const stems: { d: string; head: string; front: boolean }[] = [];
  let blades = "";

  for (let i = 0; i < 64; i++) {
    const x = random() * REEDS_WIDTH;
    const tall = 110 + random() * 190;
    const lean = (random() - 0.5) * 50;

    const foot = REEDS_HEIGHT;
    const bend = { x, y: foot - tall * 0.6 };
    const tip = { x: x + lean, y: foot - tall };
    const along = (t: number) => ({
      x: (1 - t) * (1 - t) * x + 2 * (1 - t) * t * bend.x + t * t * tip.x,
      y: (1 - t) * (1 - t) * foot + 2 * (1 - t) * t * bend.y + t * t * tip.y,
    });

    const from = along(0.7);
    const to = along(0.9);
    stems.push({
      d: `M${x.toFixed(0)} ${foot} Q${bend.x.toFixed(0)} ${bend.y.toFixed(0)} ${tip.x.toFixed(0)} ${tip.y.toFixed(0)}`,
      head: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
      front: random() > 0.45,
    });

    const reach = (random() - 0.5) * 150;
    const high = foot - tall * (0.5 + random() * 0.35);
    blades += `M${(x - 5).toFixed(0)} ${foot} Q${(x + reach * 0.3).toFixed(0)} ${(foot - tall * 0.5).toFixed(0)} ${(x + reach).toFixed(0)} ${high.toFixed(0)} Q${(x + reach * 0.5).toFixed(0)} ${(foot - tall * 0.3).toFixed(0)} ${(x + 6).toFixed(0)} ${foot} Z `;
  }

  return { stems, blades };
})();

const BACK = "#1c4238";
const FRONT = "#2b5f50";

export default function BlockPrintBackdrop({ scene }: BackdropProps) {
  const ref = useSceneProgress(scene);

  return (
    <div ref={ref} className={styles.backdrop} aria-hidden="true">
      <svg className={styles.moon} viewBox="-250 -250 500 500">
        <g fill="none" stroke="#1d4037" strokeLinecap="round">
          {RINGS.map(ring => (
            <circle
              key={ring.radius}
              r={ring.radius}
              strokeWidth={ring.width}
              strokeDasharray={ring.dashes}
              transform={`rotate(${ring.turn})`}
            />
          ))}
        </g>

        <circle r={MOON} fill="#c9583b" />
        <g stroke="#a9432a" strokeLinecap="round">
          {CRATERS.map((crater, i) => (
            <path key={i} d={`M${crater.x} ${crater.y} h${crater.length}`} strokeWidth={crater.width} />
          ))}
        </g>
      </svg>

      <Flock color="#eee3c6" top="20%" count={9} size={1.15} seconds={100} />

      <svg
        className={styles.reeds}
        viewBox={`0 0 ${REEDS_WIDTH} ${REEDS_HEIGHT}`}
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        strokeLinecap="round"
      >
        <path d={REEDS.blades} fill={BACK} />
        {REEDS.stems.map((stem, i) => (
          <g key={i} stroke={stem.front ? FRONT : BACK}>
            <path d={stem.d} strokeWidth="3" />
            <path d={stem.head} strokeWidth="11" />
          </g>
        ))}
      </svg>

      <Grain id="block-print-grain" opacity={0.16} blend="overlay" />
    </div>
  );
}
