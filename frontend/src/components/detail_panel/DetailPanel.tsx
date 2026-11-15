import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { api, ApiError } from "../../api/client";
import type { AskResponse, Detail, GrabPoint } from "../../api/client";
import { DOWN_COLOR, UP_COLOR, formatPct } from "../../pages/dashboard/globeData";

import styles from "./detail_panel.module.css";

interface DetailPanelProps {
  speciesKey: string;
  speciesName: string;
  regionId: string;
  regionName: string;
  point: GrabPoint | undefined;
  start: number;
  end: number;
  onClose: () => void;
}

type AskState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AskResponse }
  | { status: "error"; message: string };

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  untested: "Untested",
};

// Remount this component (via its key) when the species, state or years change, so it starts fresh.
export default function DetailPanel({
  speciesKey,
  speciesName,
  regionId,
  regionName,
  point,
  start,
  end,
  onClose,
}: DetailPanelProps) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    api
      .detail(speciesKey, regionId)
      .then(result => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        // The panel still shows the globe numbers without the extra checks
      });
    return () => {
      cancelled = true;
    };
  }, [speciesKey, regionId]);

  function askWhy() {
    setAsk({ status: "loading" });
    api
      .ask({ question: "Why is this happening?", species: speciesKey, region: regionId, start, end })
      .then(result => setAsk({ status: "done", result }))
      .catch(error =>
        setAsk({
          status: "error",
          message:
            error instanceof ApiError && error.status === 503
              ? "The analyst is busy right now. Try again in a minute."
              : error instanceof Error
                ? error.message
                : "Something went wrong.",
        })
      );
  }

  const ok = point?.status === "ok";
  const color = point?.direction === "down" ? DOWN_COLOR : UP_COLOR;

  return (
    <aside className={styles.panel} aria-label={`${speciesName} in ${regionName}`}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{regionName}</h2>
          <p className={styles.subtitle}>
            {speciesName}, {start} to {end}
          </p>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      {ok ? (
        <>
          <p className={styles.bigNumber} style={{ color }}>
            {point.direction === "down" ? "▼" : "▲"} {formatPct(point.changePct)}
          </p>
          <p className={styles.caption}>Change in its share of all bird sightings</p>

          <dl className={styles.facts}>
            <dt>Raw sightings</dt>
            <dd>
              {formatPct(point.rawChangePct)} ({point.startCount.toLocaleString()} to{" "}
              {point.endCount.toLocaleString()})
            </dd>
            {detail?.survey && (
              <>
                <dt>Federal survey ({detail.survey.period})</dt>
                <dd>{formatPct(detail.survey.changePerYear)} a year</dd>
              </>
            )}
            {detail?.secondSource && (
              <>
                <dt>iNaturalist (from 2015)</dt>
                <dd>{formatPct(detail.secondSource.changePerYear)} a year</dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p className={styles.caption}>
          Not enough sightings in {regionName} for these years to measure a change.
        </p>
      )}

      {ok && ask.status === "idle" && (
        <button className={styles.askButton} onClick={askWhy}>
          Ask why
        </button>
      )}

      {ask.status === "loading" && (
        <p className={styles.loading} role="status">
          The analyst is checking the data. This takes about 15 to 20 seconds.
        </p>
      )}

      {ask.status === "error" && (
        <div className={styles.error} role="alert">
          <p>{ask.message}</p>
          <button className={styles.askButton} onClick={askWhy}>
            Try again
          </button>
        </div>
      )}

      {ask.status === "done" && <AnswerView result={ask.result} />}
    </aside>
  );
}

function AnswerView({ result }: { result: AskResponse }) {
  const { answer } = result;

  return (
    <section className={styles.answer}>
      <h3 className={styles.sectionTitle}>Analyst</h3>
      <p>{answer.summary}</p>

      {answer.evidence.length > 0 && (
        <>
          <h4 className={styles.smallTitle}>Evidence</h4>
          <ul className={styles.list}>
            {answer.evidence.map((item, i) => (
              <li key={i}>{item.claim}</li>
            ))}
          </ul>
        </>
      )}

      {answer.hypotheses.length > 0 && (
        <>
          <h4 className={styles.smallTitle}>Possible causes</h4>
          <ul className={styles.list}>
            {answer.hypotheses.map((hypothesis, i) => (
              <li key={i}>
                <span className={styles.badge}>
                  {CONFIDENCE_LABEL[hypothesis.confidence] ?? hypothesis.confidence}
                </span>{" "}
                {hypothesis.cause}
                {hypothesis.against.length > 0 && (
                  <span className={styles.against}> Against: {hypothesis.against.join(" ")}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {answer.could_be_artifact && (
        <>
          <h4 className={styles.smallTitle}>Could it be a sampling effect?</h4>
          <p>{answer.could_be_artifact}</p>
        </>
      )}
    </section>
  );
}
