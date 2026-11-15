import styles from "./templates.module.css";

type BirdTemplate = {
  id: number;
  species: string;
  startYear: number;
  endYear: number;
  imageUrl: string;
  imageAlt: string;
};

const templates: BirdTemplate[] = [
  {
    id: 1,
    species: "Species name",
    startYear: 1999,
    endYear: 2026,
    imageUrl:
      "https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=900&auto=format&fit=crop",
    imageAlt: "Colorful bird perched on a branch",
  },
  {
    id: 2,
    species: "Species name",
    startYear: 2003,
    endYear: 2025,
    imageUrl:
      "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=900&auto=format&fit=crop",
    imageAlt: "Bird in a natural outdoor setting",
  },
  {
    id: 3,
    species: "Species name",
    startYear: 2004,
    endYear: 2007,
    imageUrl:
      "https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=900&auto=format&fit=crop",
    imageAlt: "Bird in flight",
  },
];

export default function Templates() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bird Templates</h1>
        <p className={styles.subtitle}>Try these templates out!</p>
      </header>

      <section className={styles.templateGrid} aria-label="Bird templates">
        {templates.map((template) => (
          <article className={styles.templateCard} key={template.id}>
            <img
              className={styles.image}
              src={template.imageUrl}
              alt={template.imageAlt}
            />
            <div className={styles.cardInfo}>
              <h2 className={styles.species}>{template.species}</h2>
              <p className={styles.years}>
                from {template.startYear} to {template.endYear}
              </p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
