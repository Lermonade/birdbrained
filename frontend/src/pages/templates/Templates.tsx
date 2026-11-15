import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router";
import { ArrowRight, MapPin } from "lucide-react";

import { useLook } from "../../looks";
import { TEMPLATES } from "./templateData";

import styles from "./templates.module.css";

// How far along the landing's scroll each look's backdrop sits behind this page: 0 is
// the title (the park's sunset), 1 the dashboard (its dark upper sky). The park poster
// shows more of its scene a little way in; the block print's moon settles near 1.
const SCENE_PROGRESS: Record<string, number> = {
  "park-poster": 0.4,
  "block-print": 0.9,
};

// Where the block print's moon sits (it centers on the globe on the dashboard)
const MOON_AT = { "--globe-cx": "78%", "--globe-cy": "30%" } as CSSProperties;

export default function Templates() {
  const look = useLook();
  const scene = useMemo(
    () => ({ current: { progress: SCENE_PROGRESS[look.id] ?? 1 } }),
    [look.id]
  );

  return (
    <main className={styles.page}>
      {/* The same scene the globe sits in front of on the dashboard */}
      <div className={styles.scene} style={MOON_AT} aria-hidden="true">
        <look.Backdrop key={look.id} scene={scene} />
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>Bird Templates</h1>
        <p className={styles.subtitle}>Try these templates out!</p>
      </header>

      <section className={styles.templateGrid} aria-label="Bird templates">
        {TEMPLATES.map((template) => (
          <article className={styles.templateCard} key={template.id}>
            <Link
              className={styles.cardLink}
              to={`/dashboard?template=${template.id}`}
              aria-label={`Open the ${template.species} on the globe`}
            >
              <div className={styles.photo}>
                <img
                  className={styles.image}
                  src={template.imageUrl}
                  alt={template.imageAlt}
                />
              </div>

              <div className={styles.cardInfo}>
                <p className={styles.region}>
                  <MapPin size={13} aria-hidden="true" />
                  {template.region}
                </p>
                <h2 className={styles.species}>{template.species}</h2>
                <p className={styles.years}>
                  {template.startYear} → {template.endYear}
                </p>
              </div>

              <span className={styles.go} aria-hidden="true">
                <ArrowRight size={18} />
              </span>
            </Link>

            {/* Outside the link: the card is one link, and links can't nest */}
            <p className={styles.credit}>
              Photo:{" "}
              <a href={template.creditUrl} target="_blank" rel="noreferrer">
                {template.credit}
              </a>
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
