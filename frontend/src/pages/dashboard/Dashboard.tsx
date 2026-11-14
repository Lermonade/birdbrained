import GlobeVisualization, {
  type DataSet,
  VisualizationType,
  EarthType,
} from "../../components/globe_visualization/GlobeVisualization";

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

export default function Dashboard() {
  return (
    <main className={styles.dashboard}>
      <GlobeVisualization
        datasets={datasets}
        visualizationType={VisualizationType.PILLARS}
        earthType={EarthType.TEXTURED}
      />
    </main>
  );
}
