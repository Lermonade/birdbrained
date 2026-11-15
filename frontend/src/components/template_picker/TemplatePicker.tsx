import { Check } from "lucide-react";

import type { BirdTemplate } from "../../pages/templates/templateData";

import styles from "./template_picker.module.css";

interface TemplatePickerProps {
  templates: BirdTemplate[];
  /** The ids of the templates whose bird is on the globe now. */
  activeIds: ReadonlySet<string>;
  /** The globe can't take another species, so templates that are off can't be turned on. */
  full: boolean;
  onToggle: (template: BirdTemplate) => void;
  /** Shows every template, or hides them all if they're all showing. */
  onToggleAll: () => void;
}

// The templates in the sidebar: tick any number of them, up to all three at once.
// Each one puts its bird on the globe and turns the camera to its part of the world.
export default function TemplatePicker({
  templates,
  activeIds,
  full,
  onToggle,
  onToggleAll,
}: TemplatePickerProps) {
  const allOn = templates.every(template => activeIds.has(template.id));

  return (
    <section className={styles.picker} aria-label="Bird templates">
      <div className={styles.header}>
        <h2 className={styles.heading}>Templates</h2>

        <button
          type="button"
          className={styles.all}
          onClick={onToggleAll}
          disabled={!allOn && full}
        >
          {allOn ? "Hide all" : "Show all"}
        </button>
      </div>

      <ul className={styles.list}>
        {templates.map(template => {
          const on = activeIds.has(template.id);

          return (
            <li key={template.id}>
              <button
                type="button"
                className={styles.row}
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(template)}
                title={`${template.species}, ${template.region}, ${template.startYear} to ${template.endYear}`}
              >
                <img className={styles.thumb} src={template.imageUrl} alt="" />

                <span className={styles.text}>
                  <span className={styles.name}>{template.species}</span>
                  <span className={styles.where}>{template.region}</span>
                </span>

                <span className={styles.box} aria-hidden="true">
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
