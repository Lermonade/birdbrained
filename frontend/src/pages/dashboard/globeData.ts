// Turns /api/counts into the datasets the globe draws: each region's raw sightings in one
// year, in the species' sidebar color. Stamp size and heatmap weight both come from the count.

import type { DataSet } from "../../components/globe_visualization/GlobeVisualization";
import type { Region } from "../../api/client";

// Change colors, still used by the detail panel. A color-blind-safe pair: blue up, orange down.
export const UP_COLOR = "#3b8bd4";
export const DOWN_COLOR = "#ef8a3c";

export function formatPct(value: number | null): string {
  if (value === null) return "no data";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}%`;
}

export interface SpeciesSightings {
  key: string;
  name: string;
  color: string;
  counts: Record<string, number[]>; // region id -> sightings per year (see CountsData)
}

// The id on each globe point: which species and which state, so a click knows both
export function pointId(speciesKey: string, region: string): string {
  return `${speciesKey}|${region}`;
}

export function parsePointId(id: string): { speciesKey: string; region: string } {
  const split = id.indexOf("|");
  return { speciesKey: id.slice(0, split), region: id.slice(split + 1) };
}

function label(name: string, color: string, region: string, count: number, year: number): string {
  return `
    <div style="color: white; padding: 6px 8px; font: 13px/1.4 system-ui, sans-serif;">
      <strong style="color: ${color}">${name}</strong><br />
      ${region}: ${count.toLocaleString()} sightings in ${year}<br />
      <span style="opacity: 0.7">Click for details</span>
    </div>
  `;
}

// The most sightings any shown species has in any region and year: the top of the
// stamps' size scale, shared so species and years can be compared (the legend uses it too)
export function maxCount(species: SpeciesSightings[]): number {
  let max = 1;
  for (const s of species) {
    for (const perYear of Object.values(s.counts)) {
      for (const count of perYear) if (count > max) max = count;
    }
  }
  return max;
}

// The most sightings one region has in one year, all shown species added together: the
// heatmap's darkest color, shared across years (the legend uses it too)
export function maxRegionTotal(species: SpeciesSightings[]): number {
  const totals = new Map<string, number[]>();
  let max = 1;

  for (const s of species) {
    for (const [region, perYear] of Object.entries(s.counts)) {
      const total = totals.get(region) ?? [];
      perYear.forEach((count, i) => {
        total[i] = (total[i] ?? 0) + count;
        if (total[i] > max) max = total[i];
      });
      totals.set(region, total);
    }
  }

  return max;
}

// One dataset per species, for the year at yearIndex. Stamps share one scale across every
// species shown and every year (area follows the count), so they grow and shrink along the
// timeline. Species in the same region stack on its center, the biggest at the bottom.
export function toDatasets(
  species: SpeciesSightings[],
  regions: Region[],
  yearIndex: number,
  year: number
): DataSet[] {
  const max = maxCount(species);

  // Each species' place in its region's stack: 0 for the most sightings
  const layers = new Map<string, number>();
  for (const region of regions) {
    species
      .map(s => ({ key: s.key, count: s.counts[region.id]?.[yearIndex] ?? 0 }))
      .filter(entry => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .forEach((entry, layer) => layers.set(pointId(entry.key, region.id), layer));
  }

  return species.map(s => ({
    name: s.name,
    color: s.color,
    dataPoints: regions.flatMap(region => {
      const count = s.counts[region.id]?.[yearIndex] ?? 0;
      if (count <= 0) return [];
      const id = pointId(s.key, region.id);
      const [lat, lng] = region.centroid;
      return [
        {
          id,
          lat,
          lng,
          population: count,
          size: Math.sqrt(count / max),
          layer: layers.get(id) ?? 0,
          label: label(s.name, s.color, region.name, count, year),
        },
      ];
    }),
  }));
}
