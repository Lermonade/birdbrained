// Turns /api/grab_data points into the datasets the globe draws.
// Color shows the direction (up or down); pillar height shows the size of the change.

import type { DataSet } from "../../components/globe_visualization/GlobeVisualization";
import type { Direction, GrabPoint } from "../../api/client";

export type Mode = "corrected" | "raw";

// A color-blind-safe pair: blue for up, orange for down.
export const UP_COLOR = "#3b8bd4";
export const DOWN_COLOR = "#ef8a3c";

export function formatPct(value: number | null): string {
  if (value === null) return "no data";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}%`;
}

function view(point: GrabPoint, mode: Mode): { direction: Direction | null; height: number | null } {
  return mode === "corrected"
    ? { direction: point.direction, height: point.height }
    : { direction: point.rawDirection, height: point.rawHeight };
}

function label(point: GrabPoint, start: number, end: number): string {
  return `
    <div style="color: white; padding: 6px 8px; font: 13px/1.4 system-ui, sans-serif;">
      <strong>${point.name}</strong>, ${start} to ${end}<br />
      Share of sightings: ${formatPct(point.changePct)}<br />
      Raw sightings: ${formatPct(point.rawChangePct)}<br />
      <span style="opacity: 0.7">Click for details</span>
    </div>
  `;
}

export function toDatasets(
  speciesName: string,
  points: GrabPoint[],
  mode: Mode,
  start: number,
  end: number
): DataSet[] {
  const usable = points.filter(point => point.status === "ok");

  const toDataPoint = (point: GrabPoint) => ({
    id: point.region,
    lat: point.lat,
    lng: point.lng,
    height: view(point, mode).height ?? 0.05,
    label: label(point, start, end),
  });

  return [
    {
      name: `${speciesName}: up`,
      color: UP_COLOR,
      dataPoints: usable.filter(p => view(p, mode).direction === "up").map(toDataPoint),
    },
    {
      name: `${speciesName}: down`,
      color: DOWN_COLOR,
      dataPoints: usable.filter(p => view(p, mode).direction === "down").map(toDataPoint),
    },
  ];
}
