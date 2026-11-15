import type { AskResponse } from "../../api/client";

import styles from "./answer.module.css";

interface AnswerViewProps {
  result: AskResponse;
  /** Leave out to drop the heading (when the page around it already says "Analyst"). */
  title?: string;
  /** Also show the next steps. */
  full?: boolean;
}

/** The analyst's answer: summary, evidence and possible causes. */
export default function AnswerView({ result, title, full = false }: AnswerViewProps) {
  const { answer } = result;

  return (
    <section className={styles.answer}>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
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
              <li key={i}>{hypothesis.cause}</li>
            ))}
          </ul>
        </>
      )}

      {full && answer.next_steps.length > 0 && (
        <>
          <h4 className={styles.smallTitle}>What would help</h4>
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
