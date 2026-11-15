import { useCallback, useRef, useState } from "react";

import { api, type AskResponse } from "../../api/client";
import { askErrorMessage } from "./AnswerView";

/** One question as it was asked, so the answer stays labeled after the form changes. */
export interface AskedQuestion {
  question: string;
  speciesKey: string;
  speciesName: string;
  regionId: string;
  regionName: string;
  start?: number;
  end?: number;
}

export type AnalystState =
  | { status: "idle" }
  | { status: "loading"; asked: AskedQuestion }
  | { status: "done"; asked: AskedQuestion; result: AskResponse }
  | { status: "error"; asked: AskedQuestion; message: string };

export interface Analyst {
  speciesKey: string;
  regionId: string;
  question: string;
  state: AnalystState;
  setSpeciesKey: (key: string) => void;
  setRegionId: (id: string) => void;
  setQuestion: (question: string) => void;
  /** Point the analyst at a species and state, as clicking a stamp on the globe does. */
  choose: (speciesKey: string, regionId: string) => void;
  ask: (asked: AskedQuestion) => void;
}

/**
 * The sidebar's analyst. Lives in the dashboard rather than the sidebar page, so an answer
 * that is still coming (15 to 20 seconds) isn't lost when the reader goes back to the menu.
 */
export function useAnalyst(): Analyst {
  const [speciesKey, setSpeciesKey] = useState("");
  const [regionId, setRegionId] = useState("");
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AnalystState>({ status: "idle" });

  // Only the latest question's answer is shown
  const latest = useRef(0);

  const choose = useCallback((species: string, region: string) => {
    setSpeciesKey(species);
    setRegionId(region);
  }, []);

  const ask = useCallback((asked: AskedQuestion) => {
    const id = ++latest.current;
    setState({ status: "loading", asked });

    api
      .ask({
        question: asked.question,
        species: asked.speciesKey,
        region: asked.regionId,
        start: asked.start,
        end: asked.end,
      })
      .then(result => {
        if (id === latest.current) setState({ status: "done", asked, result });
      })
      .catch(error => {
        if (id === latest.current) setState({ status: "error", asked, message: askErrorMessage(error) });
      });
  }, []);

  return {
    speciesKey,
    regionId,
    question,
    state,
    setSpeciesKey,
    setRegionId,
    setQuestion,
    choose,
    ask,
  };
}
