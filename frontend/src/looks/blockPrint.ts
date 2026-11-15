// Block print: a linocut in two inks and one accent. Everything is a cut mark.

import BlockPrintBackdrop from "./BlockPrintBackdrop";
import type { Look } from "./types";
import {
  clipLand,
  clipOcean,
  EARTH_HEIGHT,
  EARTH_WIDTH,
  fillAll,
  rng,
  strokeCoast,
  type World,
} from "./world";

const INK = "#143a32";
const CUT = "#2d6152"; // where the block was carved away in the sea
const PAPER = "#eee3c6";

function paint(ctx: CanvasRenderingContext2D, world: World) {
  const random = rng(5);

  fillAll(ctx, INK);

  ctx.save();
  clipOcean(ctx, world);

  // Rows of gouges for waves: each one a sliver, fat in the middle
  ctx.fillStyle = CUT;
  for (let y = 12; y < EARTH_HEIGHT; y += 26) {
    for (let x = random() * 60; x < EARTH_WIDTH; x += 30 + random() * 70) {
      const length = 18 + random() * 46;
      const fat = 1.5 + random() * 2.5;
      const drift = (random() - 0.5) * 10;

      ctx.beginPath();
      ctx.moveTo(x, y + drift);
      ctx.quadraticCurveTo(x + length / 2, y + drift - fat * 2, x + length, y + drift);
      ctx.quadraticCurveTo(x + length / 2, y + drift + fat, x, y + drift);
      ctx.fill();
    }
  }

  // One line cut clean around every coast
  strokeCoast(ctx, world, INK, 30);
  strokeCoast(ctx, world, CUT, 14);
  ctx.restore();

  ctx.save();
  clipLand(ctx, world);
  fillAll(ctx, PAPER);

  // Ridges of ink the knife left behind
  ctx.strokeStyle = "rgba(20, 58, 50, 0.5)";
  ctx.lineCap = "round";
  for (let y = 0; y < EARTH_HEIGHT; y += 30) {
    for (let x = 0; x < EARTH_WIDTH; x += 30) {
      if (random() > 0.5) continue;

      const length = 7 + random() * 16;
      const angle = -0.6 + (random() - 0.5) * 0.5;
      const startX = x + random() * 30;
      const startY = y + random() * 30;

      ctx.lineWidth = 1.4 + random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(20, 58, 50, 0.75)";
  ctx.lineWidth = 2.4;
  ctx.stroke(world.borders);

  // Flecks where the ink didn't take, and where it strayed
  for (let i = 0; i < 16000; i++) {
    ctx.fillStyle = i % 2 ? "rgba(238, 227, 198, 0.16)" : "rgba(15, 36, 31, 0.3)";
    ctx.fillRect(random() * EARTH_WIDTH, random() * EARTH_HEIGHT, 1 + random() * 2.5, 1 + random() * 2.5);
  }
}

export const blockPrint: Look = {
  id: "block-print",
  name: "Block print",
  swatch: ["#0f241f", "#c9583b"],
  vars: {
    "--sky": "#0f241f",
    "--landing-ink": PAPER,
    "--landing-ink-dim": "rgba(238, 227, 198, 0.82)",
    "--landing-bird-eye": "#0f241f",
    "--landing-logo-filter": "invert(1)",
  },
  art: {
    earth: { ocean: INK, paint },
    shell: { shadow: "#081511", shadowAlpha: 0.36, outline: PAPER, outlineAlpha: 0.95 },
    ringColor: "201, 88, 59",
    markOutline: INK, // the land is paper, so the rim is cut in ink
    wireframeColor: PAPER,
  },
  Backdrop: BlockPrintBackdrop,
};
