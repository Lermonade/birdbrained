import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Bird, Palette, Plus, Search, X } from "lucide-react";

import {
  MAX_SELECTED_SPECIES,
  useContextSettings,
  type BirdSpecies,
} from "../../context/Context";

import styles from "./album.module.css";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

// How long a stamp takes to peel off before the bird leaves the globe
const PEEL_MS = 180;

// Each stamp sits a little crooked, the same way every time
function tilt(id: number): string {
  return `${(((id * 37) % 5) - 2) * 0.6}deg`;
}

/** The birds on the globe as a sheet of stamps, with the search that adds more. */
export default function SpeciesAlbum() {
  const {
    allSpecies,
    selectedSpecies,
    addSelectedSpecies,
    removeSelectedSpecies,
    updateSpeciesColor,
  } = useContextSettings();

  const [query, setQuery] = useState("");
  const [peeling, setPeeling] = useState<ReadonlySet<number>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(timer => window.clearTimeout(timer));
  }, []);

  const full = selectedSpecies.length >= MAX_SELECTED_SPECIES;
  const needle = query.trim().toLowerCase();
  const searching = needle !== "";

  // Matching birds that aren't on the globe yet
  const matches = searching
    ? allSpecies.filter(
        species =>
          species.name.toLowerCase().includes(needle) &&
          !selectedSpecies.some(selected => selected.id === species.id)
      )
    : [];

  function add(species: BirdSpecies) {
    void addSelectedSpecies(species.id);
    setQuery("");
  }

  // Enter adds the first match; Escape clears the search
  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !full && matches[0]) {
      e.preventDefault();
      add(matches[0]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  function peel(id: number) {
    if (peeling.has(id)) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      removeSelectedSpecies(id);
      return;
    }

    setPeeling(current => new Set(current).add(id));

    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      removeSelectedSpecies(id);
      setPeeling(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, PEEL_MS);
    timers.current.add(timer);
  }

  return (
    <div className={styles.album}>
      <div className={styles.search}>
        <Search size={16} aria-hidden="true" />

        <input
          ref={searchRef}
          type="text"
          aria-label="Search species"
          placeholder={`Search ${allSpecies.length.toLocaleString()} species…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearchKey}
        />

        {searching && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {searching ? (
        <div className={styles.results}>
          {full ? (
            <p className={styles.empty}>
              Up to {MAX_SELECTED_SPECIES} species can be shown at once. Remove one to add another.
            </p>
          ) : matches.length > 0 ? (
            matches.map(species => (
              <button
                key={species.id}
                type="button"
                className={styles.result}
                onClick={() => add(species)}
              >
                <span className={styles.chip} style={{ backgroundColor: species.color }} />

                <span className={styles.resultText}>
                  <span className={styles.resultName}>{species.name}</span>
                  <span className={styles.resultSub}>
                    {species.sightings.toLocaleString()} sightings
                  </span>
                </span>

                <Plus size={16} className={styles.plus} aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className={styles.empty}>No matching species found.</p>
          )}
        </div>
      ) : (
        <ul className={styles.grid} aria-label="Birds on the globe">
          {selectedSpecies.map(species => (
            <li
              key={species.id}
              className={`${styles.stamp} ${peeling.has(species.id) ? styles.peeling : ""}`}
              style={{ "--c": species.color, "--tilt": tilt(species.id) } as CSSProperties}
            >
              <div className={styles.paper}>
                <div className={styles.face}>
                  <Bird className={styles.glyph} size={32} strokeWidth={1.75} aria-hidden="true" />
                  <span className={styles.value}>{compact.format(species.sightings)}</span>
                  <Palette className={styles.hint} size={14} aria-hidden="true" />

                  {/* Covers the face: clicking the stamp opens the color picker */}
                  <input
                    type="color"
                    className={styles.picker}
                    value={species.color}
                    onChange={e => updateSpeciesColor(species.id, e.target.value)}
                    aria-label={`Color for ${species.name}`}
                    title={`${species.name}: ${species.sightings.toLocaleString()} sightings. Click to recolor.`}
                  />
                </div>

                <span className={styles.name} title={species.name}>
                  {species.name}
                </span>
              </div>

              <button
                type="button"
                className={styles.peel}
                onClick={() => peel(species.id)}
                aria-label={`Remove ${species.name}`}
                title="Remove"
              >
                <X size={13} strokeWidth={3} />
              </button>
            </li>
          ))}

          {!full && (
            <li className={styles.slotItem}>
              <button
                type="button"
                className={styles.slot}
                onClick={() => searchRef.current?.focus()}
              >
                <Plus size={20} aria-hidden="true" />
                Add a bird
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
