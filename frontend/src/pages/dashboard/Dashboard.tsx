import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import type { Scene } from "../../components/landing/timeline";
import { api, API_BASE } from "../../api/client";
import type { GrabData, Region, Species } from "../../api/client";
import { ContextProvider, useContextSettings } from "../../context/Context";
import { useLook } from "../../looks";
import { parsePointId, toDatasets, type SpeciesSightings } from "./globeData";

import styles from "./dashboard.module.css";

// The species the globe starts on, and what it shows on the landing
const DEFAULT_SPECIES = "chimney_swift";

const US_VIEW: GlobeView = { lat: 39.5, lng: -98.5, altitude: 1.7 };
const STATE_ALTITUDE = 1.1;

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

const NO_DATASETS: DataSet[] = [];

// Silas's placeholder birds. They're always in the sidebar's species search, even
// without the backend, and show sample points on the globe. The real species follow them.
const PLACEHOLDER_SPECIES = [
  { name: "Robin", sightings: 1248 },
  { name: "Kingfisher", sightings: 856 },
  { name: "Bluebird", sightings: 634 },
  { name: "Barn Owl", sightings: 921 },
  { name: "Goldfinch", sightings: 1450 },
  { name: "Woodpecker", sightings: 782 },
  { name: "Blackbird", sightings: 1102 },
  { name: "Sparrow", sightings: 1875 },
  { name: "Hummingbird", sightings: 542 },
  { name: "Eagle", sightings: 318 },
];

// Sightings across all states in the last year, for the sidebar's species list
function sightings(grab: GrabData | undefined): number {
  return grab?.species[0]?.dataPoints.reduce((sum, point) => sum + point.endCount, 0) ?? 0;
}

function DashboardContent() {
  // "/" plays the landing over the globe; "/dashboard" is the globe with the sidebar
  const intro = useLocation().pathname === "/";
  const navigate = useNavigate();
  const look = useLook();
  const enter = useCallback(() => navigate("/dashboard"), [navigate]);

  const {
    settings,
    allSpecies,
    selectedSpeciesIds,
    speciesData,
    updateSpeciesList,
    addSelectedSpecies,
  } = useContextSettings();

  // Backend data
  const [regions, setRegions] = useState<Region[]>([]);
  const [catalog, setCatalog] = useState<Species[]>([]);
  const [grabs, setGrabs] = useState<Record<string, GrabData>>({});
  const [error, setError] = useState<string | null>(null);

  // The state clicked on the globe, and the species whose pillar or point it was
  const [selected, setSelected] = useState<{ speciesKey: string; region: string } | null>(null);
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
      setSelected(null);
      setFocus(US_VIEW);
    }
  }

  // States, species and each species' globe data, once.
  // The sidebar numbers species 1, 2, 3... in list order: the placeholders first,
  // so their numbers stay the same when the backend's species are added after them.
  useEffect(() => {
    let cancelled = false;

    updateSpeciesList(PLACEHOLDER_SPECIES);

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

        updateSpeciesList([
          ...PLACEHOLDER_SPECIES,
          ...speciesResult.map(s => ({ name: s.commonName, sightings: sightings(byKey[s.key]) })),
        ]);
        const defaultIndex = speciesResult.findIndex(s => s.key === DEFAULT_SPECIES);
        void addSelectedSpecies(PLACEHOLDER_SPECIES.length + (defaultIndex === -1 ? 0 : defaultIndex) + 1);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [updateSpeciesList, addSelectedSpecies]);

  // The globe shows every species selected in the sidebar, each in its sidebar color.
  // Sidebar ids count the placeholders first, then the backend's species in catalog order.
  const datasets = useMemo(() => {
    const real: SpeciesSightings[] = [];
    const placeholders: DataSet[] = [];

    for (const id of selectedSpeciesIds) {
      const species = allSpecies.find(s => s.id === id);
      if (!species) continue;

      if (id <= PLACEHOLDER_SPECIES.length) {
        const points = speciesData.find(d => d.speciesId === id)?.dataPoints;
        if (points) placeholders.push({ name: species.name, color: species.color, dataPoints: points });
        continue;
      }

      const key = catalog[id - PLACEHOLDER_SPECIES.length - 1]?.key;
      const points = key ? grabs[key]?.species[0]?.dataPoints : undefined;
      if (key && points) real.push({ key, name: species.name, color: species.color, points });
    }

    const year = Object.values(grabs)[0]?.endYear;
    return [...(year === undefined ? NO_DATASETS : toDatasets(real, year)), ...placeholders];
  }, [selectedSpeciesIds, allSpecies, speciesData, catalog, grabs]);

  const hasPlaceholder = selectedSpeciesIds.some(id => id <= PLACEHOLDER_SPECIES.length);
  const loading = catalog.length === 0 && error === null;

  const handlePointClick = useCallback((point: DataPoint) => {
    if (!point.id) return;
    setSelected(parsePointId(point.id));
    setFocus({ lat: point.lat, lng: point.lng, altitude: STATE_ALTITUDE });
  }, []);

  // The detail panel, while the clicked species is still selected
  const selectedGrab = selected ? grabs[selected.speciesKey] : undefined;
  const selectedSpeciesId = selected
    ? catalog.findIndex(s => s.key === selected.speciesKey) + PLACEHOLDER_SPECIES.length + 1
    : undefined;
  const panelOpen =
    selected !== null &&
    selectedGrab !== undefined &&
    selectedSpeciesId !== undefined &&
    selectedSpeciesIds.includes(selectedSpeciesId);
  const selectedPoint = selectedGrab?.species[0]?.dataPoints.find(p => p.region === selected?.region);
  const selectedRegionName =
    regions.find(r => r.id === selected?.region)?.name ?? selectedPoint?.name ?? "";

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
      // Where the globe's center is, for backdrops that put something behind it
      style={
        {
          "--globe-cx": intro ? "50%" : `calc(50% + ${(sidebarWidth + 6) / 2}px)`,
          "--globe-cy": intro ? "50%" : "calc(50% + var(--nav-h) / 2)",
        } as CSSProperties
      }
    >
      <look.Backdrop key={look.id} scene={scene} />

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
            art={look.art}
          />

          {!intro && !hasPlaceholder && loading && <div className={styles.status}>Loading data...</div>}

          {!intro && !hasPlaceholder && error && (
            <div className={styles.errorCard} role="alert">
              <strong>Can't load the data.</strong>
              <p>{error}</p>
              <p>
                Start the backend: in <code>backend/</code>, run{" "}
                <code>uvicorn main:app --port 8000</code>. It should answer at {API_BASE}.
              </p>
            </div>
          )}

          {!intro && panelOpen && selected && selectedGrab && (
            <DetailPanel
              key={`${selected.speciesKey}|${selected.region}|${selectedGrab.startYear}|${selectedGrab.endYear}`}
              speciesKey={selected.speciesKey}
              speciesName={selectedGrab.species[0]?.name ?? selected.speciesKey}
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
