import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router";

import GlobeVisualization, {
  type DataPoint,
  type DataSet,
  type GlobeHandle,
  type GlobeView,
  VisualizationType,
} from "../../components/globe_visualization/GlobeVisualization";

import DashboardSidebar from "../../components/sidebar/Sidebar";
import DetailPanel from "../../components/detail_panel/DetailPanel";
import Landing from "../../components/landing/Landing";
import Starfield from "../../components/landing/Starfield";

import type { Scene } from "../../components/landing/timeline";

import { api, API_BASE } from "../../api/client";
import type { GrabData, Region, Species } from "../../api/client";

import {
  ContextProvider,
  useContextSettings,
} from "../../context/Context";

import {
  parsePointId,
  toDatasets,
  type SpeciesSightings,
} from "./globeData";

import styles from "./dashboard.module.css";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const DEFAULT_SPECIES = "chimney_swift";

const US_VIEW: GlobeView = {
  lat: 39.5,
  lng: -98.5,
  altitude: 1.7,
};

const STATE_ALTITUDE = 1.1;

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

const NO_DATASETS: DataSet[] = [];

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function sightings(grab: GrabData | undefined): number {
  return (
    grab?.species[0]?.dataPoints.reduce(
      (sum, point) => sum + point.endCount,
      0
    ) ?? 0
  );
}

// --------------------------------------------------
// Dashboard content
// --------------------------------------------------

