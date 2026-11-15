import { Link } from "react-router";

import styles from "./not_found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>404</h1>
      <p className={styles.message}>This page has flown the nest.</p>
      <Link to="/" className={styles.home}>
        Back home
      </Link>
    </main>
  );
}
