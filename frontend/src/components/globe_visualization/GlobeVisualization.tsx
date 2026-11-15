import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import Globe from "globe.gl";
import * as THREE from "three";
import { createShadeShell } from "../../looks/shadeShell";
import type { GlobeArt, PaintedEarth } from "../../looks/types";
import { EARTH_HEIGHT, EARTH_WIDTH, loadWorld, type World } from "../../looks/world";
import styles from "./globe_visualization.module.css";
import { HEATMAP_GAMMA, HEATMAP_RAMP, HEATMAP_STRENGTH } from "./scales";
import { StampLayer, type StampInput } from "./stamps";

// --------------------------------------------------
// Types
// --------------------------------------------------

export interface DataPoint {
  lat: number;
  lng: number;
  size?: number; // a stamp's size, 0 to 1 (see scales.ts); 0 if left out
  layer?: number; // stack order among stamps on the same spot, 0 at the bottom
  population?: number; // heatmap weight
  id?: string; // passed back to onPointClick, e.g. a state id
  label?: string; // HTML shown on hover instead of the default label
}

export interface DataSet {
  name: string;
  color: string;
  dataPoints: DataPoint[];
}

export const VisualizationType = {
  STAMPS: "stamps",
  HEATMAP: "heatmap",
} as const;

export type VisualizationType =
  (typeof VisualizationType)[keyof typeof VisualizationType];

export const EarthType = {
  PLAIN: "plain",
  TEXTURED: "textured",
  WIREFRAME: "wireframe",
} as const;

export type EarthType =
  (typeof EarthType)[keyof typeof EarthType];

export interface GlobeView {
  lat: number;
  lng: number;
  altitude?: number;
}

interface GlobeVisualizationProps {
  datasets: DataSet[];
  visualizationType: VisualizationType;
  earthType: EarthType;
  onPointClick?: (point: DataPoint) => void;
  focus?: GlobeView | null; // the camera flies here whenever this changes
  transparentBackground?: boolean; // no space backdrop, so the page shows through
  art?: GlobeArt; // how the Earth is drawn; without it, a photo of the Earth
  heatmapMax?: number; // the most sightings in one spot that the heatmap's darkest color stands for
  ref?: Ref<GlobeHandle>;
}

// Direct controls, for animation that can't wait for a React render
export interface GlobeHandle {
  setView: (view: GlobeView) => void; // move the camera at once, no flight
  screenPoint: (lat: number, lng: number) => { x: number; y: number } | null; // px inside the globe's box
  ripple: (lat: number, lng: number) => void; // rings spreading from a spot
  // Stop drawing while the globe is out of sight. False if the globe isn't ready yet.
  setPaused: (paused: boolean) => boolean;
}

