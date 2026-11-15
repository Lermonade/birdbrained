// The three templates: one bird each from North America, South America and Australia,
// each found almost only on its own continent (99% or more of its records). One falls,
// one holds steady and one rises, plainly enough to see in the stamps as the timeline
// plays. Each one's years are where its regions keep steady coverage, so stamps don't
// pop in as more people start recording (a region with too few records in a year has
// no stamp that year):
// - Great Horned Owl, 2016 to 2025: falling. The typical state ends at about two thirds
//   of where it started (Colorado 281 to 157), 24 states falling on its trend to 2 rising.
// - Rufous Hornero, 2021 to 2025: steady. The big stamps barely move (Buenos Aires 377
//   to 396, Córdoba 387 to 395, Montevideo 300 to 331).
// - Noisy Miner, 2012 to 2025: rising. The total grows from 2,067 to 3,481 across the
//   same 6 states.
// The Templates page shows them as cards; the dashboard opens on one (?template=<id>)
// and offers the other two as shortcuts.

import type { GlobeView } from "../../components/globe_visualization/GlobeVisualization";

import greatHornedOwl from "../../assets/templates/great-horned-owl.jpg";
import rufousHornero from "../../assets/templates/rufous-hornero.jpg";
import noisyMiner from "../../assets/templates/noisy-miner.jpg";

export interface BirdTemplate {
  /** What goes in the address: /dashboard?template=<id> */
  id: string;
  /** The species' key in the backend's catalog (data/static/species.json). */
  speciesKey: string;
  species: string;
  region: string;
  startYear: number;
  endYear: number;
  /** Where the globe turns to when the template opens. */
  view: GlobeView;
  imageUrl: string;
  imageAlt: string;
  /** Photographer and licence, shown under the card. */
  credit: string;
  /** The photo's Wikimedia Commons page, which lists author and licence. */
  creditUrl: string;
}

export const TEMPLATES: BirdTemplate[] = [
  {
    id: "great-horned-owl",
    speciesKey: "great_horned_owl",
    species: "Great Horned Owl",
    region: "North America",
    startYear: 2016,
    endYear: 2025,
    view: { lat: 39.5, lng: -98.5, altitude: 1.7 },
    imageUrl: greatHornedOwl,
    imageAlt:
      "A Great Horned Owl with yellow eyes and ear tufts perched on a branch against a dark tree trunk",
    credit: "Great Sand Dunes National Park and Preserve, public domain",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Great_Horned_Owl_(30706490070).jpg",
  },
  {
    id: "rufous-hornero",
    speciesKey: "rufous_hornero",
    species: "Rufous Hornero",
    region: "South America",
    startYear: 2021,
    endYear: 2025,
    view: { lat: -30, lng: -58, altitude: 1.7 },
    imageUrl: rufousHornero,
    imageAlt:
      "A rusty-brown Rufous Hornero with a red eye striding along a fallen log",
    credit: "Charles J. Sharp, CC BY-SA 4.0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Rufous_hornero_(Furnarius_rufus)_Colonia.jpg",
  },
  {
    id: "noisy-miner",
    speciesKey: "noisy_miner",
    species: "Noisy Miner",
    region: "Australia",
    startYear: 2012,
    endYear: 2025,
    view: { lat: -31, lng: 145, altitude: 1.7 },
    imageUrl: noisyMiner,
    imageAlt:
      "A grey Noisy Miner with a yellow bill and yellow eye patch perched on a rope",
    credit: "Charles J. Sharp, CC BY-SA 4.0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Noisy_miner_(Manorina_melanocephala_melanocephala)_Adelaide.jpg",
  },
];

export function findTemplate(id: string | null | undefined): BirdTemplate | undefined {
  return TEMPLATES.find(template => template.id === id);
}
