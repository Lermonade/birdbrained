import type { Ref } from "react";

import { BIRD_ART } from "./birdArt";

import styles from "./landing.module.css";

interface BirdProps {
  ref: Ref<HTMLDivElement>;
}

// The landing moves this by writing to the root element directly, every frame:
//   transform         where it is, which way it points, how big
//   --perched         0 to 1, how much of the sitting pose shows
//   --flap            0 to 1, where the wings are in a beat (placeholder art)
//   --frame           which sprite frame shows, as a background position (sprite art)
export default function Bird({ ref }: BirdProps) {
  if (BIRD_ART.type === "sprite") {
    return (
      <div ref={ref} className={styles.bird} aria-hidden="true">
        <div
          className={styles.sprite}
          style={{
            aspectRatio: `${BIRD_ART.frameWidth} / ${BIRD_ART.frameHeight}`,
            backgroundImage: `url(${BIRD_ART.src})`,
            backgroundSize: `${BIRD_ART.frames * 100}% 100%`,
          }}
        />
      </div>
    );
  }

  return (
    <div ref={ref} className={styles.bird} aria-hidden="true">
      {/* Sitting, seen from the side, facing right. Its feet are the anchor point. */}
      <svg className={styles.perchedArt} viewBox="0 0 60 48">
        <path d="M17 31 L1 38 L5 30 L15 26 Z" />
        <ellipse cx="29" cy="28" rx="15.5" ry="11" transform="rotate(-16 29 28)" />
        <circle cx="42" cy="17" r="8" />
        <path d="M48.5 14.5 L57 18 L48.5 20.5 Z" />
        <path d="M27 37 L27 46 M33 37 L33 46" className={styles.legs} />
        <circle cx="44.5" cy="15.5" r="1.4" className={styles.eye} />
      </svg>

      {/* Flying, seen from above, heading right. A swift: a cigar with sickle wings. */}
      <svg className={styles.flyingArt} viewBox="-50 -62 100 124">
        <g className={styles.wing}>
          <path d="M10 -4 C9 -28 -4 -47 -31 -57 C-17 -41 -10 -24 -11 -3 Z" />
        </g>
        <g className={`${styles.wing} ${styles.wingFar}`}>
          <path d="M10 4 C9 28 -4 47 -31 57 C-17 41 -10 24 -11 3 Z" />
        </g>
        <path d="M-29 0 L-44 -7 L-39 0 L-44 7 Z" />
        <path d="M30 0 C30 -6 16 -8.5 0 -7.5 C-15 -6.5 -27 -3.5 -35 0 C-27 3.5 -15 6.5 0 7.5 C16 8.5 30 6 30 0 Z" />
      </svg>
    </div>
  );
}
