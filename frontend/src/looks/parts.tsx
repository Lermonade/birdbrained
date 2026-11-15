// Pieces the backdrops share.

import type { CSSProperties } from "react";

import styles from "./backdrops.module.css";

interface GrainProps {
  id: string; // unique per page
  opacity: number;
  blend: CSSProperties["mixBlendMode"];
}

/** Paper fiber or ink grain over a whole backdrop. */
export function Grain({ id, opacity, blend }: GrainProps) {
  return (
    <svg className={styles.grain} style={{ opacity, mixBlendMode: blend }} aria-hidden="true">
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
        <feColorMatrix values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// One bird, wings up, about 24 wide
const BIRD = "M-12 -1 Q-7 -9 0 0 Q7 -9 12 -1 Q6 -5 0 3 Q-6 -5 -12 -1Z";

interface FlockProps {
  color: string;
  top: string; // how far down the screen it flies
  count?: number;
  size?: number;
  seconds?: number; // to cross the screen
  opacity?: number;
}

/** A V of birds flying left to right, over and over. */
export function Flock({ color, top, count = 7, size = 1, seconds = 90, opacity = 1 }: FlockProps) {
  // The leader in front, the rest trailing back on alternate sides
  const birds = Array.from({ length: count }, (_, i) => {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    return { x: -row * 30 - (i % 3) * 3, y: side * row * 17, scale: 1 - row * 0.05 };
  });

  const rows = Math.ceil((count - 1) / 2);
  const width = rows * 30 + 40;
  const height = rows * 34 + 30;

  return (
    <div
      className={styles.flock}
      // A negative delay starts it part of the way across
      style={{ top, color, opacity, animationDuration: `${seconds}s`, animationDelay: `${-seconds * 0.3}s` }}
    >
      <svg
        viewBox={`${20 - width} ${-height / 2} ${width} ${height}`}
        width={width * size}
        height={height * size}
        fill="currentColor"
      >
        {birds.map((bird, i) => (
          <g key={i} transform={`translate(${bird.x} ${bird.y}) scale(${bird.scale})`}>
            <path className={styles.wingbeat} style={{ animationDelay: `${-i * 0.13}s` }} d={BIRD} />
          </g>
        ))}
      </svg>
    </div>
  );
}
