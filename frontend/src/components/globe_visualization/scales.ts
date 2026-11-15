// The two scales the globe draws data with. The legend reads these too, so its key
// always matches what's on the globe.

// Stamp radius in degrees of arc, from a size of 0 (fewest sightings) to 1 (most).
// Callers pass size = sqrt(count / max), so a stamp's area follows its count.
export const STAMP_MIN_DEG = 0.35;
export const STAMP_MAX_DEG = 2.2;

export function stampRadius(size: number): number {
  return STAMP_MIN_DEG + (STAMP_MAX_DEG - STAMP_MIN_DEG) * Math.min(Math.max(size, 0), 1);
}

// Heatmap: one warm hue, pale where sightings are sparse and dark where they're dense.
// The pale end also fades out, so a few sightings barely tint the map.
export const HEATMAP_RAMP: { position: number; color: [number, number, number] }[] = [
  { position: 0, color: [253, 231, 196] }, // #fde7c4
  { position: 0.35, color: [246, 178, 107] }, // #f6b26b
  { position: 0.65, color: [224, 112, 58] }, // #e0703a
  { position: 1, color: [140, 42, 24] }, // #8c2a18
];

// How a region's total sightings become a color. The heatmap adds up a soft blob per region
// (peak HEATMAP_STRENGTH * sqrt(count / max)), divides by that peak, then raises it to
// HEATMAP_GAMMA. So a lone region at `count` sits at (count / max) ^ (GAMMA / 2) along the
// ramp, and the legend's tick labels use the same formula. Neighbors' blobs overlap, so
// the number read off the map is an estimate.
export const HEATMAP_STRENGTH = 0.38;
export const HEATMAP_GAMMA = 0.65;

export function heatmapPosition(count: number, max: number): number {
  return Math.pow(Math.min(Math.max(count / max, 0), 1), HEATMAP_GAMMA / 2);
}

export function heatmapCss(direction = "to right"): string {
  const stops = HEATMAP_RAMP.map(
    ({ position, color }) => `rgb(${color.join(" ")}) ${Math.round(position * 100)}%`
  );
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}
