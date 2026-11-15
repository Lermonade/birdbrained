
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

import type { DataPoint } from "../components/globe_visualization/GlobeVisualization";

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

export interface SpeciesData {
  speciesId: number;
  dataPoints: DataPoint[];
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

  // Database 1: Species catalogue
  allSpecies: BirdSpecies[];
  updateSpeciesList: (species: SpeciesInput[]) => void;
  updateSpeciesColor: (id: number, color: string) => void;

  // Selected species
  selectedSpeciesIds: number[];
  selectedSpecies: BirdSpecies[];
  addSelectedSpecies: (id: number) => Promise<void>;
  removeSelectedSpecies: (id: number) => void;

  // Database 2: Geographic data
  speciesData: SpeciesData[];
  loadingSpeciesIds: number[];
  getSpeciesData: (id: number) => Promise<void>;
  removeSpeciesData: (id: number) => void;
}

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const MAX_SELECTED_SPECIES = 10;
const POINTS_PER_SPECIES = 2000;

// Muted but distinguishable colors.
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
// Mock geographic data generation
// --------------------------------------------------

function generateDataPoints(count: number): DataPoint[] {
  return Array.from({ length: count }, () => ({
    lat: Math.random() * 160 - 80,
    lng: Math.random() * 360 - 180,
    height: 0,
    population: 1,
  }));
}

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
    dataDisplayType: VisualizationType.PILLARS,
    earthDisplayType: EarthType.TEXTURED,
    filters: initialFilters,
  });

  // ------------------------------------------------
  // Database 1: Species catalogue
  // ------------------------------------------------

  const [allSpecies, setAllSpecies] = useState<BirdSpecies[]>([]);

  const allSpeciesRef = useRef<BirdSpecies[]>([]);

  const updateSpeciesList = useCallback(
    (species: SpeciesInput[]) => {
      const updatedSpecies = species.map((item, index) => ({
        id: index + 1,
        name: item.name,
        sightings: item.sightings,
        color:
          SPECIES_COLORS[index % SPECIES_COLORS.length],
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
  // Database 2: Geographic data
  // ------------------------------------------------

  const [speciesData, setSpeciesDataState] =
    useState<SpeciesData[]>([]);

  const [loadingSpeciesIds, setLoadingSpeciesIds] =
    useState<number[]>([]);

  // Synchronous reference to geographic data.
  const speciesDataRef = useRef<SpeciesData[]>([]);

  // Tracks currently running requests.
  const inFlightRequestsRef = useRef(
    new Map<number, Promise<void>>()
  );

  // Identifies the latest request for each species.
  const requestVersionsRef = useRef(
    new Map<number, number>()
  );

  // Synchronously update the geographic database.
  const commitSpeciesData = useCallback(
    (updater: (current: SpeciesData[]) => SpeciesData[]) => {
      const updated = updater(speciesDataRef.current);

      speciesDataRef.current = updated;
      setSpeciesDataState(updated);
    },
    []
  );

  // ------------------------------------------------
  // Fetch species geographic data
  // ------------------------------------------------

  const getSpeciesData = useCallback(
    (id: number): Promise<void> => {
      // Only fetch data for currently selected species.
      if (!selectedSpeciesIdsRef.current.includes(id)) {
        return Promise.resolve();
      }

      // Already loaded.
      if (
        speciesDataRef.current.some(
          item => item.speciesId === id
        )
      ) {
        return Promise.resolve();
      }

      // Request already running.
      const existingRequest =
        inFlightRequestsRef.current.get(id);

      if (existingRequest) {
        return existingRequest;
      }

      // Create a new request version.
      const version =
        (requestVersionsRef.current.get(id) ?? 0) + 1;

      requestVersionsRef.current.set(id, version);

      setLoadingSpeciesIds(current =>
        current.includes(id)
          ? current
          : [...current, id]
      );

      // TODO: Replace mock generation with backend request.
      const request = Promise.resolve().then(async () => {
        try {
          const generatedData = generateDataPoints(
            POINTS_PER_SPECIES
          );

          // Ignore results from outdated requests.
          if (
            requestVersionsRef.current.get(id) !== version
          ) {
            return;
          }

          // Ignore results if species was removed.
          if (!selectedSpeciesIdsRef.current.includes(id)) {
            return;
          }

          commitSpeciesData(current => {
            if (
              current.some(item => item.speciesId === id)
            ) {
              return current;
            }

            return [
              ...current,
              {
                speciesId: id,
                dataPoints: generatedData,
              },
            ];
          });
        } finally {
          // Only clean up the current request.
          if (
            requestVersionsRef.current.get(id) === version
          ) {
            setLoadingSpeciesIds(current =>
              current.filter(speciesId => speciesId !== id)
            );

            if (
              inFlightRequestsRef.current.get(id) === request
            ) {
              inFlightRequestsRef.current.delete(id);
            }
          }
        }
      });

      inFlightRequestsRef.current.set(id, request);

      return request;
    },
    [commitSpeciesData]
  );

  // ------------------------------------------------
  // Remove geographic data
  // ------------------------------------------------

  const removeSpeciesData = useCallback(
    (id: number) => {
      // Invalidate any outstanding request.
      const nextVersion =
        (requestVersionsRef.current.get(id) ?? 0) + 1;

      requestVersionsRef.current.set(id, nextVersion);

      // Remove request tracking.
      inFlightRequestsRef.current.delete(id);

      // Remove loading indicator.
      setLoadingSpeciesIds(current =>
        current.filter(speciesId => speciesId !== id)
      );

      // Remove stored geographic data.
      commitSpeciesData(current =>
        current.filter(item => item.speciesId !== id)
      );
    },
    [commitSpeciesData]
  );

  // ------------------------------------------------
  // Selected species
  // ------------------------------------------------

  const [selectedSpeciesIds, setSelectedSpeciesIds] =
    useState<number[]>([]);

  // Synchronous reference prevents stale-state selection.
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

      // Ensure species exists in catalogue.
      const speciesExists = allSpeciesRef.current.some(
        species => species.id === id
      );

      if (!speciesExists) return;

      // Update selection synchronously.
      const updatedIds = [
        ...selectedSpeciesIdsRef.current,
        id,
      ];

      selectedSpeciesIdsRef.current = updatedIds;
      setSelectedSpeciesIds(updatedIds);

      // Fetch geographic data.
      await getSpeciesData(id);
    },
    [getSpeciesData]
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

      // Also remove associated geographic data.
      removeSpeciesData(id);
    },
    [removeSpeciesData]
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

        speciesData,
        loadingSpeciesIds,
        getSpeciesData,
        removeSpeciesData,
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