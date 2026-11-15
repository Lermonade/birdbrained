import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import Globe from "globe.gl";
import * as THREE from "three";
import { createShadeShell } from "../../looks/shadeShell";
import type { GlobeArt, PaintedEarth } from "../../looks/types";
import { EARTH_HEIGHT, EARTH_WIDTH, loadWorld, type World } from "../../looks/world";
import styles from "./globe_visualization.module.css";

// --------------------------------------------------
// Types
// --------------------------------------------------

export interface DataPoint {
  lat: number;
  lng: number;
  height: number;
  population?: number;
  id?: string; // passed back to onPointClick, e.g. a state id
  label?: string; // HTML shown on hover instead of the default label
}

export interface DataSet {
  name: string;
  color: string;
  dataPoints: DataPoint[];
}

export const VisualizationType = {
  POINTS: "points",
  PILLARS: "pillars",
  HEATMAP: "heatmap",
  MULTICOLOR_HEATMAP: "multicolor-heatmap",
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

interface GlobePoint extends DataPoint {
  name: string;
  color: string;
}

interface PillarPoint {
  lat: number;
  lng: number;
  height: number;
  population: number;
  name: string;
  color: string;
  id?: string;
  label?: string;
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

// Pillars grow out of the surface over this long, in ms
const PILLAR_GROW_DURATION = 900;

// Ripple rings: degrees per second for each ring, and how far they spread
const RIPPLE_SPEEDS = [4, 7, 11];
const RIPPLE_RADIUS = 9;

const NO_DATASETS: DataSet[] = [];

// How long a camera flight takes, in ms
const FLY_DURATION = 1000;

const HEATMAP_WIDTH = 4096;
const HEATMAP_HEIGHT = 2048;

const HEATMAP_BANDWIDTH = 4;
const HEATMAP_OPACITY = 0.72;

// Pillar dimensions (globe world units)
const PILLAR_RADIUS = 0.15;

// A pillar that stands for a whole region (a point with an id) is wider
const REGION_PILLAR_RADIUS = 0.35;

// Maximum pillar height
const MAX_PILLAR_HEIGHT = 8;

// Height scaling
const PILLAR_HEIGHT_SCALE = 0.08;

// --------------------------------------------------
// Color utilities
// --------------------------------------------------

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function hexToRgb(hex: string) {
  const color = hex.replace("#", "");

  return [
    parseInt(color.slice(0, 2), 16),
    parseInt(color.slice(2, 4), 16),
    parseInt(color.slice(4, 6), 16),
  ];
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

const POPULATION_GRADIENT = [
  { position: 0, color: [220, 35, 35] },
  { position: 0.25, color: [245, 125, 65] },
  { position: 0.5, color: [250, 220, 100] },
  { position: 0.75, color: [90, 190, 220] },
  { position: 1, color: [30, 85, 220] },
];

// --------------------------------------------------
// Pillar aggregation
// --------------------------------------------------

/**
 * Converts latitude/longitude into 3D Cartesian coordinates.
 *
 * This lets us measure actual distances across the globe's
 * curved surface instead of using arbitrary degree ranges.
 */

function latLngToVector(
  lat: number,
  lng: number,
  globeRadius: number
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -globeRadius * Math.sin(phi) * Math.cos(theta),
    globeRadius * Math.cos(phi),
    globeRadius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Groups sightings according to the actual physical footprint
 * of a pillar.
 *
 * Sightings are grouped when their surface positions are close
 * enough to occupy the same pillar footprint.
 *
 * Each resulting pillar represents the number of sightings
 * assigned to it.
 */

function aggregatePillars(
  datasets: DataSet[],
  globeRadius: number
): PillarPoint[] {
  const pillars: PillarPoint[] = [];

  // Actual diameter of a pillar.
  const aggregationDistance = PILLAR_RADIUS * 2;

  for (const dataset of datasets) {
    // A point with an id is already one whole region with its own
    // height (e.g. a state's change), so it becomes a pillar as it is.
    for (const point of dataset.dataPoints) {
      if (point.id === undefined) continue;

      pillars.push({
        ...point,
        population: point.population ?? 1,
        name: dataset.name,
        color: dataset.color,
      });
    }

    const points = dataset.dataPoints.filter(
      point => point.id === undefined
    );

    // Store each sighting's 3D surface position.
    const positionedPoints = points.map(point => ({
      ...point,
      position: latLngToVector(
        point.lat,
        point.lng,
        globeRadius
      ),
    }));

    // Spatial buckets accelerate proximity searches.
    const cellSize = aggregationDistance;

    const buckets = new Map<string, number[]>();

    function getCellKey(
      x: number,
      y: number,
      z: number
    ) {
      return `${x},${y},${z}`;
    }

    function getCell(position: THREE.Vector3) {
      return {
        x: Math.floor(position.x / cellSize),
        y: Math.floor(position.y / cellSize),
        z: Math.floor(position.z / cellSize),
      };
    }

    // Each point can only belong to one pillar.
    const assigned = new Set<number>();

    for (let i = 0; i < positionedPoints.length; i++) {
      if (assigned.has(i)) continue;

      const current = positionedPoints[i];

      const cell = getCell(current.position);

      const members: number[] = [i];

      assigned.add(i);

      // Search neighboring spatial cells.
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            const key = getCellKey(
              cell.x + x,
              cell.y + y,
              cell.z + z
            );

            const candidates = buckets.get(key) ?? [];

            for (const candidateIndex of candidates) {
              if (assigned.has(candidateIndex)) continue;

              const candidate =
                positionedPoints[candidateIndex];

              const distance = current.position.distanceTo(
                candidate.position
              );

              if (distance <= aggregationDistance) {
                members.push(candidateIndex);
                assigned.add(candidateIndex);
              }
            }
          }
        }
      }

      // Register the current point in its spatial bucket.
      const currentKey = getCellKey(
        cell.x,
        cell.y,
        cell.z
      );

      if (!buckets.has(currentKey)) {
        buckets.set(currentKey, []);
      }

      buckets.get(currentKey)!.push(i);

      // Calculate the pillar's representative position.
      const center = new THREE.Vector3();

      let population = 0;

      for (const memberIndex of members) {
        const member = positionedPoints[memberIndex];

        center.add(member.position);

        population += member.population ?? 1;
      }

      center.divideScalar(members.length);

      center.normalize().multiplyScalar(globeRadius);

      // Convert representative position back to lat/lng.
      const lat = THREE.MathUtils.radToDeg(
        Math.asin(center.y / globeRadius)
      );

      const lng = THREE.MathUtils.radToDeg(
        Math.atan2(center.z, -center.x)
      ) - 180;

      // Height represents the number of sightings.
      const height = Math.min(
        MAX_PILLAR_HEIGHT,
        Math.max(
          0.05,
          population * PILLAR_HEIGHT_SCALE
        )
      );

      pillars.push({
        lat,
        lng,
        height,
        population,
        name: dataset.name,
        color: dataset.color,
      });
    }
  }

  return pillars;
}

// --------------------------------------------------
// Density generation
// --------------------------------------------------

function generateDensityCanvas(
  points: DataPoint[]
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = HEATMAP_WIDTH;
  canvas.height = HEATMAP_HEIGHT;

  const ctx = canvas.getContext("2d")!;

  const maxWeight = Math.max(
    1,
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
      0.38 * Math.sqrt(weight / maxWeight);

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

function colorizeDensity(
  densityCanvas: HTMLCanvasElement,
  color?: string
): HTMLCanvasElement {
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

  let maxDensity = 0;

  for (let i = 3; i < pixels.length; i += 4) {
    maxDensity = Math.max(maxDensity, pixels[i]);
  }

  if (maxDensity === 0) return canvas;

  const datasetColor = color
    ? hexToRgb(color)
    : null;

  for (let i = 0; i < pixels.length; i += 4) {
    const density = pixels[i + 3] / maxDensity;

    if (density < 0.005) {
      pixels[i + 3] = 0;
      continue;
    }

    const intensity = Math.pow(density, 0.65);

    const rgb = datasetColor
      ? datasetColor
      : interpolateColor(
          POPULATION_GRADIENT,
          intensity
        );

    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];

    pixels[i + 3] = Math.round(
      255 * HEATMAP_OPACITY * intensity
    );
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// --------------------------------------------------
// Heatmap overlay
// --------------------------------------------------

function generateHeatmapOverlay(
  datasets: DataSet[],
  visualizationType: VisualizationType
): HTMLCanvasElement {
  const overlay = document.createElement("canvas");

  overlay.width = HEATMAP_WIDTH;
  overlay.height = HEATMAP_HEIGHT;

  const ctx = overlay.getContext("2d")!;

  if (visualizationType === VisualizationType.HEATMAP) {
    const points = datasets.flatMap(
      dataset => dataset.dataPoints
    );

    const density = generateDensityCanvas(points);

    const colored = colorizeDensity(density);

    ctx.drawImage(colored, 0, 0);
  }

  if (
    visualizationType ===
    VisualizationType.MULTICOLOR_HEATMAP
  ) {
    ctx.globalCompositeOperation = "screen";

    for (const dataset of datasets) {
      const density = generateDensityCanvas(
        dataset.dataPoints
      );

      const colored = colorizeDensity(
        density,
        dataset.color
      );

      ctx.drawImage(colored, 0, 0);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  return overlay;
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

  // ------------------------------------------------
  // Initialize globe once
  // ------------------------------------------------

  useEffect(() => {
    const container = globeContainer.current;

    if (!container) return;

    const globe = new Globe(container)
      .globeImageUrl("")
      .showAtmosphere(false)
      .pointsTransitionDuration(PILLAR_GROW_DURATION)
      .ringColor(() => (t: number) => `rgba(247, 245, 239, ${1 - t})`)
      .ringMaxRadius(RIPPLE_RADIUS)
      .ringPropagationSpeed((d: object) => (d as Ring).speed)
      .ringRepeatPeriod(0); // one ring each, no repeats

    globe.pointOfView(
      { lat: 20, lng: 0, altitude: 2.3 },
      0
    );

    globe.controls().autoRotate = false;

    globe.onPointClick((d: object) => onPointClickRef.current?.(d as GlobePoint));

    globeRef.current = globe;

    const resizeObserver = new ResizeObserver(() => {
      globe
        .width(container.clientWidth)
        .height(container.clientHeight);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();

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

  // Only a heatmap is painted onto the Earth texture. For anything else the
  // texture doesn't depend on the data, so new data doesn't redraw it.
  const isHeatmap =
    visualizationType === VisualizationType.HEATMAP ||
    visualizationType === VisualizationType.MULTICOLOR_HEATMAP;
  const heatmapDatasets = isHeatmap ? datasets : NO_DATASETS;

  // ------------------------------------------------
  // Update Earth and heatmap texture
  // ------------------------------------------------

  useEffect(() => {
    const globe = globeRef.current;

    if (!globe) return;

    const heatmapOverlay =
      heatmapDatasets.length > 0
        ? generateHeatmapOverlay(heatmapDatasets, visualizationType)
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
  }, [heatmapDatasets, visualizationType, earthType, art]);

  // ------------------------------------------------
  // Update data visualization
  // ------------------------------------------------

  useEffect(() => {
    const globe = globeRef.current;

    if (!globe) return;

    globe.pointsData([]);

    const points: GlobePoint[] = datasets.flatMap(
      dataset =>
        dataset.dataPoints.map(point => ({
          ...point,
          name: dataset.name,
          color: dataset.color,
        }))
    );

    // POINTS
    if (
      visualizationType === VisualizationType.POINTS
    ) {
      globe
        .pointRadius(0.12)
        .pointAltitude(0.005)
        .pointResolution(8)
        .pointColor((d: object) =>
          (d as GlobePoint).color
        )
        .pointLabel((d: object) => {
          const point = d as GlobePoint;

          return point.label ?? `${point.name}: ${point.lat}, ${point.lng}`;
        })
        .pointsData(points);
    }

    // PILLARS
    if (
      visualizationType === VisualizationType.PILLARS
    ) {
      const globeRadius = 100;

      const pillars = aggregatePillars(
        datasets,
        globeRadius
      );

      globe
        .pointRadius((d: object) =>
          (d as PillarPoint).id === undefined
            ? PILLAR_RADIUS
            : REGION_PILLAR_RADIUS
        )
        .pointAltitude((d: object) =>
          (d as PillarPoint).height
        )
        .pointResolution(8)
        .pointColor((d: object) =>
          (d as PillarPoint).color
        )
        .pointLabel((d: object) => {
          const pillar = d as PillarPoint;

          if (pillar.label) return pillar.label;

          return `
            <div style="color: white; padding: 5px;">
              <strong style="color: ${pillar.color}">
                ${pillar.name}
              </strong>
              <br />
              Sightings: ${pillar.population}
              <br />
              Height: ${pillar.height.toFixed(2)}
            </div>
          `;
        })
        .pointsData(pillars);
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