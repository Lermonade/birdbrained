import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";

import type { Region, Species } from "../../api/client";
import AnswerView from "./AnswerView";
import type { Analyst } from "./useAnalyst";

import styles from "./analyst.module.css";

const MAX_QUESTION_LENGTH = 500; // the backend's limit

const SUGGESTIONS = [
  "Why is this happening?",
  "Is this change real, or just more birders?",
  "Does the weather line up with it?",
];

const DEFAULT_COUNTRY = "United States";

interface AnalystPanelProps {
  analyst: Analyst;
  catalog: Species[];
  /** Keys of the species on the globe, listed first. */
  shownKeys: string[];
  regions: Region[];
  /** The timeline's years, which the analyst looks at. */
  start?: number;
  end?: number;
}

/** The sidebar's Analyst page: ask about one bird in one state or province. */
export default function AnalystPanel({
  analyst,
  catalog,
  shownKeys,
  regions,
  start,
  end,
}: AnalystPanelProps) {
  const { state } = analyst;

  // The bird: the one chosen, else the first one on the globe
  const speciesKey =
    catalog.some(s => s.key === analyst.speciesKey) ? analyst.speciesKey : shownKeys[0] ?? "";
  const species = catalog.find(s => s.key === speciesKey);

  const shown = catalog.filter(s => shownKeys.includes(s.key));
  const others = catalog
    .filter(s => !shownKeys.includes(s.key))
    .sort((a, b) => a.commonName.localeCompare(b.commonName));

  // Countries, each with its states or provinces in alphabetical order
  const byCountry = useMemo(() => {
    const grouped = new Map<string, Region[]>();
    for (const region of regions) {
      const country = region.country ?? "Other";
      grouped.set(country, [...(grouped.get(country) ?? []), region]);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return new Map([...grouped].sort(([a], [b]) => a.localeCompare(b)));
  }, [regions]);

  // The country follows the chosen state; picking a country alone clears the state
  const region = regions.find(r => r.id === analyst.regionId);
  const [pickedCountry, setPickedCountry] = useState(DEFAULT_COUNTRY);
  const country = region ? region.country ?? "Other" : pickedCountry;
  const countryRegions = byCountry.get(country) ?? [];

  const question = analyst.question.trim();
  const loading = state.status === "loading";
  const canAsk = !loading && species !== undefined && region !== undefined && question !== "";

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canAsk || !species || !region) return;

    analyst.ask({
      question,
      speciesKey: species.key,
      speciesName: species.commonName,
      regionId: region.id,
      regionName: region.name,
      start,
      end,
    });
  }

  // Enter asks; Shift+Enter starts a new line
  function handleQuestionKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.analyst}>
      <p className={styles.intro}>
        Ask about one bird in one state or province. The analyst checks the sightings, the
        surveys and the weather before it answers. Click a bird on the globe to fill these in.
      </p>

      <form className={styles.form} onSubmit={submit}>
        <div className="select-field">
          <label htmlFor="analyst-species">Bird</label>
          <select
            id="analyst-species"
            value={speciesKey}
            onChange={e => analyst.setSpeciesKey(e.target.value)}
          >
            {speciesKey === "" && <option value="">Choose a bird</option>}
            {shown.length > 0 && (
              <optgroup label="On the globe">
                {shown.map(s => (
                  <option key={s.key} value={s.key}>
                    {s.commonName}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={shown.length > 0 ? "Other birds" : "All birds"}>
              {others.map(s => (
                <option key={s.key} value={s.key}>
                  {s.commonName}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="select-field">
          <label htmlFor="analyst-country">Country</label>
          <select
            id="analyst-country"
            value={country}
            onChange={e => {
              setPickedCountry(e.target.value);
              analyst.setRegionId("");
            }}
          >
            {[...byCountry.keys()].map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="select-field">
          <label htmlFor="analyst-region">State or province</label>
          <select
            id="analyst-region"
            value={region?.id ?? ""}
            onChange={e => analyst.setRegionId(e.target.value)}
          >
            {!region && <option value="">Choose one</option>}
            {countryRegions.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="select-field">
          <label htmlFor="analyst-question">Question</label>
          <textarea
            id="analyst-question"
            className={styles.question}
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="What would you like to know?"
            value={analyst.question}
            onChange={e => analyst.setQuestion(e.target.value)}
            onKeyDown={handleQuestionKey}
          />
        </div>

        <div className={styles.suggestions} aria-label="Example questions">
          {SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestion}
              onClick={() => analyst.setQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <button type="submit" className={styles.askButton} disabled={!canAsk}>
          {loading ? "Asking..." : "Ask"}
        </button>

        {start !== undefined && end !== undefined && (
          <p className={styles.hint}>
            Looks at {start} to {end}, the years on the timeline.
          </p>
        )}
      </form>

      {state.status !== "idle" && (
        <div className={styles.result} aria-live="polite">
          <div className={styles.asked}>
            <p>
              <strong>
                {state.asked.speciesName} in {state.asked.regionName}
              </strong>
              {state.asked.start !== undefined &&
                state.asked.end !== undefined &&
                `, ${state.asked.start} to ${state.asked.end}`}
            </p>
            <p className={styles.askedQuestion}>"{state.asked.question}"</p>
          </div>

          {state.status === "loading" && (
            <p className={styles.loading} role="status">
              The analyst is checking the data. This takes about 15 to 20 seconds.
            </p>
          )}

          {state.status === "error" && (
            <div className={styles.error} role="alert">
              <p>{state.message}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => analyst.ask(state.asked)}
              >
                Try again
              </button>
            </div>
          )}

          {state.status === "done" && <AnswerView result={state.result} full />}
        </div>
      )}
    </div>
  );
}
