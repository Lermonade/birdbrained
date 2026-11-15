import { useId } from "react";

import styles from "./sidebar.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  legend: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

// A row of toggles with one on, drawn as an inked pill. Native radio buttons underneath,
// so arrow keys and screen readers work as usual.
export default function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const name = useId();

  return (
    <fieldset className={styles.segmented}>
      <legend className={styles.label}>{legend}</legend>

      <div className={styles.track}>
        {options.map(option => (
          <label key={option.value} className={styles.segment} title={option.title}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
