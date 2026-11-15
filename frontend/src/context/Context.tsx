
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

import {
  VisualizationType,
  EarthType,
} from "../components/globe_visualization/GlobeVisualization";

// --------------------------------------------------
// Types
// --------------------------------------------------

export interface FilterSettings {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export interface BirdSpecies {
  id: number;
  name: string;
  sightings: number;
  color: string;
}

interface SpeciesInput {
  name: string;
  sightings: number;
}

interface Settings {
  dataDisplayType: VisualizationType;
  earthDisplayType: EarthType;
  filters: FilterSettings;
}

interface ContextType {
  settings: Settings;

  setDataDisplayType: (value: VisualizationType) => void;
  setEarthDisplayType: (value: EarthType) => void;
  updateFilters: (filters: FilterSettings) => void;

  // Backend species catalogue
  allSpecies: BirdSpecies[];
  updateSpeciesList: (species: SpeciesInput[]) => void;
  updateSpeciesColor: (id: number, color: string) => void;

  // Selected species
  selectedSpeciesIds: number[];
  selectedSpecies: BirdSpecies[];
  addSelectedSpecies: (id: number) => Promise<void>;
  removeSelectedSpecies: (id: number) => void;
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const MAX_SELECTED_SPECIES = 10;

const SPECIES_COLORS = [
  "#B66D6D",
  "#B58A50",
  "#668EAA",
  "#8976A8",
  "#A69A53",
  "#648E75",
  "#858585",
  "#A77F67",
  "#559A95",
  "#A96F50",
];

// --------------------------------------------------
// Initial filters
// --------------------------------------------------

const initialFilters: FilterSettings = {
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
};

// --------------------------------------------------
// Filter validation
// --------------------------------------------------

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function validateFilters(filters: FilterSettings): boolean {
  const {
    startDate,
    startTime,
    endDate,
    endTime,
  } = filters;

  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate) ||
    !isValidTime(startTime) ||
    !isValidTime(endTime)
  ) {
    return false;
  }

  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);

  return end.getTime() > start.getTime();
}

// --------------------------------------------------
// Context
// --------------------------------------------------

const Context = createContext<ContextType | null>(null);

export function ContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  // ------------------------------------------------
  // Visualization settings
  // ------------------------------------------------

  const [settings, setSettings] = useState<Settings>({
    dataDisplayType: VisualizationType.STAMPS,
    earthDisplayType: EarthType.TEXTURED,
    filters: initialFilters,
  });

  // ------------------------------------------------
  // Backend species catalogue
  // ------------------------------------------------

  const [allSpecies, setAllSpecies] = useState<BirdSpecies[]>([]);

  const allSpeciesRef = useRef<BirdSpecies[]>([]);

  const updateSpeciesList = useCallback(
    (species: SpeciesInput[]) => {
      const updatedSpecies = species.map((item, index) => ({
        id: index + 1,
        name: item.name,
        sightings: item.sightings,
        color: SPECIES_COLORS[index % SPECIES_COLORS.length],
      }));

      allSpeciesRef.current = updatedSpecies;
      setAllSpecies(updatedSpecies);
    },
    []
  );

  const updateSpeciesColor = useCallback(
    (id: number, color: string) => {
      const updatedSpecies = allSpeciesRef.current.map(
        species =>
          species.id === id
            ? { ...species, color }
            : species
      );

      allSpeciesRef.current = updatedSpecies;
      setAllSpecies(updatedSpecies);
    },
    []
  );

  // ------------------------------------------------
  // Selected species
  // ------------------------------------------------

  const [selectedSpeciesIds, setSelectedSpeciesIds] =
    useState<number[]>([]);

  const selectedSpeciesIdsRef = useRef<number[]>([]);

  const selectedSpecies = allSpecies.filter(species =>
    selectedSpeciesIds.includes(species.id)
  );

  // ------------------------------------------------
  // Add selected species
  // ------------------------------------------------

  const addSelectedSpecies = useCallback(
    async (id: number) => {
      // Prevent duplicates.
      if (selectedSpeciesIdsRef.current.includes(id)) {
        return;
      }

      // Enforce selection limit.
      if (
        selectedSpeciesIdsRef.current.length >=
        MAX_SELECTED_SPECIES
      ) {
        return;
      }

      // Ensure species exists in backend catalogue.
      const speciesExists = allSpeciesRef.current.some(
        species => species.id === id
      );

      if (!speciesExists) return;

      // Colors repeat every 10 species in the catalog, so a new species can match one
      // already shown. Give it the first color nobody shown is using (there's always one,
      // with at most 10 shown); it keeps that color from then on.
      const shownColors = new Set(
        allSpeciesRef.current
          .filter(species => selectedSpeciesIdsRef.current.includes(species.id))
          .map(species => species.color.toLowerCase())
      );
      const added = allSpeciesRef.current.find(species => species.id === id);
      const free = SPECIES_COLORS.find(color => !shownColors.has(color.toLowerCase()));

      if (added && free && shownColors.has(added.color.toLowerCase())) {
        updateSpeciesColor(id, free);
      }

      const updatedIds = [
        ...selectedSpeciesIdsRef.current,
        id,
      ];

      selectedSpeciesIdsRef.current = updatedIds;
      setSelectedSpeciesIds(updatedIds);
    },
    [updateSpeciesColor]
  );

  // ------------------------------------------------
  // Remove selected species
  // ------------------------------------------------

  const removeSelectedSpecies = useCallback(
    (id: number) => {
      const updatedIds =
        selectedSpeciesIdsRef.current.filter(
          speciesId => speciesId !== id
        );

      selectedSpeciesIdsRef.current = updatedIds;
      setSelectedSpeciesIds(updatedIds);
    },
    []
  );

  // ------------------------------------------------
  // Visualization settings
  // ------------------------------------------------

  const setDataDisplayType = useCallback(
    (value: VisualizationType) => {
      setSettings(current => ({
        ...current,
        dataDisplayType: value,
      }));
    },
    []
  );

  const setEarthDisplayType = useCallback(
    (value: EarthType) => {
      setSettings(current => ({
        ...current,
        earthDisplayType: value,
      }));
    },
    []
  );

  // ------------------------------------------------
  // Filters
  // ------------------------------------------------

  const updateFilters = useCallback(
    (filters: FilterSettings) => {
      if (!validateFilters(filters)) return;

      setSettings(current => ({
        ...current,
        filters,
      }));
    },
    []
  );

  // ------------------------------------------------
  // Provider
  // ------------------------------------------------

  return (
    <Context.Provider
      value={{
        settings,

        setDataDisplayType,
        setEarthDisplayType,
        updateFilters,

        allSpecies,
        updateSpeciesList,
        updateSpeciesColor,

        selectedSpeciesIds,
        selectedSpecies,
        addSelectedSpecies,
        removeSelectedSpecies,
      }}
    >
      {children}
    </Context.Provider>
  );
}

// --------------------------------------------------
// Hook
// --------------------------------------------------

export function useContextSettings() {
  const context = useContext(Context);

  if (!context) {
    throw new Error(
      "useContextSettings must be used inside ContextProvider"
    );
  }

  return context;
}
