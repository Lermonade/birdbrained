
import { useEffect, useMemo, useRef, useState } from "react";

import GlobeVisualization, {
  type DataSet,
} from "../../components/globe_visualization/GlobeVisualization";

import DashboardSidebar from "../../components/sidebar/Sidebar";

import {
  ContextProvider,
  useContextSettings,
} from "../../context/Context";

import styles from "./dashboard.module.css";

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

// --------------------------------------------------
// Dashboard content
// --------------------------------------------------

function DashboardContent() {
  const {
    settings,
    selectedSpecies,
    speciesData,
    updateSpeciesList,
  } = useContextSettings();

  // ------------------------------------------------
  // Initialize species catalogue
  // ------------------------------------------------

  useEffect(() => {
    updateSpeciesList([
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
    ]);
  }, [updateSpeciesList]);

  // ------------------------------------------------
  // Build visualization datasets
  // ------------------------------------------------

  const datasets: DataSet[] = useMemo(
    () =>
      selectedSpecies.flatMap(species => {
        const data = speciesData.find(
          item => item.speciesId === species.id
        );

        // Don't render species until geographic data loads.
        if (!data) return [];

        return [{
          name: species.name,
          color: species.color,
          dataPoints: data.dataPoints,
        }];
      }),
    [selectedSpecies, speciesData]
  );

  // ------------------------------------------------
  // Sidebar resizing
  // ------------------------------------------------

  const [sidebarWidth, setSidebarWidth] = useState(
    DEFAULT_SIDEBAR_WIDTH
  );

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

      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(
          MIN_SIDEBAR_WIDTH,
          dragStartWidth.current + delta
        )
      );

      setSidebarWidth(newWidth);
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
  // Render
  // ------------------------------------------------

  return (
    <main
      className={`${styles.dashboard} ${
        isDragging ? styles.dragging : ""
      }`}
      style={{
        gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)`,
      }}
    >
      <DashboardSidebar />

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

      <section className={styles.visualization}>
        <GlobeVisualization
          datasets={datasets}
          visualizationType={settings.dataDisplayType}
          earthType={settings.earthDisplayType}
        />
      </section>
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
