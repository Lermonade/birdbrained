// The key to the globe: how big a stamp is for how many sightings, or what the
// heatmap's colors mean. Both read the globe's own scales, so they always match it.

import type { Basis } from "../../api/client";
import { VisualizationType } from "../globe_visualization/GlobeVisualization";
import { heatmapCss, heatmapPosition, STAMP_MAX_DEG, stampRadius } from "../globe_visualization/scales";
import styles from "./legend.module.css";

interface LegendProps {
  type: VisualizationType;
  maxCount: number; // the top of the stamps' scale (see globeData.ts maxCount)
  heatmapMax: number; // the darkest heatmap color (see globeData.ts maxRegionTotal)
  basis: Basis;
  year: number;
}

// The biggest circle in the key, px
const KEY_RADIUS = 28;
const KEY_WIDTH = 140;
const LABEL_GAP = 14; // labels at least this far apart, px
const LABEL_X = KEY_RADIUS * 2 + 14;

// Down to two significant figures, so the key reads 11,000 rather than 11,873 (and never
// shows more than the biggest stamp on the globe)
function roundNicely(value: number): number {
  if (value < 10) return Math.max(1, Math.floor(value));
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.floor(value / magnitude) * magnitude;
}

function keyValues(max: number): number[] {
  return [...new Set([max, max / 4, max / 20].map(roundNicely))];
}

// Each value's circle, standing on the key's bottom edge, and where its label goes: level
// with the circle's top, pushed down when it would crowd the label above
function layoutKey(values: number[], max: number, bottom: number) {
  const marks: { value: number; r: number; top: number; labelY: number }[] = [];

  for (const value of values) {
    const r = (stampRadius(Math.sqrt(value / max)) / STAMP_MAX_DEG) * KEY_RADIUS;
    const top = bottom - r * 2;
    const above = marks[marks.length - 1];
    marks.push({ value, r, top, labelY: above ? Math.max(top, above.labelY + LABEL_GAP) : top });
  }

  return marks;
}

// The heatmap's tick values: 0, a hundredth of the top, a tenth, and the top of the ramp
function heatmapValues(max: number): number[] {
  return [0, ...new Set([max / 100, max / 10, max].map(roundNicely))];
}

export default function Legend({ type, maxCount, heatmapMax, basis, year }: LegendProps) {
  const title = `${basis === "corrected" ? "Population" : "Sightings"} in ${year}`;

  if (type === VisualizationType.HEATMAP) {
    return (
      <aside className={styles.legend} aria-label="Heatmap key">
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.scale}>
          <div className={styles.ticks}>
            <div className={styles.ramp} style={{ backgroundImage: heatmapCss() }} />
            {heatmapValues(heatmapMax).map(value => (
              <span
                key={value}
                className={styles.tick}
                style={{ left: `${heatmapPosition(value, heatmapMax) * 100}%` }}
              >
                <span className={styles.tickLabel}>{value.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  const values = keyValues(maxCount);
  const height = KEY_RADIUS * 2 + 4;
  const bottom = height - 2;

  const marks = layoutKey(values, maxCount, bottom);

  return (
    <aside className={styles.legend} aria-label="Stamp size key">
      <h2 className={styles.title}>{title}</h2>
      <svg className={styles.key} width={KEY_WIDTH} height={height} role="img"
        aria-label={values.map(v => v.toLocaleString()).join(", ") + " sightings"}>
        {marks.map(({ value, r, top, labelY }) => (
          <g key={value}>
            <circle className={styles.circle} cx={KEY_RADIUS + 1} cy={bottom - r} r={r} />
            <polyline
              className={styles.leader}
              points={`${KEY_RADIUS + 1},${top} ${LABEL_X - 10},${top} ${LABEL_X - 4},${labelY}`}
            />
            <text className={styles.value} x={LABEL_X} y={labelY} dominantBaseline="middle">
              {value.toLocaleString()}
            </text>
          </g>
        ))}
      </svg>
    </aside>
  );
}
