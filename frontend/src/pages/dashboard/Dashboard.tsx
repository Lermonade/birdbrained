import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ContextProvider, useContextSettings } from "../../context/Context";
import { DOWN_COLOR, UP_COLOR, toDatasets, type Mode } from "./globeData";

import styles from "./dashboard.module.css";

// The species the globe starts on, and what it shows on the landing
const DEFAULT_SPECIES = "chimney_swift";
const MODE: Mode = "corrected";

const US_VIEW: GlobeView = { lat: 39.5, lng: -98.5, altitude: 1.7 };
const STATE_ALTITUDE = 1.1;

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

const NO_DATASETS: DataSet[] = [];

// Sightings across all states in the last year, for the sidebar's species list
function sightings(grab: GrabData | undefined): number {
  return grab?.species[0]?.dataPoints.reduce((sum, point) => sum + point.endCount, 0) ?? 0;
}

function DashboardContent() {
  // "/" plays the landing over the globe; "/dashboard" is the globe with the sidebar
  const intro = useLocation().pathname === "/";
  const navigate = useNavigate();
  const enter = useCallback(() => navigate("/dashboard"), [navigate]);

  const {
    settings,
    selectedSpeciesIds,
    updateSpeciesList,
    addSelectedSpecies,
  } = useContextSettings();

  // Backend data
  const [regions, setRegions] = useState<Region[]>([]);
  const [catalog, setCatalog] = useState<Species[]>([]);
  const [grabs, setGrabs] = useState<Record<string, GrabData>>({});
  const [error, setError] = useState<string | null>(null);

  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [focus, setFocus] = useState<GlobeView>(US_VIEW);

  // The pillars come up when the landing's bird reaches the globe, and go again
  // if the scene is rewound. Loading the dashboard directly, they're up from the start.
  const [landed, setLanded] = useState(!intro);

  // What the landing drives directly, without going through React
  const globe = useRef<GlobeHandle | null>(null);
  const globeFrame = useRef<HTMLElement | null>(null);
  const scene = useRef<Scene>({ progress: intro ? 0 : 1 });

  // Back on the landing: start it from a clean dashboard
  const [wasIntro, setWasIntro] = useState(intro);
  if (intro !== wasIntro) {
    setWasIntro(intro);
    if (intro) {
      setSelectedRegion(null);
      setFocus(US_VIEW);
    }
  }

  // States, species and each species' globe data, once.
  // The sidebar's species list is the backend's species, starting on the default one.
  useEffect(() => {
    let cancelled = false;

    Promise.all([api.regions(), api.species()])
      .then(async ([regionsResult, speciesResult]) => {
        const grabResults = await Promise.all(speciesResult.map(s => api.grabData(s.key)));
        if (cancelled) return;

        const byKey: Record<string, GrabData> = {};
        speciesResult.forEach((s, i) => {
          byKey[s.key] = grabResults[i];
        });

        setRegions(regionsResult);
        setCatalog(speciesResult);
        setGrabs(byKey);

        // The sidebar numbers species 1, 2, 3... in this order
        updateSpeciesList(
          speciesResult.map(s => ({ name: s.commonName, sightings: sightings(byKey[s.key]) }))
        );
        const defaultIndex = speciesResult.findIndex(s => s.key === DEFAULT_SPECIES);
        void addSelectedSpecies((defaultIndex === -1 ? 0 : defaultIndex) + 1);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [updateSpeciesList, addSelectedSpecies]);

  // The globe shows the species picked most recently in the sidebar
  const latestId = selectedSpeciesIds[selectedSpeciesIds.length - 1];
  const speciesKey = latestId === undefined ? null : (catalog[latestId - 1]?.key ?? null);
  const grab = speciesKey ? grabs[speciesKey] : undefined;

  const loading = catalog.length === 0 && error === null;
  const start = grab?.startYear ?? null;
  const end = grab?.endYear ?? null;

  const shownSpecies = grab?.species[0];
  const datasets = useMemo(
    () =>
      shownSpecies && start !== null && end !== null
        ? toDatasets(shownSpecies.name, shownSpecies.dataPoints, MODE, start, end)
        : NO_DATASETS,
    [shownSpecies, start, end]
  );

  const handlePointClick = useCallback((point: DataPoint) => {
    if (!point.id) return;
    setSelectedRegion(point.id);
    setFocus({ lat: point.lat, lng: point.lng, altitude: STATE_ALTITUDE });
  }, []);

  const selectedPoint = shownSpecies?.dataPoints.find(p => p.region === selectedRegion);
  const selectedRegionName =
    regions.find(r => r.id === selectedRegion)?.name ?? selectedPoint?.name ?? "";

  // ------------------------------------------------
  // Sidebar resizing
  // ------------------------------------------------

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartX = useRef(0);
  const dragStartWidth = useRef(sidebarWidth);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
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
        Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, dragStartWidth.current + delta))
      );
    }

    function handlePointerUp() {
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDragging]);

  function handleDividerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      setSidebarWidth(width => Math.max(MIN_SIDEBAR_WIDTH, width - 20));
    }

    if (e.key === "ArrowRight") {
      setSidebarWidth(width => Math.min(MAX_SIDEBAR_WIDTH, width + 20));
    }
  }

  // ------------------------------------------------
  // Render
  // ------------------------------------------------

  return (
    <main
      className={[styles.dashboard, intro ? styles.intro : "", isDragging ? styles.dragging : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Starfield scene={scene} />

      <div
        className={styles.workspace}
        // The landing has the globe alone; the sidebar comes in on the dashboard
        style={
          intro ? undefined : { gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }
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

        <section ref={globeFrame} className={styles.visualization}>
          <GlobeVisualization
            ref={globe}
            datasets={landed ? datasets : NO_DATASETS}
            // The landing always lands on pillars over the textured Earth
            visualizationType={intro ? VisualizationType.PILLARS : settings.dataDisplayType}
            earthType={settings.earthDisplayType}
            onPointClick={handlePointClick}
            // On the landing, the scroll moves the camera instead
            focus={intro ? null : focus}
            transparentBackground
          />

          {!intro && shownSpecies && start !== null && end !== null && (
            <div className={styles.legend}>
              <strong>{shownSpecies.name}</strong>, {start} to {end}
              <span className={styles.legendMode}>Share of all sightings (corrected)</span>
              <span className={styles.legendRow}>
                <span className={styles.swatch} style={{ background: UP_COLOR }} /> Up
                <span className={styles.swatch} style={{ background: DOWN_COLOR }} /> Down
              </span>
              <span className={styles.legendNote}>Height: size of the change</span>
            </div>
          )}

          {!intro && loading && <div className={styles.status}>Loading data...</div>}

          {!intro && error && (
            <div className={styles.errorCard} role="alert">
              <strong>Can't load the data.</strong>
              <p>{error}</p>
              <p>
                Start the backend: in <code>backend/</code>, run{" "}
                <code>uvicorn main:app --port 8000</code>. It should answer at {API_BASE}.
              </p>
            </div>
          )}

          {!intro && speciesKey && selectedRegion && start !== null && end !== null && (
            <DetailPanel
              key={`${speciesKey}|${selectedRegion}|${start}|${end}`}
              speciesKey={speciesKey}
              speciesName={shownSpecies?.name ?? speciesKey}
              regionId={selectedRegion}
              regionName={selectedRegionName}
              point={selectedPoint}
              start={start}
              end={end}
              onClose={() => setSelectedRegion(null)}
            />
          )}
        </section>
      </div>

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

export default function Dashboard() {
  return (
    <ContextProvider>
      <DashboardContent />
    </ContextProvider>
  );
}
