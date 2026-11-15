import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import type { Basis } from "../../api/client";
import { MAX_SELECTED_SPECIES, useContextSettings } from "../../context/Context";
import { EarthType, VisualizationType } from "../globe_visualization/GlobeVisualization";

import Segmented from "./Segmented";
import SpeciesAlbum from "./SpeciesAlbum";

import styles from "./sidebar.module.css";

interface SidebarProps {
  /** Shown under the birds. Supplies its own heading. */
  templates?: ReactNode;
  /** The Analyst section's contents. */
  analyst?: ReactNode;
}

// One scroll: Birds, Templates, Display, Analyst. Each heading sticks to the top while
// its section scrolls by, and a row of perforations tears one section from the next.
export default function Sidebar({ templates, analyst }: SidebarProps) {
  const {
    settings,
    setDataDisplayType,
    setDataBasis,
    setEarthDisplayType,
    selectedSpecies,
  } = useContextSettings();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.scroll}>
        <section aria-labelledby="sidebar-birds">
          <header className={styles.header}>
            <h2 id="sidebar-birds" className={styles.title}>
              Birds
            </h2>
            <span className={styles.count}>
              {selectedSpecies.length} / {MAX_SELECTED_SPECIES}
            </span>
          </header>

          <SpeciesAlbum />
        </section>

        {templates && (
          <>
            <hr className={styles.tear} />
            {templates}
          </>
        )}

        <hr className={styles.tear} />

        <section aria-labelledby="sidebar-display">
          <header className={styles.header}>
            <h2 id="sidebar-display" className={styles.title}>
              Display
            </h2>
          </header>

          <div className={styles.settings}>
            <Segmented<VisualizationType>
              legend="Marks"
              value={settings.dataDisplayType}
              onChange={setDataDisplayType}
              options={[
                { value: VisualizationType.STAMPS, label: "Stamps" },
                { value: VisualizationType.HEATMAP, label: "Heatmap" },
              ]}
            />

            <Segmented<Basis>
              legend="Sightings"
              value={settings.dataBasis}
              onChange={setDataBasis}
              options={[
                { value: "corrected", label: "Corrected", title: "Corrected for birder effort" },
                { value: "raw", label: "Raw" },
              ]}
            />

            <Segmented<EarthType>
              legend="Earth"
              value={settings.earthDisplayType}
              onChange={setEarthDisplayType}
              options={[
                { value: EarthType.TEXTURED, label: "Textured" },
                { value: EarthType.PLAIN, label: "Plain" },
                { value: EarthType.WIREFRAME, label: "Wireframe" },
              ]}
            />
          </div>
        </section>

        {analyst && (
          <>
            <hr className={styles.tear} />

            <section aria-labelledby="sidebar-analyst">
              <header className={styles.header}>
                <h2 id="sidebar-analyst" className={styles.title}>
                  <Sparkles size={18} aria-hidden="true" />
                  Analyst
                </h2>
              </header>

              {analyst}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
