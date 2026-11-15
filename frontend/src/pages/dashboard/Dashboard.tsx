import { useEffect, useRef, useState } from "react";

import GlobeVisualization, {
  type DataSet,
  VisualizationType,
  EarthType,
} from "../../components/globe_visualization/GlobeVisualization";

import DashboardSidebar from "../../components/sidebar/Sidebar";

import styles from "./dashboard.module.css";

const datasets: DataSet[] = [
  {
    name: "Robin",
    color: "#be2e2e",
    dataPoints: [
      { lat: 40.7128, lng: -74.0060, height: 0.15, population: 100 },
      { lat: 51.5072, lng: -0.1276, height: 0.25, population: 500 },
      { lat: 35.6762, lng: 139.6503, height: 0.35, population: 250 },
    ],
  },
  {
    name: "Kingfisher",
    color: "#E5A84B",
    dataPoints: [
      { lat: -33.8688, lng: 151.2093, height: 0.30, population: 800 },
      { lat: 37.7749, lng: -122.4194, height: 0.18, population: 150 },
      { lat: 28.6139, lng: 77.2090, height: 0.22, population: 350 },
    ],
  },
  {
    name: "Bluebird",
    color: "#729BD1",
    dataPoints: [
      { lat: 55.7558, lng: 37.6173, height: 0.28, population: 400 },
      { lat: 48.8566, lng: 2.3522, height: 0.20, population: 200 },
    ],
  },
];

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 320;

export default function Dashboard() {
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
          visualizationType={VisualizationType.PILLARS}
          earthType={EarthType.TEXTURED}
        />
      </section>
    </main>
  );
}
