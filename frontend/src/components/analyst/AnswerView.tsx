import type { AskResponse } from "../../api/client";

import styles from "./answer.module.css";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  untested: "Untested",
};

interface AnswerViewProps {
  result: AskResponse;
  /** Leave out to drop the heading (when the page around it already says "Analyst"). */
  title?: string;
  /** Also show the data check and the next steps. */
  full?: boolean;
}

/** The analyst's answer: summary, evidence, possible causes and the sampling check. */
export default function AnswerView({ result, title, full = false }: AnswerViewProps) {
  const { answer } = result;

  return (
    <section className={styles.answer}>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
      <p>{answer.summary}</p>

      {full && answer.data_check.note && (
        <p className={styles.note}>{answer.data_check.note}</p>
      )}

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

      {full && answer.next_steps.length > 0 && (
        <>
          <h4 className={styles.smallTitle}>What would settle it</h4>
          <ul className={styles.list}>
            {answer.next_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
