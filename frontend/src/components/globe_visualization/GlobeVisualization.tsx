
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import Globe from "globe.gl";
import * as THREE from "three";
import styles from "./globe_visualization.module.css";

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
  WHITE: "white",
  TEXTURED: "textured",
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

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const EARTH_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

const NIGHT_SKY =
  "https://unpkg.com/three-globe/example/img/night-sky.png";

// Pillars grow out of the surface over this long, in ms
const PILLAR_GROW_DURATION = 900;

// Ripple rings: degrees per second for each ring, and how far they spread
const RIPPLE_SPEEDS = [4, 7, 11];
const RIPPLE_RADIUS = 9;

const NO_DATASETS: DataSet[] = [];

// How long a camera flight takes, in ms
const FLY_DURATION = 1000;

// Equirectangular texture resolution
const HEATMAP_WIDTH = 4096;
const HEATMAP_HEIGHT = 2048;

// Higher = smoother, broader hotspots
const HEATMAP_BANDWIDTH = 4;

// Maximum heatmap opacity
const HEATMAP_OPACITY = 0.72;

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

// Red -> orange -> yellow -> cyan -> blue
const POPULATION_GRADIENT = [
  { position: 0, color: [220, 35, 35] },
  { position: 0.25, color: [245, 125, 65] },
  { position: 0.5, color: [250, 220, 100] },
  { position: 0.75, color: [90, 190, 220] },
  { position: 1, color: [30, 85, 220] },
];

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
    ...points.map(point => Math.max(0, point.population ?? 1))
  );

  const radiusX =
    (HEATMAP_BANDWIDTH / 360) * HEATMAP_WIDTH;

  const radiusY =
    (HEATMAP_BANDWIDTH / 180) * HEATMAP_HEIGHT;

  // Add densities together instead of overwriting them
  ctx.globalCompositeOperation = "lighter";

  for (const point of points) {
    const weight = Math.max(0, point.population ?? 1);

    if (weight === 0) continue;

    // Equirectangular geographic projection
    const x = ((point.lng + 180) / 360) * HEATMAP_WIDTH;
    const y = ((90 - point.lat) / 180) * HEATMAP_HEIGHT;

    // Compensate for longitude compression near the poles
    const latitudeFactor = Math.max(
      0.15,
      Math.cos((point.lat * Math.PI) / 180)
    );

    const rx = Math.min(
      radiusX / latitudeFactor,
      HEATMAP_WIDTH / 2
    );

    const strength = 0.38 * Math.sqrt(weight / maxWeight);

    // Draw across the longitude seam when necessary
    const positions = [
      x,
      x - HEATMAP_WIDTH,
      x + HEATMAP_WIDTH,
    ];

    for (const px of positions) {
      if (px + rx < 0 || px - rx > HEATMAP_WIDTH) {
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
// Convert density into a colored transparent overlay
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

  // Find maximum density for normalization
  let maxDensity = 0;

  for (let i = 3; i < pixels.length; i += 4) {
    maxDensity = Math.max(maxDensity, pixels[i]);
  }

  if (maxDensity === 0) return canvas;

  const datasetColor = color
    ? hexToRgb(color)
    : null;

  // Convert density into smooth color + alpha
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
// Generate complete heatmap overlay
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
    // Combine all datasets into one density calculation
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
    // Keep every dataset's density independent
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
// Earth texture generation
// --------------------------------------------------

function createEarthTexture(
  earthImage: HTMLImageElement | null,
  earthType: EarthType,
  visualizationType: VisualizationType,
  heatmapOverlay: HTMLCanvasElement | null
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");

  canvas.width = HEATMAP_WIDTH;
  canvas.height = HEATMAP_HEIGHT;

  const ctx = canvas.getContext("2d")!;

  // Base Earth
  if (earthType === EarthType.WHITE) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (earthImage) {
    ctx.drawImage(
      earthImage,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Blue tint for standard population heatmap
    if (
      visualizationType === VisualizationType.HEATMAP
    ) {
      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const pixels = imageData.data;

      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] *= 0.75;
        pixels[i + 1] *= 0.85;
        pixels[i + 2] = Math.min(
          255,
          pixels[i + 2] * 1.15
        );
      }

      ctx.putImageData(imageData, 0, 0);
    }
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Overlay heatmap without replacing the Earth
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
  ref,
}: GlobeVisualizationProps) {
  const globeContainer = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<InstanceType<typeof Globe> | null>(null);
  const onPointClickRef = useRef(onPointClick);

  // Keep the latest click handler without re-registering it on the globe
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  // Initialize globe once
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

  // Update Earth and heatmap texture
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

    const applyEarth = (image: HTMLImageElement | null) => {
      if (cancelled) return;

      earthTexture = createEarthTexture(
        image,
        earthType,
        visualizationType,
        heatmapOverlay
      );

      if (earthType === EarthType.WHITE) {
        material = new THREE.MeshBasicMaterial({
          map: earthTexture,
          color: 0xffffff,
        });
      } else {
        material = new THREE.MeshPhongMaterial({
          map: earthTexture,
          color: 0xffffff,
          shininess: 5,
        });
      }

      globe.globeMaterial(material);
    };

    if (earthType === EarthType.WHITE) {
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
  }, [heatmapDatasets, visualizationType, earthType]);

  // Update data visualization
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Clear previous point and built-in heatmap layers
    globe.pointsData([]);
    globe.heatmapsData([]);

    const points: GlobePoint[] = datasets.flatMap(dataset =>
      dataset.dataPoints.map(point => ({
        ...point,
        name: dataset.name,
        color: dataset.color,
      }))
    );

    // POINTS
    if (visualizationType === VisualizationType.POINTS) {
      globe
        .pointRadius(0.12)
        .pointAltitude(0.005)
        .pointResolution(8)
        .pointColor((d: object) => (d as GlobePoint).color)
        .pointLabel((d: object) => {
          const point = d as GlobePoint;

          return point.label ?? `${point.name}: ${point.lat}, ${point.lng}`;
        })
        .pointsData(points);
    }

    // PILLARS
    if (visualizationType === VisualizationType.PILLARS) {
      globe
        .pointRadius(0.35)
        .pointAltitude((d: object) => (d as GlobePoint).height)
        .pointResolution(8)
        .pointColor((d: object) => (d as GlobePoint).color)
        .pointLabel((d: object) => {
          const point = d as GlobePoint;

          if (point.label) return point.label;

          return `
            <div style="color: white; padding: 5px;">
              <strong style="color: ${point.color}">
                ${point.name}
              </strong>
              <br />
              ${point.lat}, ${point.lng}
              <br />
              Height: ${point.height}
            </div>
          `;
        })
        .pointsData(points);
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
