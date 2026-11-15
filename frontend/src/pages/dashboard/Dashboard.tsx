import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import GlobeVisualization, {
  type DataPoint,
  type DataSet,
  type GlobeHandle,
  type GlobeView,
  VisualizationType,
  EarthType,
} from "../../components/globe_visualization/GlobeVisualization";

import DetailPanel from "../../components/detail_panel/DetailPanel";
import Landing from "../../components/landing/Landing";
import Starfield from "../../components/landing/Starfield";
import type { Scene } from "../../components/landing/timeline";
import { api, API_BASE } from "../../api/client";
import type { GrabData, Region } from "../../api/client";
import { DOWN_COLOR, UP_COLOR, toDatasets, type Mode } from "./globeData";

import styles from "./dashboard.module.css";

// Fixed for now; the sidebar will let people pick these
const SPECIES = "chimney_swift";
const MODE: Mode = "corrected";

const US_VIEW: GlobeView = { lat: 39.5, lng: -98.5, altitude: 1.7 };
const STATE_ALTITUDE = 1.1;

const NO_DATASETS: DataSet[] = [];

export default function Dashboard() {
  // "/" plays the landing over the globe; "/dashboard" is the globe on its own
  const intro = useLocation().pathname === "/";
  const navigate = useNavigate();
  const enter = useCallback(() => navigate("/dashboard"), [navigate]);

  // Backend data
  const [regions, setRegions] = useState<Region[]>([]);
  const [grab, setGrab] = useState<GrabData | null>(null);
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

  // States and the globe data, once
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.regions(), api.grabData(SPECIES)])
      .then(([regionsResult, grabResult]) => {
        if (cancelled) return;
        setRegions(regionsResult);
        setGrab(grabResult);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = grab === null && error === null;
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

  return (
    <main className={`${styles.dashboard} ${intro ? styles.intro : ""}`}>
      <Starfield scene={scene} />

      <section ref={globeFrame} className={styles.visualization}>
        <GlobeVisualization
          ref={globe}
          datasets={landed ? datasets : NO_DATASETS}
          visualizationType={VisualizationType.PILLARS}
          earthType={EarthType.TEXTURED}
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

        {!intro && selectedRegion && start !== null && end !== null && (
          <DetailPanel
            key={`${SPECIES}|${selectedRegion}|${start}|${end}`}
            speciesKey={SPECIES}
            speciesName={shownSpecies?.name ?? SPECIES}
            regionId={selectedRegion}
            regionName={selectedRegionName}
            point={selectedPoint}
            start={start}
            end={end}
            onClose={() => setSelectedRegion(null)}
          />
        )}
      </section>

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