interface Ring {
  lat: number;
  lng: number;
  speed: number;
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const EARTH_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

const NIGHT_SKY =
  "https://unpkg.com/three-globe/example/img/night-sky.png";

// Without a look's art
const DEFAULT_RING_COLOR = "247, 245, 239";
const DEFAULT_WIREFRAME_COLOR = "#b8c7d9";

// Ripple rings: degrees per second for each ring, and how far they spread
const RIPPLE_SPEEDS = [4, 7, 11];
const RIPPLE_RADIUS = 9;

const NO_DATASETS: DataSet[] = [];

// How long a camera flight takes, in ms
const FLY_DURATION = 1000;

const HEATMAP_WIDTH = 4096;
const HEATMAP_HEIGHT = 2048;

const HEATMAP_BANDWIDTH = 4;
const HEATMAP_OPACITY = 0.82;

// A stamp's rim, without a look's art
const DEFAULT_MARK_OUTLINE = "#fbf1dc";

// --------------------------------------------------
// Color utilities
// --------------------------------------------------

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function interpolateColor(
  stops: { position: number; color: number[] }[],
  value: number
) {
  const t = clamp(value);

  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (
      t >= stops[i].position &&
      t <= stops[i + 1].position
    ) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.position - lower.position;

  const localT =
    range === 0 ? 0 : (t - lower.position) / range;

  return lower.color.map((channel, i) =>
    Math.round(
      channel +
        (upper.color[i] - channel) * localT
    )
  );
}

// --------------------------------------------------
// Density generation
// --------------------------------------------------

// One blob per spot, however many species are stacked there: its weight is their total
function totalPerSpot(points: DataPoint[]): DataPoint[] {
  const spots = new Map<string, DataPoint>();

  for (const point of points) {
    const key = `${point.lat},${point.lng}`;
    const spot = spots.get(key);
    const weight = Math.max(0, point.population ?? 1);

    if (spot) spot.population = (spot.population ?? 0) + weight;
    else spots.set(key, { lat: point.lat, lng: point.lng, population: weight });
  }

  return [...spots.values()];
}

// reference: the weight that gets the darkest color (see scales.ts heatmapPosition)
function generateDensityCanvas(
  points: DataPoint[],
  reference?: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = HEATMAP_WIDTH;
  canvas.height = HEATMAP_HEIGHT;

  const ctx = canvas.getContext("2d")!;

  const maxWeight = Math.max(
    1,
    reference ?? 0,
    ...points.map(point =>
      Math.max(0, point.population ?? 1)
    )
  );

  const radiusX =
    (HEATMAP_BANDWIDTH / 360) * HEATMAP_WIDTH;

  const radiusY =
    (HEATMAP_BANDWIDTH / 180) * HEATMAP_HEIGHT;

  ctx.globalCompositeOperation = "lighter";

  for (const point of points) {
    const weight = Math.max(0, point.population ?? 1);

    if (weight === 0) continue;

    const x =
      ((point.lng + 180) / 360) * HEATMAP_WIDTH;

    const y =
      ((90 - point.lat) / 180) * HEATMAP_HEIGHT;

    const latitudeFactor = Math.max(
      0.15,
      Math.cos((point.lat * Math.PI) / 180)
    );

    const rx = Math.min(
      radiusX / latitudeFactor,
      HEATMAP_WIDTH / 2
    );

    const strength =
      HEATMAP_STRENGTH * Math.sqrt(weight / maxWeight);

    const positions = [
      x,
      x - HEATMAP_WIDTH,
      x + HEATMAP_WIDTH,
    ];

    for (const px of positions) {
      if (
        px + rx < 0 ||
        px - rx > HEATMAP_WIDTH
      ) {
        continue;
      }

      const gradient = ctx.createRadialGradient(
        px,
        y,
        0,
        px,
        y,
        Math.max(rx, radiusY)
      );

      gradient.addColorStop(
        0,
        `rgba(255,255,255,${strength})`
      );

      gradient.addColorStop(
        0.4,
        `rgba(255,255,255,${strength * 0.55})`
      );

      gradient.addColorStop(
        1,
        "rgba(255,255,255,0)"
      );

      ctx.fillStyle = gradient;

      ctx.save();

      ctx.translate(px, y);

      ctx.scale(
        rx / Math.max(rx, radiusY),
        radiusY / Math.max(rx, radiusY)
      );

      ctx.translate(-px, -y);

      ctx.fillRect(
        px - Math.max(rx, radiusY),
        y - Math.max(rx, radiusY),
        Math.max(rx, radiusY) * 2,
        Math.max(rx, radiusY) * 2
      );

      ctx.restore();
    }
  }

  ctx.globalCompositeOperation = "source-over";

  return canvas;
}

// --------------------------------------------------
// Density colorization
// --------------------------------------------------

// Density to color: pale and faint where sightings are sparse, dark where they're
// dense (see HEATMAP_RAMP in scales.ts)
function colorizeDensity(densityCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = HEATMAP_WIDTH;
  canvas.height = HEATMAP_HEIGHT;

  const ctx = canvas.getContext("2d")!;

  const densityCtx = densityCanvas.getContext("2d")!;

  const imageData = densityCtx.getImageData(
    0,
    0,
    HEATMAP_WIDTH,
    HEATMAP_HEIGHT
  );

  const pixels = imageData.data;

  // A fixed peak, not the brightest pixel, so a color means the same count in every
  // year and the legend's numbers hold (overlapping blobs just clamp at the darkest)
  const fullDensity = HEATMAP_STRENGTH * 255;

  for (let i = 0; i < pixels.length; i += 4) {
    const density = Math.min(1, pixels[i + 3] / fullDensity);

    if (density < 0.005) {
      pixels[i + 3] = 0;
      continue;
    }

    const intensity = Math.pow(density, HEATMAP_GAMMA);

    const rgb = interpolateColor(HEATMAP_RAMP, intensity);

    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];

    pixels[i + 3] = Math.round(
      255 * HEATMAP_OPACITY * Math.min(1, 0.1 + intensity)
    );
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// --------------------------------------------------
// Heatmap overlay
// --------------------------------------------------

// Every species shown, as one density
function generateHeatmapOverlay(datasets: DataSet[], reference?: number): HTMLCanvasElement {
  const points = totalPerSpot(datasets.flatMap(dataset => dataset.dataPoints));

  return colorizeDensity(generateDensityCanvas(points, reference));
}

// --------------------------------------------------
// Earth texture
// --------------------------------------------------

// Each look's Earth is painted once and kept. Keyed by the painter, so editing
// one in dev repaints it.
const paintedEarths = new WeakMap<PaintedEarth["paint"], HTMLCanvasElement>();

function paintEarth(earth: PaintedEarth, world: World): HTMLCanvasElement {
  let canvas = paintedEarths.get(earth.paint);

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = EARTH_WIDTH;
    canvas.height = EARTH_HEIGHT;
    earth.paint(canvas.getContext("2d")!, world);
    paintedEarths.set(earth.paint, canvas);
  }

  return canvas;
}

function createEarthTexture(
  earthImage: CanvasImageSource | null,
  earthType: EarthType,
  heatmapOverlay: HTMLCanvasElement | null,
  fill = "#ffffff" // shown when there's no image (yet)
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");

  canvas.width = HEATMAP_WIDTH;
  canvas.height = HEATMAP_HEIGHT;

  const ctx = canvas.getContext("2d")!;

  if (earthType === EarthType.PLAIN) {
    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else if (earthImage) {
    ctx.drawImage(
      earthImage,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else {
    ctx.fillStyle = fill;

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  if (heatmapOverlay) {
    ctx.drawImage(heatmapOverlay, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  return texture;
}

// --------------------------------------------------
// Stamps
// --------------------------------------------------

function toStamps(datasets: DataSet[]): StampInput[] {
  return datasets.flatMap(dataset =>
    dataset.dataPoints.map(point => ({
      key: point.id ?? `${dataset.name}|${point.lat},${point.lng}`,
      lat: point.lat,
      lng: point.lng,
      size: point.size ?? 0,
      layer: point.layer ?? 0,
      color: dataset.color,
      label:
        point.label ??
        `<div style="color: white; padding: 5px;"><strong style="color: ${dataset.color}">${dataset.name}</strong></div>`,
      point,
    }))
  );
}

// --------------------------------------------------
// Globe component
// --------------------------------------------------

export default function GlobeVisualization({
  datasets,
  visualizationType,
  earthType,
  onPointClick,
  focus,
  transparentBackground = false,
  art,
  heatmapMax,
  ref,
}: GlobeVisualizationProps) {
  const globeContainer = useRef<HTMLDivElement | null>(null);
  const onPointClickRef = useRef(onPointClick);

  // Keep the latest click handler without re-registering it on the globe
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  const globeRef = useRef<InstanceType<typeof Globe> | null>(
    null
  );

  const stampsRef = useRef<StampLayer | null>(null);

  // ------------------------------------------------
  // Initialize globe once
  // ------------------------------------------------

  useEffect(() => {
    const container = globeContainer.current;

    if (!container) return;

    const globe = new Globe(container)
      .globeImageUrl("")
      .showAtmosphere(false)
      .ringColor(() => (t: number) => `rgba(247, 245, 239, ${1 - t})`)
      .ringMaxRadius(RIPPLE_RADIUS)
      .ringPropagationSpeed((d: object) => (d as Ring).speed)
      .ringRepeatPeriod(0); // one ring each, no repeats

    globe.pointOfView(
      { lat: 20, lng: 0, altitude: 2.3 },
      0
    );

    globe.controls().autoRotate = false;

    globeRef.current = globe;

    const stamps = new StampLayer(globe, DEFAULT_MARK_OUTLINE, point =>
      onPointClickRef.current?.(point)
    );
    stampsRef.current = stamps;

    const resizeObserver = new ResizeObserver(() => {
      globe
        .width(container.clientWidth)
        .height(container.clientHeight);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();

      stamps.dispose();
      stampsRef.current = null;

      globe._destructor();

      globeRef.current = null;
    };
  }, []);

  // Space backdrop, or none so the page behind shows through
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe
      .backgroundColor(transparentBackground ? "rgba(0, 0, 0, 0)" : "#000011")
      .backgroundImageUrl(transparentBackground ? null : NIGHT_SKY);
  }, [transparentBackground]);

  // The look's ripple color, and its drawn shadow and outline over the globe
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const ring = art?.ringColor ?? DEFAULT_RING_COLOR;
    globe.ringColor(() => (t: number) => `rgba(${ring}, ${1 - t})`);

    stampsRef.current?.setOutline(art?.markOutline ?? DEFAULT_MARK_OUTLINE);

    if (!art?.shell || earthType === EarthType.WIREFRAME) return;

    const scene = globe.scene();
    const shell = createShadeShell(art.shell);
    scene.add(shell);

    return () => {
      scene.remove(shell);
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
    };
  }, [art, earthType]);

  useImperativeHandle(
    ref,
    () => {
      let clearRipple: ReturnType<typeof setTimeout> | undefined;

      return {
        setView(view) {
          globeRef.current?.pointOfView(
            { lat: view.lat, lng: view.lng, altitude: view.altitude ?? 1.4 },
            0
          );
        },

        screenPoint(lat, lng) {
          return globeRef.current?.getScreenCoords(lat, lng, 0) ?? null;
        },

        setPaused(paused) {
          const globe = globeRef.current;
          if (!globe) return false;

          if (paused) globe.pauseAnimation();
          else globe.resumeAnimation();
          return true;
        },

        ripple(lat, lng) {
          const globe = globeRef.current;
          if (!globe) return;

          const rings: Ring[] = RIPPLE_SPEEDS.map(speed => ({ lat, lng, speed }));
          globe.ringsData(rings);

          // Take the rings away once the slowest has faded out
          clearTimeout(clearRipple);
          clearRipple = setTimeout(
            () => globeRef.current?.ringsData([]),
            (RIPPLE_RADIUS / Math.min(...RIPPLE_SPEEDS)) * 1000
          );
        },
      };
    },
    []
  );

  // Only a heatmap is painted onto the Earth texture. With stamps the
  // texture doesn't depend on the data, so new data doesn't redraw it.
  const isHeatmap = visualizationType === VisualizationType.HEATMAP;
  const heatmapDatasets = isHeatmap ? datasets : NO_DATASETS;

  // ------------------------------------------------
  // Update Earth and heatmap texture
  // ------------------------------------------------

  useEffect(() => {
    const globe = globeRef.current;

    if (!globe) return;

    const heatmapOverlay =
      heatmapDatasets.length > 0
        ? generateHeatmapOverlay(heatmapDatasets, heatmapMax)
        : null;

    let cancelled = false;

    let earthTexture: THREE.CanvasTexture | null = null;

    let material: THREE.Material | null = null;

    const earth = art?.earth;

    // Can run twice: once with a flat fill, again when the look's Earth is painted
    const applyEarth = (image: CanvasImageSource | null, fill?: string) => {
      if (cancelled) return;

      const previousMaterial = material;
      const previousTexture = earthTexture;

      earthTexture = createEarthTexture(image, earthType, heatmapOverlay, fill);

      if (earthType === EarthType.WIREFRAME) {
        material = new THREE.MeshBasicMaterial({
          color: art?.wireframeColor ?? DEFAULT_WIREFRAME_COLOR,
          wireframe: true,
        });
      } else {
        material = new THREE.MeshBasicMaterial({
          map: earthTexture,
          color: 0xffffff,
        });
      }

      globe.globeMaterial(material);

      previousMaterial?.dispose();
      previousTexture?.dispose();
    };

    if (
      earthType === EarthType.PLAIN ||
      earthType === EarthType.WIREFRAME
    ) {
      applyEarth(null);
    } else if (earth) {
      applyEarth(null, earth.ocean);

      loadWorld()
        .then(world => applyEarth(paintEarth(earth, world)))
        .catch((error: unknown) => console.error("Failed to load the coastlines", error));
    } else {
      const image = new Image();

      image.crossOrigin = "anonymous";

      image.onload = () => applyEarth(image);

      image.onerror = () => {
        console.error("Failed to load Earth texture");

        applyEarth(null);
      };

      image.src = EARTH_TEXTURE;
    }

    return () => {
      cancelled = true;

      material?.dispose();

      earthTexture?.dispose();
    };
  }, [heatmapDatasets, heatmapMax, earthType, art]);

  // ------------------------------------------------
  // Update data visualization
  // ------------------------------------------------

  useEffect(() => {
    const stamps = stampsRef.current;

    if (!stamps) return;

    if (visualizationType === VisualizationType.STAMPS) {
      stamps.update(toStamps(datasets));
    } else {
      stamps.clear();
    }
  }, [datasets, visualizationType]);

  // Fly the camera to a new view
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !focus) return;

    globe.pointOfView(
      { lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.4 },
      FLY_DURATION
    );
  }, [focus]);


  return (
    <div
      ref={globeContainer}
      className={styles.globe}
    />
  );
}