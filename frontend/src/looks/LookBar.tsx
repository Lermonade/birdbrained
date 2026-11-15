import type { CSSProperties } from "react";

import { LOOKS, setLook, useLook } from "./index";

import styles from "./look_bar.module.css";

// Switches the globe scene between its looks: one colored sphere per look
export default function LookBar() {
  const look = useLook();

  return (
    <div className={styles.bar} role="toolbar" aria-label="Look">
      {LOOKS.map(option => (
        <button
          key={option.id}
          className={styles.option}
          aria-pressed={option.id === look.id}
          aria-label={option.name}
          title={option.name}
          onClick={() => setLook(option.id)}
        >
          <span
            className={styles.sphere}
            style={{ "--a": option.swatch[0], "--b": option.swatch[1] } as CSSProperties}
          />
        </button>
      ))}
    </div>
  );
}