function DashboardContent() {
  // ------------------------------------------------
  // Navigation
  // ------------------------------------------------

  const intro = useLocation().pathname === "/";
  const navigate = useNavigate();

  const enter = useCallback(
    () => navigate("/dashboard"),
    [navigate]
  );

  // ------------------------------------------------
  // Context
  // ------------------------------------------------

  const {
    settings,
    allSpecies,
    selectedSpeciesIds,
    updateSpeciesList,
    addSelectedSpecies,
  } = useContextSettings();

  // ------------------------------------------------
  // Backend data
  // ------------------------------------------------

  const [regions, setRegions] = useState<Region[]>([]);
  const [catalog, setCatalog] = useState<Species[]>([]);
  const [grabs, setGrabs] = useState<Record<string, GrabData>>({});

  const [error, setError] = useState<string | null>(null);

  // The currently selected globe point, including its species.
  const [selected, setSelected] = useState<{
    speciesKey: string;
    region: string;
  } | null>(null);

  const [focus, setFocus] = useState<GlobeView>(US_VIEW);

  // ------------------------------------------------
  // Landing animation state
  // ------------------------------------------------

  const [landed, setLanded] = useState(!intro);

  const globe = useRef<GlobeHandle | null>(null);
  const globeFrame = useRef<HTMLElement | null>(null);

  const scene = useRef<Scene>({
    progress: intro ? 0 : 1,
  });

  // Reset dashboard when returning to landing.
  const [wasIntro, setWasIntro] = useState(intro);

  if (intro !== wasIntro) {
    setWasIntro(intro);

    if (intro) {
      setSelected(null);
      setFocus(US_VIEW);
    }
  }

  // ------------------------------------------------
  // Fetch backend catalogue and geographic data
  // ------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadBackendData() {
      try {
        setError(null);

        const [regionsResult, speciesResult] =
          await Promise.all([
            api.regions(),
            api.species(),
          ]);

        if (cancelled) return;

        // Fetch geographic data for every backend species.
        const grabResults = await Promise.all(
          speciesResult.map(species =>
            api.grabData(species.key)
          )
        );

        if (cancelled) return;

        const byKey: Record<string, GrabData> = {};

        speciesResult.forEach((species, index) => {
          byKey[species.key] = grabResults[index];
        });

        setRegions(regionsResult);
        setCatalog(speciesResult);
        setGrabs(byKey);

        // The backend is the only source of species.
        updateSpeciesList(
          speciesResult.map(species => ({
            name: species.commonName,
            sightings: sightings(byKey[species.key]),
          }))
        );

        // Automatically select the default species.
        const defaultIndex = speciesResult.findIndex(
          species => species.key === DEFAULT_SPECIES
        );

        if (defaultIndex !== -1) {
          void addSelectedSpecies(defaultIndex + 1);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load backend data."
          );
        }
      }
    }

    void loadBackendData();

    return () => {
      cancelled = true;
    };
  }, [updateSpeciesList, addSelectedSpecies]);

  // ------------------------------------------------
  // Build multi-species globe datasets
  // ------------------------------------------------

  const datasets = useMemo(() => {
    const real: SpeciesSightings[] = [];

    for (const id of selectedSpeciesIds) {
      const species = allSpecies.find(
        item => item.id === id
      );

      if (!species) continue;

      // IDs correspond directly to backend catalogue order.
      const key = catalog[id - 1]?.key;

      if (!key) continue;

      const points = grabs[key]?.species[0]?.dataPoints;

      if (!points) continue;

      real.push({
        key,
        name: species.name,
        color: species.color,
        points,
      });
    }

    const year = Object.values(grabs)[0]?.endYear;

    return year === undefined
      ? NO_DATASETS
      : toDatasets(real, year);
  }, [
    selectedSpeciesIds,
    allSpecies,
    catalog,
    grabs,
  ]);

  // ------------------------------------------------
  // Globe interaction
  // ------------------------------------------------

  const handlePointClick = useCallback(
    (point: DataPoint) => {
      if (!point.id) return;

      setSelected(parsePointId(point.id));

      setFocus({
        lat: point.lat,
        lng: point.lng,
        altitude: STATE_ALTITUDE,
      });
    },
    []
  );

  // ------------------------------------------------
  // Detail panel data
  // ------------------------------------------------

  const selectedGrab = selected
    ? grabs[selected.speciesKey]
    : undefined;

  const selectedSpeciesId = selected
    ? catalog.findIndex(
        species => species.key === selected.speciesKey
      ) + 1
    : undefined;

  const panelOpen =
    selected !== null &&
    selectedGrab !== undefined &&
    selectedSpeciesId !== undefined &&
    selectedSpeciesIds.includes(selectedSpeciesId);

  const selectedPoint = selectedGrab?.species[0]?.dataPoints.find(
    point => point.region === selected?.region
  );

  const selectedRegionName =
    regions.find(
      region => region.id === selected?.region
    )?.name ??
    selectedPoint?.name ??
    "";

  // ------------------------------------------------
  // Sidebar resizing
  // ------------------------------------------------

  const [sidebarWidth, setSidebarWidth] =
    useState(DEFAULT_SIDEBAR_WIDTH);

  const [isDragging, setIsDragging] = useState(false);

  const dragStartX = useRef(0);
  const dragStartWidth = useRef(sidebarWidth);

  function handlePointerDown(
    e: React.PointerEvent<HTMLDivElement>
  ) {
    e.preventDefault();

    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    setIsDragging(true);
  }

  useEffect(() => {
    if (!isDragging) return;

    function handlePointerMove(e: PointerEvent) {
      const delta = e.clientX - dragStartX.current;

      setSidebarWidth(
        Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.max(
            MIN_SIDEBAR_WIDTH,
            dragStartWidth.current + delta
          )
        )
      );
    }

    function handlePointerUp() {
      setIsDragging(false);
    }

    window.addEventListener(
      "pointermove",
      handlePointerMove
    );

    window.addEventListener(
      "pointerup",
      handlePointerUp
    );

    window.addEventListener(
      "pointercancel",
      handlePointerUp
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );

      window.removeEventListener(
        "pointercancel",
        handlePointerUp
      );
    };
  }, [isDragging]);

  function handleDividerKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>
  ) {
    if (e.key === "ArrowLeft") {
      setSidebarWidth(width =>
        Math.max(MIN_SIDEBAR_WIDTH, width - 20)
      );
    }

    if (e.key === "ArrowRight") {
      setSidebarWidth(width =>
        Math.min(MAX_SIDEBAR_WIDTH, width + 20)
      );
    }
  }

  // ------------------------------------------------
  // Loading state
  // ------------------------------------------------

  const loading = catalog.length === 0 && error === null;

  // ------------------------------------------------
  // Render
  // ------------------------------------------------

  return (
    <main
      className={[
        styles.dashboard,
        intro ? styles.intro : "",
        isDragging ? styles.dragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Starfield scene={scene} />

      <div
        className={styles.workspace}
        style={
          intro
            ? undefined
            : {
                gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)`,
              }
        }
      >
        {!intro && <DashboardSidebar />}

        {!intro && (
          <div
            className={styles.resizeHandle}
            onPointerDown={handlePointerDown}
            onKeyDown={handleDividerKeyDown}
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            tabIndex={0}
          />
        )}

        <section
          ref={globeFrame}
          className={styles.visualization}
        >
          <GlobeVisualization
            ref={globe}
            datasets={landed ? datasets : NO_DATASETS}
            visualizationType={
              intro
                ? VisualizationType.PILLARS
                : settings.dataDisplayType
            }
            earthType={settings.earthDisplayType}
            onPointClick={handlePointClick}
            focus={intro ? null : focus}
            transparentBackground
          />

          {/* Loading */}
          {!intro && loading && (
            <div className={styles.status}>
              Loading species and geographic data...
            </div>
          )}

          {/* Backend error */}
          {!intro && error && (
            <div
              className={styles.errorCard}
              role="alert"
            >
              <strong>Can't load the data.</strong>

              <p>{error}</p>

              <p>
                Check that the backend is running. From{" "}
                <code>backend/</code>, run{" "}
                <code>uvicorn main:app --port 8000</code>.
                It should answer at {API_BASE}.
              </p>
            </div>
          )}

          {/* Detail panel */}
          {!intro &&
            panelOpen &&
            selected &&
            selectedGrab && (
              <DetailPanel
                key={`${selected.speciesKey}|${selected.region}|${selectedGrab.startYear}|${selectedGrab.endYear}`}
                speciesKey={selected.speciesKey}
                speciesName={
                  selectedGrab.species[0]?.name ??
                  selected.speciesKey
                }
                regionId={selected.region}
                regionName={selectedRegionName}
                point={selectedPoint}
                start={selectedGrab.startYear}
                end={selectedGrab.endYear}
                onClose={() => setSelected(null)}
              />
            )}
        </section>
      </div>

      {/* Landing page */}
      <Landing
        active={intro}
        onEnter={enter}
        onImpact={setLanded}
        destination={US_VIEW}
        globe={globe}
        globeFrame={globeFrame}
        scene={scene}
      />
    </main>
  );
}

// --------------------------------------------------
// Dashboard provider
// --------------------------------------------------

export default function Dashboard() {
  return (
    <ContextProvider>
      <DashboardContent />
    </ContextProvider>
  );
}
