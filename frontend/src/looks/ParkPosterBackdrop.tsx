import type { CSSProperties } from "react";

import { Flock } from "./parts";
import type { BackdropProps } from "./types";
import { useSceneProgress } from "./useSceneProgress";
import { rng } from "./world";

import styles from "./backdrops.module.css";

const WIDTH = 1600;
const HEIGHT = 400;

// A ridgeline's height at x: three waves of different lengths
function ridgeline(seed: number, base: number, rise: number) {
  const random = rng(seed);
  const [a, b, c] = [random() * 6, random() * 6, random() * 6];

  return (x: number) =>
    base - rise * (0.55 * Math.sin(x / 250 + a) + 0.3 * Math.sin(x / 95 + b) + 0.15 * Math.sin(x / 38 + c));
}

// Straight runs between points, so the ridges are cut, not smooth
function ridgePath(height: (x: number) => number, step: number): string {
  let d = `M0 ${HEIGHT}`;
  for (let x = 0; x <= WIDTH; x += step) d += ` L${x} ${height(x).toFixed(1)}`;
  return `${d} L${WIDTH} ${HEIGHT} Z`;
}

// A row of conifers standing on a ridge
function treeline(height: (x: number) => number, seed: number): string {
  const random = rng(seed);
  let d = "";

  for (let x = 0; x < WIDTH; x += 5 + random() * 9) {
    const foot = height(x) + 3;
    const tall = 12 + random() * 26;
    const wide = 3.5 + tall * 0.16;
    d += `M${(x - wide).toFixed(1)} ${foot.toFixed(1)} L${x.toFixed(1)} ${(foot - tall).toFixed(1)} L${(x + wide).toFixed(1)} ${foot.toFixed(1)} Z `;
  }

  return d;
}

const far = ridgeline(11, 215, 60);
const middle = ridgeline(23, 275, 48);
const near = ridgeline(37, 335, 34);

// Far to near: paler and hazier in the distance
const RIDGES = [
  { fill: "#6b4f78", sink: "34vh", d: ridgePath(far, 40) },
  { fill: "#3d3a62", sink: "50vh", d: ridgePath(middle, 32) },
  { fill: "#14263a", sink: "74vh", d: `${ridgePath(near, 26)} ${treeline(near, 5)}` },
];

export default function ParkPosterBackdrop({ scene }: BackdropProps) {
  const ref = useSceneProgress(scene);

  return (
    <div ref={ref} className={styles.backdrop} aria-hidden="true">
      <div className={styles.sky} />
      <div className={styles.sun} />

      <Flock color="#fbf1dc" top="27%" count={9} opacity={0.8} seconds={110} />

      {RIDGES.map(ridge => (
        <svg
          key={ridge.fill}
          className={styles.ridge}
          style={{ "--sink": ridge.sink } as CSSProperties}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMax slice"
        >
          <path d={ridge.d} fill={ridge.fill} />
        </svg>
      ))}
    </div>
  );
}
