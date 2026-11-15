import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

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
import Timeline from "../../components/timeline/Timeline";
import Legend from "../../components/legend/Legend";
import TemplatePicker from "../../components/template_picker/TemplatePicker";
import AnalystPanel from "../../components/analyst/AnalystPanel";
import { useAnalyst } from "../../components/analyst/useAnalyst";
import { api, API_BASE } from "../../api/client";
import type { CountsData, GrabData, Region, Species } from "../../api/client";
import { ContextProvider, useContextSettings } from "../../context/Context";
import { useLook } from "../../looks";
import { maxCount, maxRegionTotal, parsePointId, toDatasets, type SpeciesSightings } from "./globeData";
import { findTemplate, TEMPLATES, type BirdTemplate } from "../templates/templateData";

import styles from "./dashboard.module.css";

// The species the globe starts on, and what it shows on the landing
const DEFAULT_SPECIES = "chimney_swift";

const US_VIEW: GlobeView = { lat: 39.5, lng: -98.5, altitude: 1.7 };
const STATE_ALTITUDE = 1.1;

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

const NO_DATASETS: DataSet[] = [];

// The most species the globe shows at once (the sidebar's limit)
const MAX_SHOWN_SPECIES = 10;

// The detail panel waits this long after the years stop moving before it refetches
const PANEL_FETCH_DELAY_MS = 250;

// Sightings across all regions in the last year, for the sidebar's species list
function sightings(perRegion: Record<string, number[]> | undefined): number {
  let total = 0;
  for (const perYear of Object.values(perRegion ?? {})) total += perYear[perYear.length - 1] ?? 0;
  return total;
}

// What opening a template sets up: its bird (as a sidebar id: the sidebar numbers species
// 1, 2, 3... in the catalog's order) and its years, kept inside the years the data has.
function templateSetup(template: BirdTemplate, catalog: Species[], years: number[]) {
  const index = catalog.findIndex(s => s.key === template.speciesKey);
  if (index === -1) return null;

  const first = years[0];
  const last = years[years.length - 1];
  const start = Math.max(template.startYear, first);
  const end = Math.min(template.endYear, last);

  return { id: index + 1, range: start < end ? { start, end } : { start: first, end: last } };
}

