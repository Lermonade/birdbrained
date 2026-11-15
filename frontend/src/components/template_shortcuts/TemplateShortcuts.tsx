import type { BirdTemplate } from "../../pages/templates/templateData";

import styles from "./template_shortcuts.module.css";

interface TemplateShortcutsProps {
  templates: BirdTemplate[]; // the templates to offer, in order
  onPick: (template: BirdTemplate) => void;
}

// Shortcuts to the other templates, along the top of the globe: one click swaps the
// globe to that bird, its years and its part of the world.
export default function TemplateShortcuts({ templates, onPick }: TemplateShortcutsProps) {
  if (templates.length === 0) return null;

  return (
    <nav className={styles.shortcuts} aria-label="Bird templates">
      <span className={styles.label}>Templates</span>

      {templates.map(template => (
        <button
          key={template.id}
          type="button"
          className={styles.chip}
          onClick={() => onPick(template)}
          title={`${template.species}, ${template.region}, ${template.startYear} to ${template.endYear}`}
        >
          <img className={styles.thumb} src={template.imageUrl} alt="" />
          <span className={styles.text}>
            <span className={styles.name}>{template.species}</span>
            <span className={styles.where}>{template.region}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
