// The three templates: one bird each from North America, Europe and Australia, about
// 120 degrees of longitude apart. Two are falling and one is rising on the corrected
// counts over 2010 to 2025: of the regions with enough records, 31 of 36 for the Eastern
// Meadowlark and 26 of 27 for the Little Owl have shrunk, and 7 of 8 for the Australian
// Magpie have grown. The Templates page shows them as cards; the dashboard opens on one
// (?template=<id>) and offers the other two as shortcuts.

import type { GlobeView } from "../../components/globe_visualization/GlobeVisualization";

import easternMeadowlark from "../../assets/templates/eastern-meadowlark.jpg";
import littleOwl from "../../assets/templates/little-owl.jpg";
import australianMagpie from "../../assets/templates/australian-magpie.jpg";

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
    id: "eastern-meadowlark",
    speciesKey: "eastern_meadowlark",
    species: "Eastern Meadowlark",
    region: "North America",
    startYear: 2010,
    endYear: 2025,
    view: { lat: 39.5, lng: -98.5, altitude: 1.7 },
    imageUrl: easternMeadowlark,
    imageAlt:
      "An Eastern Meadowlark standing in dry grass, its bright yellow breast and black necklace facing the camera",
    credit: "Nosferattus, CC0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Eastern_Meadowlark_Sturnella_magna_02.jpg",
  },
  {
    id: "little-owl",
    speciesKey: "little_owl",
    species: "Little Owl",
    region: "Europe",
    startYear: 2010,
    endYear: 2025,
    view: { lat: 49, lng: 10, altitude: 1.7 },
    imageUrl: littleOwl,
    imageAlt:
      "A Little Owl with bright yellow eyes peering out from a dark gap between two slabs of concrete",
    credit: "Hobbyfotowiki, CC0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Little_owl_(Athene_noctua),.jpg",
  },
  {
    id: "australian-magpie",
    speciesKey: "australian_magpie",
    species: "Australian Magpie",
    region: "Australia",
    startYear: 2010,
    endYear: 2025,
    view: { lat: -28, lng: 134, altitude: 1.7 },
    imageUrl: australianMagpie,
    imageAlt:
      "A black and white Australian Magpie with a pale nape, standing on a post in front of a lawn",
    credit: "Amara Bharathy, CC BY-SA 4.0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Australian_Magpie_in_Victoria.jpg",
  },
];

export function findTemplate(id: string | null | undefined): BirdTemplate | undefined {
  return TEMPLATES.find(template => template.id === id);
}
