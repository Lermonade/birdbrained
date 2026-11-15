
import { useState, type ReactNode } from "react";

import {
  SlidersHorizontal,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Bird,
  Search,
  Trash2,
  Palette,
} from "lucide-react";

import styles from "./sidebar.module.css";

import type { Basis } from "../../api/client";

import {
  useContextSettings,
} from "../../context/Context";

import {
  VisualizationType,
  EarthType,
} from "../globe_visualization/GlobeVisualization";

type SidebarPage =
  | "menu"
  | "visualization"
  | "analyst"
  | "species";

interface SidebarProps {
  /** Shown on the menu page, below the species list. */
  templates?: ReactNode;
  /** The Analyst page's contents. */
  analyst?: ReactNode;
}

export default function Sidebar({ templates, analyst }: SidebarProps) {
  const [activePage, setActivePage] =
    useState<SidebarPage>("menu");

  const {
    settings,
    setDataDisplayType,
    setDataBasis,
    setEarthDisplayType,
    allSpecies,
    selectedSpecies,
    addSelectedSpecies,
    removeSelectedSpecies,
    updateSpeciesColor,
  } = useContextSettings();

  const [searchQuery, setSearchQuery] = useState("");

  const [activeSpeciesId, setActiveSpeciesId] =
    useState<number | null>(null);

  const [navigationDirection, setNavigationDirection] =
    useState<"forward" | "back">("forward");

  const activeSpecies = selectedSpecies.find(
    species => species.id === activeSpeciesId
  );

  function navigateTo(page: SidebarPage) {
    setNavigationDirection("forward");
    setActivePage(page);
  }

  function goBack() {
    setNavigationDirection("back");

    if (activePage === "species") {
      setActiveSpeciesId(null);
    }

    setActivePage("menu");
  }

  // Filter species by name and exclude already selected birds.
  const matchingSpecies = allSpecies.filter(species => {
    const matchesSearch = species.name
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());

    const alreadySelected = selectedSpecies.some(
      selected => selected.id === species.id
    );

    return matchesSearch && !alreadySelected;
  });

  async function handleSpeciesSelect(
    species: (typeof allSpecies)[number]
    ) {
    await addSelectedSpecies(species.id);
    setSearchQuery("");
    }

  function handleSpeciesDelete() {
    if (!activeSpecies) return;

    removeSelectedSpecies(activeSpecies.id);
    setActiveSpeciesId(null);
    setNavigationDirection("back");
    setActivePage("menu");
  }

  return (
    <aside className={styles.sidebar}>
      <div
        className={`${styles.content} ${
          navigationDirection === "forward"
            ? styles.contentForward
            : styles.contentBack
        }`}
        key={activePage}
      >

        {/* MAIN MENU */}
        {activePage === "menu" && (
          <div className={styles.page}>
            <h2 className={styles.heading}>Options</h2>

            <button
              className={styles.menuItem}
              onClick={() => navigateTo("visualization")}
            >
              <span className={styles.menuLabel}>
                <SlidersHorizontal size={19} />
                Visualization
              </span>

              <ChevronRight
                size={18}
                className={styles.arrow}
              />
            </button>

            <button
              className={styles.menuItem}
              onClick={() => navigateTo("analyst")}
            >
              <span className={styles.menuLabel}>
                <Sparkles size={19} />
                Analyst
              </span>

              <ChevronRight
                size={18}
                className={styles.arrow}
              />
            </button>

            {/* SPECIES SELECTOR */}
            <section className={styles.speciesSection}>

              <div className={styles.speciesHeader}>
                <h2 className={styles.heading}>
                  Species
                </h2>

                <span className={styles.speciesCount}>
                  {selectedSpecies.length} shown
                </span>
              </div>

              {/* SEARCH BAR */}
              <div className={styles.speciesSearch}>
                <Search size={17} />

                <input
                  type="text"
                  placeholder={`Search ${allSpecies.length.toLocaleString()} species...`}
                  value={searchQuery}
                  onChange={e =>
                    setSearchQuery(e.target.value)
                  }
                />
              </div>

              {/* SEARCH RESULTS */}
              {searchQuery.trim() !== "" && (
                <div className={styles.speciesResults}>

                  {selectedSpecies.length >= 10 ? (
                    <p className={styles.speciesEmpty}>
                      Up to 10 species can be shown at once. Remove one to add another.
                    </p>
                  ) : matchingSpecies.length > 0 ? (

                    matchingSpecies.map(species => (
                      <button
                        key={species.id}
                        className={styles.speciesResult}
                        onClick={() =>
                          handleSpeciesSelect(species)
                        }
                      >
                        <div
                          className={styles.speciesIcon}
                          style={{
                            backgroundColor: species.color,
                          }}
                        >
                          <Bird
                            size={21}
                            color="#ffffff"
                          />
                        </div>

                        <div className={styles.speciesInfo}>
                          <span className={styles.speciesName}>
                            {species.name}
                          </span>

                          <span className={styles.speciesSubtitle}>
                            {species.sightings.toLocaleString()} total sightings
                          </span>
                        </div>
                      </button>
                    ))

                  ) : (
                    <p className={styles.speciesEmpty}>
                      No matching species found.
                    </p>
                  )}

                </div>
              )}

              {/* SELECTED SPECIES */}
              {searchQuery.trim() === "" && (
                <div className={styles.speciesList}>
                  {selectedSpecies.map(species => (
                    <button
                      className={styles.speciesItem}
                      key={species.id}
                      onClick={() => {
                        setActiveSpeciesId(species.id);
                        navigateTo("species");
                      }}
                    >
                      <div
                        className={styles.speciesIcon}
                        style={{
                          backgroundColor: species.color,
                        }}
                      >
                        <Bird
                          size={23}
                          color="#ffffff"
                        />
                      </div>

                      <div className={styles.speciesInfo}>
                        <span className={styles.speciesName}>
                          {species.name}
                        </span>

                        <span className={styles.speciesSubtitle}>
                          {species.sightings.toLocaleString()} total sightings
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

            </section>

            {/* TEMPLATES */}
            {templates}
          </div>
        )}

        {/* VISUALIZATION */}
        {activePage === "visualization" && (
          <div className={styles.page}>
            <button
              className={styles.backButton}
              onClick={goBack}
            >
              <ArrowLeft size={18} />
              Back
            </button>

            <h2 className={styles.heading}>
              Visualization
            </h2>

            <div className={styles.settingsGroup}>
              <div className="select-field">
                <label htmlFor="data-display">
                  Data Display Type
                </label>

                <select
                  id="data-display"
                  value={settings.dataDisplayType}
                  onChange={e =>
                    setDataDisplayType(
                      e.target.value as VisualizationType
                    )
                  }
                >
                  <option value="stamps">
                    Stamps
                  </option>

                  <option value="heatmap">
                    Heatmap
                  </option>
                </select>
              </div>

              <div className="select-field">
                <label htmlFor="data-basis">
                  Sightings
                </label>

                <select
                  id="data-basis"
                  value={settings.dataBasis}
                  onChange={e =>
                    setDataBasis(e.target.value as Basis)
                  }
                >
                  <option value="corrected">
                    Corrected for birder effort
                  </option>

                  <option value="raw">
                    Raw
                  </option>
                </select>
              </div>

              <div className="select-field">
                <label htmlFor="earth-display">
                  Earth Display Type
                </label>

                <select
                  id="earth-display"
                  value={settings.earthDisplayType}
                  onChange={e =>
                    setEarthDisplayType(
                      e.target.value as EarthType
                    )
                  }
                >
                  <option value="textured">
                    Textured
                  </option>

                  <option value="plain">
                    Plain
                  </option>

                  <option value="wireframe">
                    Wireframe
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ANALYST */}
        {activePage === "analyst" && (
          <div className={styles.page}>
            <button
              className={styles.backButton}
              onClick={goBack}
            >
              <ArrowLeft size={18} />
              Back
            </button>

            <h2 className={styles.heading}>
              Analyst
            </h2>

            {analyst}
          </div>
        )}

        {/* SPECIES SETTINGS */}
        {activePage === "species" && activeSpecies && (
          <div className={styles.page}>
            <button
              className={styles.backButton}
              onClick={goBack}
            >
              <ArrowLeft size={18} />
              Back
            </button>

            {/* SPECIES HEADER */}
            <div className={styles.speciesDetailHeader}>
              <div
                className={styles.speciesDetailIcon}
                style={{
                  backgroundColor: activeSpecies.color,
                }}
              >
                <Bird size={32} color="#ffffff" />
              </div>

              <div className={styles.speciesInfo}>
                <h2 className={styles.speciesDetailName}>
                  {activeSpecies.name}
                </h2>

                <span className={styles.speciesSubtitle}>
                  {activeSpecies.sightings.toLocaleString()} total sightings
                </span>
              </div>
            </div>

            {/* COLOR SETTINGS */}
            <div className={styles.speciesSetting}>
              <div className={styles.settingHeading}>
                <Palette size={18} />
                <span>Visualization Color</span>
              </div>

              <div className={styles.colorPickerRow}>
                <input
                  type="color"
                  value={activeSpecies.color}
                  onChange={e =>
                    updateSpeciesColor(
                      activeSpecies.id,
                      e.target.value
                    )
                  }
                  className={styles.colorPicker}
                  aria-label="Choose species visualization color"
                />

                <span className={styles.colorValue}>
                  {activeSpecies.color.toUpperCase()}
                </span>
              </div>
            </div>

            {/* DELETE SPECIES */}
            <div className={styles.speciesDeleteSection}>
              <button
                className={styles.deleteSpeciesButton}
                onClick={handleSpeciesDelete}
              >
                <Trash2 size={17} />
                Remove Species
              </button>
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}