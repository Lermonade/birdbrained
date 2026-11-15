// The three templates: one bird each from North America, Europe and Australia, about
// 120 degrees of longitude apart. The Templates page shows them as cards; the dashboard
// opens on one (?template=<id>) and offers the other two as shortcuts.

import type { GlobeView } from "../../components/globe_visualization/GlobeVisualization";

import baldEagle from "../../assets/templates/bald-eagle.jpg";
import commonWoodPigeon from "../../assets/templates/common-wood-pigeon.jpg";
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
    id: "bald-eagle",
    speciesKey: "bald_eagle",
    species: "Bald Eagle",
    region: "North America",
    startYear: 2010,
    endYear: 2025,
    view: { lat: 39.5, lng: -98.5, altitude: 1.7 },
    imageUrl: baldEagle,
    imageAlt:
      "A Bald Eagle with its wings half open, perched on a weathered stump in front of a snowy mountain",
    credit: "Andy Morffew, CC BY 2.0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Bald_eagle_about_to_fly_in_Alaska_(2016).jpg",
  },
  {
    id: "common-wood-pigeon",
    speciesKey: "common_wood_pigeon",
    species: "Common Wood Pigeon",
    region: "Europe",
    startYear: 2010,
    endYear: 2025,
    view: { lat: 49, lng: 10, altitude: 1.7 },
    imageUrl: commonWoodPigeon,
    imageAlt:
      "A Common Wood Pigeon perched on a branch, showing its white neck patch and orange bill",
    credit: "Romzig, CC0",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Ringeltaube_(April_2025).jpg",
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
