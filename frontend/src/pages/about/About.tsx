import styles from "./about.module.css";

export default function About() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>About</h1>
        <p className={styles.lead}>
          Where America's birds are gaining ground, and where they're losing it.
        </p>

        <section className={styles.card}>
          <h2>What it shows</h2>
          <p>
            BirdBrained puts bird sightings on a globe. Pick a species and the globe raises a
            pillar over every state or province, tall where sightings are climbing and short
            where they're falling.
          </p>
        </section>

        <section className={styles.card}>
          <h2>How to use it</h2>
          <p>
            Open the dashboard, search for species in the sidebar and click a pillar to see how
            that place has changed over the years.
          </p>
        </section>
      </div>
    </main>
  );
}
