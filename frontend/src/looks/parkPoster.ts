// Park poster: a vintage national-park screenprint. Flat color, hard edges, no outlines.

import ParkPosterBackdrop from "./ParkPosterBackdrop";
import type { Look } from "./types";
import { clipLand, EARTH_WIDTH, fillAll, grain, latY, strokeCoast, type World } from "./world";

const OCEAN = "#1d4f5c";

// Land color by latitude, north to south: [southern edge, color]. Close enough to the
// real thing: tundra, conifers, meadow, desert, jungle, and back again.
const BANDS: [number, string][] = [
  [66, "#f1e9d8"],
  [52, "#5e9070"],
  [36, "#9fb372"],
  [13, "#e2b565"],
  [-13, "#3f8460"],
  [-34, "#e2b565"],
  [-56, "#9fb372"],
  [-90, "#f1e9d8"],
];

function paint(ctx: CanvasRenderingContext2D, world: World) {
  fillAll(ctx, OCEAN);

  // Two flat bands of shallower water around the coasts
  strokeCoast(ctx, world, "#235c69", 46);
  strokeCoast(ctx, world, "#2c7180", 20);

  ctx.save();
  clipLand(ctx, world);
  fillAll(ctx, BANDS[0][1]);

  // Each band runs from a wavy edge down; the next one paints over its lower part.
  // The waves fit the width a whole number of times, so they meet at the date line.
  for (let i = 1; i < BANDS.length; i++) {
    const top = latY(BANDS[i - 1][0]);
    const phase = i * 1.7;

    ctx.fillStyle = BANDS[i][1];
    ctx.beginPath();
    ctx.moveTo(0, ctx.canvas.height);
    for (let x = 0; x <= EARTH_WIDTH; x += 8) {
      const turn = (x / EARTH_WIDTH) * Math.PI * 2;
      ctx.lineTo(x, top + 16 * Math.sin(turn * 13 + phase) + 9 * Math.sin(turn * 37 + phase * 2));
    }
    ctx.lineTo(EARTH_WIDTH, ctx.canvas.height);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(251, 241, 220, 0.6)";
  ctx.lineWidth = 1.6;
  ctx.stroke(world.borders);

  grain(ctx, 3, 0.05);
}

export const parkPoster: Look = {
  id: "park-poster",
  name: "Park poster",
  swatch: ["#cf6a5c", "#e2b565"],
  vars: {
    "--sky": "#0b1d2c",
    "--landing-ink": "#fbf1dc",
    "--landing-ink-dim": "rgba(251, 241, 220, 0.84)",
    "--landing-bird-eye": "#14263a",
    "--landing-logo-filter": "invert(1)",
  },
  art: {
    earth: { ocean: OCEAN, paint },
    shell: { shadow: "#1a1433", shadowAlpha: 0.3, outline: "#fbf1dc", outlineAlpha: 0 },
    ringColor: "251, 241, 220",
    markOutline: "#fbf1dc",
    wireframeColor: "#f1e3c0",
  },
  Backdrop: ParkPosterBackdrop,
};
