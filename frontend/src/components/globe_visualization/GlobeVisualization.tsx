import { useEffect, useRef } from "react";
import Globe from "globe.gl";
import * as THREE from "three";
import styles from "./globe_visualization.module.css";

// --------------------------------------------------
// Types
// --------------------------------------------------

export interface DataPoint {
  lat: number;
  lng: number;
  height: number;
  population?: number;
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

interface GlobeVisualizationProps {
  datasets: DataSet[];
  visualizationType: VisualizationType;
  earthType: EarthType;
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
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const EARTH_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

const HEATMAP_WIDTH = 4096;
const HEATMAP_HEIGHT = 2048;

const HEATMAP_BANDWIDTH = 4;
const HEATMAP_OPACITY = 0.72;

// Pillar dimensions (globe world units)
const PILLAR_RADIUS = 0.15;

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
    const points = dataset.dataPoints;

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

function createEarthTexture(
  earthImage: HTMLImageElement | null,
  earthType: EarthType,
  heatmapOverlay: HTMLCanvasElement | null
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
    ctx.fillStyle = "#ffffff";

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
}: GlobeVisualizationProps) {
  const globeContainer = useRef<HTMLDivElement | null>(null);

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
      .backgroundColor("#000011")
      .backgroundImageUrl(
        "https://unpkg.com/three-globe/example/img/night-sky.png"
      )
      .showAtmosphere(false);

    globe.pointOfView(
      { lat: 20, lng: 0, altitude: 2.3 },
      0
    );

    globe.controls().autoRotate = false;

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

  // ------------------------------------------------
  // Update Earth and heatmap texture
  // ------------------------------------------------

  useEffect(() => {
    const globe = globeRef.current;

    if (!globe) return;

    const isHeatmap =
      visualizationType === VisualizationType.HEATMAP ||
      visualizationType ===
        VisualizationType.MULTICOLOR_HEATMAP;

    const heatmapOverlay = isHeatmap
      ? generateHeatmapOverlay(
          datasets,
          visualizationType
        )
      : null;

    let cancelled = false;

    let earthTexture: THREE.CanvasTexture | null = null;

    let material: THREE.Material | null = null;

    const applyEarth = (
      image: HTMLImageElement | null
    ) => {
      if (cancelled) return;

      earthTexture = createEarthTexture(
        image,
        earthType,
        heatmapOverlay
      );

      if (earthType === EarthType.WIREFRAME) {
        material = new THREE.MeshBasicMaterial({
          color: 0xb8c7d9,
          wireframe: true,
        });
      } else {
        material = new THREE.MeshBasicMaterial({
          map: earthTexture,
          color: 0xffffff,
        });
      }

      globe.globeMaterial(material);
    };

    if (
      earthType === EarthType.PLAIN ||
      earthType === EarthType.WIREFRAME
    ) {
      applyEarth(null);
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
  }, [datasets, visualizationType, earthType]);

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

          return `${point.name}: ${point.lat}, ${point.lng}`;
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
        .pointRadius(PILLAR_RADIUS)
        .pointAltitude((d: object) =>
          (d as PillarPoint).height
        )
        .pointResolution(8)
        .pointColor((d: object) =>
          (d as PillarPoint).color
        )
        .pointLabel((d: object) => {
          const pillar = d as PillarPoint;

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

  return (
    <div
      ref={globeContainer}
      className={styles.globe}
    />
  );
}