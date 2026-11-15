import type { ComponentType, RefObject } from "react";

import type { Scene } from "../components/landing/timeline";
import type { World } from "./world";

/** The flat shadow and inked outline drawn over the globe, fixed to the screen. */
export interface ShellOptions {
  shadow: string; // hex
  shadowAlpha: number;
  outline: string; // hex
  outlineAlpha: number; // 0 for no outline
}

/** An Earth we paint ourselves from coastlines. `ocean` shows until they've loaded. */
export interface PaintedEarth {
  ocean: string;
  paint: (ctx: CanvasRenderingContext2D, world: World) => void;
}

/** How the globe itself is drawn. */
export interface GlobeArt {
  earth: PaintedEarth;
  shell?: ShellOptions;
  ringColor: string; // "r, g, b" of the landing's ripple
  wireframeColor: string;
}

export interface BackdropProps {
  scene: RefObject<Scene>; // the landing's scroll progress, for parallax
}

export interface Look {
  id: string;
  name: string;
  swatch: [string, string]; // sky and land, for the dev bar
  /** CSS variables set on <html>: --sky, --landing-ink, --landing-ink-dim, --landing-bird-eye, --landing-logo-filter */
  vars: Record<string, string>;
  art: GlobeArt;
  Backdrop: ComponentType<BackdropProps>;
}