function DashboardContent() {
  // "/" plays the landing over the globe; "/dashboard" is the globe with the sidebar
  const intro = useLocation().pathname === "/";
  const navigate = useNavigate();
  const look = useLook();
  const enter = useCallback(() => navigate("/dashboard"), [navigate]);

  // /dashboard?template=<id> opens on that template (see pages/templates)
  const [searchParams] = useSearchParams();
  const [openedWith] = useState(() => findTemplate(searchParams.get("template")));

  const {
    settings,
    allSpecies,
    selectedSpeciesIds,
    updateSpeciesList,
    addSelectedSpecies,
    removeSelectedSpecies,
  } = useContextSettings();

  // Backend data
  const [regions, setRegions] = useState<Region[]>([]);
  const [catalog, setCatalog] = useState<Species[]>([]);
  const [counts, setCounts] = useState<CountsData | null>(null);
  const [correctedCounts, setCorrectedCounts] = useState<CountsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The timeline's years: stamps show sightings in `end`; the detail panel measures the
  // change from `start` to `end`. Null until the data has loaded, then the full range.
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const changeRange = useCallback((start: number, end: number) => setRange({ start, end }), []);

  // The state clicked on the globe, and the species whose stamp it was
  const [selected, setSelected] = useState<{ speciesKey: string; region: string } | null>(null);
  const [focus, setFocus] = useState<GlobeView>(() => openedWith?.view ?? US_VIEW);

  // The sidebar's analyst. Kept here so an answer on its way survives leaving its page.
  const analyst = useAnalyst();
  const chooseForAnalyst = analyst.choose;

  // The stamps come up when the landing's bird reaches the globe, and go again
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
      setPlaying(false);
      if (counts) setRange({ start: counts.years[0], end: counts.years[counts.years.length - 1] });
    }
  }

  // Regions, species and every species' sightings per year, once (three requests).
  // The sidebar numbers species 1, 2, 3... in the backend's list order.
  useEffect(() => {
    let cancelled = false;

    Promise.all([api.regions(), api.species(), api.counts()])
      .then(([regionsResult, speciesResult, countsResult]) => {
        if (cancelled) return;

        setRegions(regionsResult);
        setCatalog(speciesResult);
        setCounts(countsResult);

        // Opened from a template: its bird and years. Otherwise the default bird, all years.
        const setup = openedWith ? templateSetup(openedWith, speciesResult, countsResult.years) : null;
        setRange(
          setup?.range ?? {
            start: countsResult.years[0],
            end: countsResult.years[countsResult.years.length - 1],
          }
        );

        updateSpeciesList([
          ...speciesResult.map(s => ({ name: s.commonName, sightings: sightings(countsResult.species[s.key]) })),
        ]);
        const defaultIndex = speciesResult.findIndex(s => s.key === DEFAULT_SPECIES);
        void addSelectedSpecies(setup?.id ?? (defaultIndex === -1 ? 0 : defaultIndex) + 1);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [updateSpeciesList, addSelectedSpecies, openedWith]);

  // The corrected counts come when they're first wanted (they're the default)
  const wantCorrected = settings.dataBasis === "corrected";
  useEffect(() => {
    if (!wantCorrected || correctedCounts) return;
    let cancelled = false;

    api.counts(undefined, "corrected")
      .then(result => {
        if (!cancelled) setCorrectedCounts(result);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [wantCorrected, correctedCounts]);

  // What the globe draws: raw sightings, or sightings adjusted for birder effort
  const shownCounts = wantCorrected ? correctedCounts : counts;

  // The globe shows every species selected in the sidebar, each in its sidebar color.
  // Sidebar ids are 1-based positions in the backend catalog.
  const shownSpecies = useMemo(() => {
    const shown: SpeciesSightings[] = [];

    for (const id of selectedSpeciesIds) {
      const species = allSpecies.find(s => s.id === id);
      if (!species) continue;

      const key = catalog[id - 1]?.key;
      const perRegion = key ? shownCounts?.species[key] : undefined;
      if (key && perRegion) shown.push({ key, name: species.name, color: species.color, counts: perRegion });
    }

    return shown;
  }, [selectedSpeciesIds, allSpecies, catalog, shownCounts]);

  const datasets = useMemo(() => {
    const yearIndex = counts && range ? counts.years.indexOf(range.end) : -1;
    return yearIndex === -1 || !range
      ? NO_DATASETS
      : toDatasets(shownSpecies, regions, yearIndex, range.end, settings.dataBasis);
  }, [shownSpecies, counts, regions, range, settings.dataBasis]);

  // The top of the stamps' scale, for the legend
  const legendMax = useMemo(() => maxCount(shownSpecies), [shownSpecies]);
  const heatmapMax = useMemo(() => maxRegionTotal(shownSpecies), [shownSpecies]);

  const loading = catalog.length === 0 && error === null;

  const handlePointClick = useCallback((point: DataPoint) => {
    if (!point.id) return;
    const clicked = parsePointId(point.id);
    setSelected(clicked);
    chooseForAnalyst(clicked.speciesKey, clicked.region); // the analyst asks about the clicked state next
    setFocus({ lat: point.lat, lng: point.lng, altitude: STATE_ALTITUDE });
  }, [chooseForAnalyst]);

  // The sidebar's templates: any number can be on at once. A template is on while its
  // bird is on the globe, however it got there.
  const activeTemplateIds = useMemo(() => {
    const on = new Set<string>();
    for (const template of TEMPLATES) {
      const index = catalog.findIndex(s => s.key === template.speciesKey);
      if (index !== -1 && selectedSpeciesIds.includes(index + 1)) on.add(template.id);
    }
    return on;
  }, [catalog, selectedSpeciesIds]);

  // Turn templates on: their birds join the globe, the timeline covers their years, and
  // the camera turns to the first one's part of the world.
  const showTemplates = useCallback(
    (wanted: BirdTemplate[]) => {
      if (!counts) return;

      const setups = (templates: BirdTemplate[]) =>
        templates.flatMap(template => {
          const setup = templateSetup(template, catalog, counts.years);
          return setup ? [{ template, setup }] : [];
        });

      const added = setups(wanted);
      if (added.length === 0) return;

      for (const { setup } of added) void addSelectedSpecies(setup.id);

      // The years of everything now on: the ones already there and the ones just added
      const windows = [
        ...setups(TEMPLATES.filter(template => activeTemplateIds.has(template.id))),
        ...added,
      ].map(({ setup }) => setup.range);
      setRange({
        start: Math.min(...windows.map(w => w.start)),
        end: Math.max(...windows.map(w => w.end)),
      });
      setPlaying(false);
      setFocus({ ...added[0].template.view }); // a fresh object, so the camera flies even to the same view
    },
    [counts, catalog, activeTemplateIds, addSelectedSpecies]
  );

  const hideTemplates = useCallback(
    (unwanted: BirdTemplate[]) => {
      for (const template of unwanted) {
        const index = catalog.findIndex(s => s.key === template.speciesKey);
        if (index !== -1) removeSelectedSpecies(index + 1);
      }
    },
    [catalog, removeSelectedSpecies]
  );

  const toggleTemplate = useCallback(
    (template: BirdTemplate) =>
      activeTemplateIds.has(template.id) ? hideTemplates([template]) : showTemplates([template]),
    [activeTemplateIds, hideTemplates, showTemplates]
  );

  const toggleAllTemplates = useCallback(
    () => (activeTemplateIds.size === TEMPLATES.length ? hideTemplates(TEMPLATES) : showTemplates(TEMPLATES)),
    [activeTemplateIds, hideTemplates, showTemplates]
  );

  // The detail panel's numbers: the clicked species' change over the timeline's years.
  // Fetched once the years stop moving; the last answer stays up meanwhile.
  const [panelGrab, setPanelGrab] = useState<GrabData | null>(null);
  const panelSpecies = selected?.speciesKey;

  useEffect(() => {
    if (!panelSpecies || !range) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .grabData(panelSpecies, range.start, range.end)
        .then(result => {
          if (!cancelled) setPanelGrab(result);
        })
        .catch(() => {
          // The panel keeps the last numbers it had
        });
    }, PANEL_FETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [panelSpecies, range]);

  // The detail panel, while the clicked species is still selected
  const selectedGrab =
    selected && panelGrab?.species[0]?.key === selected.speciesKey ? panelGrab : undefined;
  const selectedSpeciesId = selected
    ? catalog.findIndex(s => s.key === selected.speciesKey) + 1
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
      // Where the globe's center is. Both glide (see dashboard.module.css), so the globe
      // and anything a backdrop puts behind it slide into place as the sidebar comes in.
      style={
        {
          "--sidebar-w": `${sidebarWidth}px`,
          "--globe-cx": intro ? "50%" : `calc(50% + ${(sidebarWidth + 6) / 2}px)`,
          "--globe-cy": intro ? "50%" : "calc(50% + var(--nav-h) / 2)",
        } as CSSProperties
      }
    >
      <look.Backdrop key={look.id} scene={scene} />

      {/* The globe always fills the screen, so its canvas never resizes; it's shifted
          to sit beside the sidebar instead */}
      <section ref={globeFrame} className={styles.visualization}>
        <GlobeVisualization
          ref={globe}
          datasets={landed ? datasets : NO_DATASETS}
          // The landing always lands on stamps over the textured Earth
          visualizationType={intro ? VisualizationType.STAMPS : settings.dataDisplayType}
          earthType={settings.earthDisplayType}
          onPointClick={handlePointClick}
          // On the landing, the scroll moves the camera instead
          focus={intro ? null : focus}
          transparentBackground
          art={look.art}
          heatmapMax={heatmapMax}
        />
      </section>

      {/* Sidebar | resize handle | the globe's overlays. The sidebar waits off to the
          left on the landing and slides in with the dashboard. */}
      <div
        className={styles.workspace}
        style={{ gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }}
      >
        <div className={styles.sidebarSlot} inert={intro} aria-hidden={intro || undefined}>
          <DashboardSidebar
            templates={
              <TemplatePicker
                templates={TEMPLATES}
                activeIds={activeTemplateIds}
                full={selectedSpeciesIds.length >= MAX_SHOWN_SPECIES}
                onToggle={toggleTemplate}
                onToggleAll={toggleAllTemplates}
              />
            }
            analyst={
              <AnalystPanel
                analyst={analyst}
                catalog={catalog}
                shownKeys={shownSpecies.map(s => s.key)}
                regions={regions}
                start={range?.start}
                end={range?.end}
              />
            }
          />
        </div>

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
          tabIndex={intro ? -1 : 0}
          inert={intro}
        />

        <div className={styles.overlays}>
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

          {!intro && range && shownSpecies.length > 0 && (
            <Legend
              type={settings.dataDisplayType}
              maxCount={legendMax}
              heatmapMax={heatmapMax}
              basis={settings.dataBasis}
              year={range.end}
            />
          )}

          {!intro && counts && range && (
            <Timeline
              years={counts.years}
              start={range.start}
              end={range.end}
              onChange={changeRange}
              playing={playing}
              onPlayingChange={setPlaying}
            />
          )}
        </div>
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
