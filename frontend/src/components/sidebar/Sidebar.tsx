import { useState } from "react";
import {
  Filter,
  SlidersHorizontal,
  Database,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

import styles from "./sidebar.module.css";

type SidebarPage = "menu" | "filters" | "visualization" | "data";

export default function Sidebar() {
  const [activePage, setActivePage] = useState<SidebarPage>("menu");

  function goBack() {
    setActivePage("menu");
  }

  const panelClass = [
    styles.panels,
    activePage === "filters" ? styles.showFilters : "",
    activePage === "visualization" ? styles.showVisualization : "",
    activePage === "data" ? styles.showData : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={styles.sidebar}>
      <div className={panelClass}>
        {/* Main menu */}
        <div className={styles.panel}>
          <h2 className={styles.heading}>Options</h2>

          <button
            className={styles.menuItem}
            onClick={() => setActivePage("filters")}
          >
            <span className={styles.menuLabel}>
              <Filter size={19} />
              Filters
            </span>
            <ChevronRight size={18} className={styles.arrow} />
          </button>

          <button
            className={styles.menuItem}
            onClick={() => setActivePage("visualization")}
          >
            <span className={styles.menuLabel}>
              <SlidersHorizontal size={19} />
              Visualization
            </span>
            <ChevronRight size={18} className={styles.arrow} />
          </button>

          <button
            className={styles.menuItem}
            onClick={() => setActivePage("data")}
          >
            <span className={styles.menuLabel}>
              <Database size={19} />
              Data Settings
            </span>
            <ChevronRight size={18} className={styles.arrow} />
          </button>
        </div>

        {/* Filters page */}
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={goBack}>
            <ArrowLeft size={18} />
            Back
          </button>

          <h2 className={styles.heading}>Filters</h2>

          {/* Filter controls go here */}
        </div>

        {/* Visualization page */}
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={goBack}>
            <ArrowLeft size={18} />
            Back
          </button>

          <h2 className={styles.heading}>Visualization</h2>

          {/* Visualization controls go here */}
        </div>

        {/* Data settings page */}
        <div className={styles.panel}>
          <button className={styles.backButton} onClick={goBack}>
            <ArrowLeft size={18} />
            Back
          </button>

          <h2 className={styles.heading}>Data Settings</h2>

          {/* Database selection and data upload controls go here */}
        </div>
      </div>
    </aside>
  );
}
