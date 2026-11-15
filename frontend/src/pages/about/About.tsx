
import { useMemo, type CSSProperties } from "react";

import { useLook } from "../../looks";
import styles from "./about.module.css";
import image from "../../assets/population_decline.png";

const SCENE_PROGRESS: Record<string, number> = {
  "park-poster": 0.4,
  "block-print": 0.9,
};
const MOON_AT = { "--globe-cx": "78%", "--globe-cy": "30%" } as CSSProperties;

export default function About() {
  const look = useLook();
  const scene = useMemo(
    () => ({ current: { progress: SCENE_PROGRESS[look.id] ?? 1 } }),
    [look.id]
  );

  return (
    <main className={styles.page}>
      <div className={styles.scene} style={MOON_AT} aria-hidden="true">
        <look.Backdrop key={look.id} scene={scene} />
      </div>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>About</h1>
          <p className={styles.lead}>
            Where America's birds are gaining ground, and where they're losing it.
          </p>
        </header>

        <div className={styles.cards}>
          <section className={styles.card}>
            <h2>What it shows</h2>
            <p>
              BirdBrained puts bird sightings on a globe. View international bird population data, visualize, and explore it. 
            </p>
          </section>

          <section className={styles.card}>
            <h2>How to use it</h2>
            <p>
              Open the dashboard and search for species' in the sidebar. Apply filters and constraints, and drag the timeline to watch the populations change.
              Click on a data pillar to see information about the net change, and ask the analysis AI to explain the shifts you see.
            </p>
          </section>
        </div>

        <figure className={styles.imageWrapper}>
          <img
            className={styles.image}
            src={image}
            alt="Wild birds in their natural habitat"
          />
        </figure>

        <section className={styles.card}>
            <h2>Why birds?</h2>
            <p>
              1 in 8 bird species is currently considered endangered, and this problem is only getting worse. There's a lack of comprehensive, intiuitive tools online to help visualize and understand these changes. This app aims to help solve that.
            </p>
          </section>
      </div>
    </main>
  );
}
