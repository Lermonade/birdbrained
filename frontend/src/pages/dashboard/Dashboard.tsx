import { useEffect, useRef } from "react";
import Globe from "globe.gl";
import styles from "./dashboard.module.css";

// Each object represents one pillar
interface DataPoint {
  lat: number;
  lng: number;
  height: number;
}

const dataPoints: DataPoint[] = [
  { lat: 40.7128, lng: -74.0060, height: 0.15 },
  { lat: 51.5072, lng: -0.1276, height: 0.25 },
  { lat: 35.6762, lng: 139.6503, height: 0.35 },
  { lat: 48.8566, lng: 2.3522, height: 0.20 },
  { lat: -33.8688, lng: 151.2093, height: 0.30 },
  { lat: 37.7749, lng: -122.4194, height: 0.18 },
  { lat: 55.7558, lng: 37.6173, height: 0.28 },
  { lat: 28.6139, lng: 77.2090, height: 0.22 },
];

export default function Dashboard() {
  const globeContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = globeContainer.current;
    if (!container) return;

    const globe = new Globe(container)
      .globeImageUrl(
        "https://unpkg.com/three-globe/example/img/earth-night.jpg"
      )
      .backgroundColor("#000011")

      // Pillar positioning
      .pointsData(dataPoints)
      .pointLat("lat")
      .pointLng("lng")
      .pointAltitude("height")

      // Pillar appearance
      .pointRadius(0.35)
      .pointColor(() => "#64866A")
      .pointResolution(8)

      // Interaction
      .pointLabel((d: object) => {
        const point = d as DataPoint;

        return `
          <div style="color: white; padding: 5px;">
            <strong>${point.lat}, ${point.lng}</strong>
            <br />
            Height: ${point.height}
          </div>
        `;
      });

    // Camera
    globe.pointOfView(
      { lat: 20, lng: 0, altitude: 2.3 },
      0
    );

    // Rotation
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.35;

    // Responsive sizing
    const resizeObserver = new ResizeObserver(() => {
      globe
        .width(container.clientWidth)
        .height(container.clientHeight);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      globe._destructor();
    };
  }, []);

  return (
    <main className={styles.dashboard}>
      <div
        ref={globeContainer}
        className={styles.globe}
      />
    </main>
  );
}
