// Turns /api/grab_data points into the datasets the globe draws: each state's raw sightings,
// in the species' sidebar color. Pillar height and heatmap weight both come from the count.

import type { DataSet } from "../../components/globe_visualization/GlobeVisualization";
import type { GrabPoint } from "../../api/client";

// Change colors, still used by the detail panel. A color-blind-safe pair: blue up, orange down.
export const UP_COLOR = "#3b8bd4";
export const DOWN_COLOR = "#ef8a3c";

// Pillar heights, as a fraction of the globe's radius
const MIN_HEIGHT = 0.02;
const MAX_HEIGHT = 0.5;

// With more than one species, each one's pillar sits this far (degrees) from the state's
// center, around a circle, so pillars in the same state don't hide each other
const SPREAD = 0.8;

export function formatPct(value: number | null): string {
  if (value === null) return "no data";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}%`;
}

export interface SpeciesSightings {
  key: string;
  name: string;
  color: string;
  points: GrabPoint[];
}

// The id on each globe point: which species and which state, so a click knows both
export function pointId(speciesKey: string, region: string): string {
  return `${speciesKey}|${region}`;
}

export function parsePointId(id: string): { speciesKey: string; region: string } {
  const split = id.indexOf("|");
  return { speciesKey: id.slice(0, split), region: id.slice(split + 1) };
}

function label(name: string, color: string, point: GrabPoint, year: number): string {
  return `
    <div style="color: white; padding: 6px 8px; font: 13px/1.4 system-ui, sans-serif;">
      <strong style="color: ${color}">${name}</strong><br />
      ${point.name}: ${point.endCount.toLocaleString()} sightings in ${year}<br />
      <span style="opacity: 0.7">Click for details</span>
    </div>
  `;
}

// One dataset per species. Heights share one scale (square root of the count, so small
// states still show), so species can be compared with each other.
export function toDatasets(species: SpeciesSightings[], year: number): DataSet[] {
  const maxCount = Math.max(1, ...species.flatMap(s => s.points.map(p => p.endCount)));

  return species.map((s, i) => {
    const angle = (2 * Math.PI * i) / species.length;
    const dLat = species.length > 1 ? SPREAD * Math.sin(angle) : 0;
    const dLng = species.length > 1 ? SPREAD * Math.cos(angle) : 0;

    return {
      name: s.name,
      color: s.color,
      dataPoints: s.points
        .filter(point => point.endCount > 0)
        .map(point => ({
          id: pointId(s.key, point.region),
          lat: point.lat + dLat,
          lng: point.lng + dLng / Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)),
          population: point.endCount,
          height: MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.sqrt(point.endCount / maxCount),
          label: label(s.name, s.color, point, year),
        })),
    };
  });
}
