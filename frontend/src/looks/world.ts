// Coastlines and borders, and the brushes the looks paint their Earth with.
// Everything is in the pixels of the globe's texture (equirectangular).

import { geoEquirectangular, geoPath, type GeoContext, type GeoPermissibleObjects } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldUrl from "world-atlas/countries-50m.json?url";

export const EARTH_WIDTH = 4096;
export const EARTH_HEIGHT = 2048;

const W = EARTH_WIDTH;
const H = EARTH_HEIGHT;

export interface World {
  land: Path2D; // closed shapes: fill or clip with "evenodd"
  coast: Path2D; // open lines: stroke this, not `land`, which has seams at the date line
  borders: Path2D; // borders between countries, without the coasts
}

type Atlas = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

let world: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  world ??= fetch(worldUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Coastlines: HTTP ${response.status}`);
      return response.json() as Promise<Atlas>;
    })
    .then(build)
    .catch((error: unknown) => {
      world = null; // try again next time
      throw error;
    });

  return world;
}

function build(atlas: Atlas): World {
  const projection = geoEquirectangular()
    .scale(W / (2 * Math.PI))
    .translate([W / 2, H / 2]);

  // d3 cuts shapes at the date line and closes the one around the south pole
  const trace = (object: GeoPermissibleObjects) => {
    const path = new Path2D();
    geoPath(projection, path as unknown as GeoContext)(object);
    return path;
  };

  return {
    land: trace(feature(atlas, atlas.objects.land)),
    coast: trace(mesh(atlas, atlas.objects.land)),
    borders: trace(mesh(atlas, atlas.objects.countries, (a, b) => a !== b)),
  };
}

// --------------------------------------------------
// Brushes
// --------------------------------------------------

/** The same numbers every time, so a look paints the same Earth on every visit. */
export function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function latY(lat: number): number {
  return ((90 - lat) / 180) * H;
}

export function fillAll(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
}

export function clipLand(ctx: CanvasRenderingContext2D, world: World) {
  ctx.clip(world.land, "evenodd");
}

export function clipOcean(ctx: CanvasRenderingContext2D, world: World) {
  const sea = new Path2D();
  sea.rect(0, 0, W, H);
  sea.addPath(world.land);
  ctx.clip(sea, "evenodd");
}

export function strokeCoast(ctx: CanvasRenderingContext2D, world: World, color: string, width: number) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(world.coast);
}

/** Paper or ink grain: light and dark flecks over everything. */
export function grain(ctx: CanvasRenderingContext2D, seed: number, amount: number) {
  const size = 256;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;

  const tileCtx = tile.getContext("2d")!;
  const image = tileCtx.createImageData(size, size);
  const random = rng(seed);

  for (let i = 0; i < image.data.length; i += 4) {
    const value = random() * 2 - 1;
    const shade = value < 0 ? 0 : 255;
    image.data[i] = shade;
    image.data[i + 1] = shade;
    image.data[i + 2] = shade;
    image.data[i + 3] = Math.abs(value) * amount * 255;
  }
  tileCtx.putImageData(image, 0, 0);

  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, W, H);
}
