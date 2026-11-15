import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { GripHorizontal, Pause, Play } from "lucide-react";

import styles from "./timeline.module.css";

interface TimelineProps {
  years: number[]; // every year the data covers, oldest first
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

// How long each year stays on screen while playing
const STEP_MS = 800;

// The year bar under the globe. The pillars show sightings in the "to" year; the detail
// panel measures the change from the "from" year to the "to" year. Play walks the "to"
// year forward from just after "from", so the pillars grow and shrink over time.
export default function Timeline({ years, start, end, onChange, playing, onPlayingChange }: TimelineProps) {
  const first = years[0];
  const last = years[years.length - 1];

  // Where the bar has been dragged to, as an offset from its spot under the globe
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const bar = useRef<HTMLElement | null>(null);
  const rail = useRef<HTMLDivElement | null>(null);
  const grab = useRef<{ px: number; py: number; from: { x: number; y: number }; minX: number; maxX: number; minY: number; maxY: number } | null>(null);

  function startDrag(e: PointerEvent<HTMLButtonElement>) {
    const el = bar.current;
    const area = el?.offsetParent?.getBoundingClientRect();
    if (!el || !area) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    // How far it can move from here and stay inside the globe's area
    grab.current = {
      px: e.clientX,
      py: e.clientY,
      from: offset,
      minX: offset.x + area.left - r.left,
      maxX: offset.x + area.right - r.right,
      minY: offset.y + area.top - r.top,
      maxY: offset.y + area.bottom - r.bottom,
    };
    setDragging(true);
  }

  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    const g = grab.current;
    if (!g) return;
    setOffset({
      x: Math.min(g.maxX, Math.max(g.minX, g.from.x + e.clientX - g.px)),
      y: Math.min(g.maxY, Math.max(g.minY, g.from.y + e.clientY - g.py)),
    });
  }

  function endDrag() {
    grab.current = null;
    setDragging(false);
  }

  // Arrow keys nudge it; Home puts it back
  function dragKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = 20;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Home") setOffset({ x: 0, y: 0 });
    else if (moves[e.key]) setOffset(o => ({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] }));
    else return;
    e.preventDefault();
  }

  // While playing, each year schedules the next; the last one stops
  useEffect(() => {
    if (!playing) return;

    const timer = window.setTimeout(() => {
      if (end >= last) onPlayingChange(false);
      else onChange(start, end + 1);
    }, STEP_MS);

    return () => window.clearTimeout(timer);
  }, [playing, start, end, last, onChange, onPlayingChange]);

  function togglePlay() {
    if (playing) {
      onPlayingChange(false);
      return;
    }
    // From the end, start over just after "from"
    if (end >= last) onChange(start, start + 1);
    onPlayingChange(true);
  }

  function setStart(value: number) {
    onPlayingChange(false);
    onChange(Math.min(value, end - 1), end);
  }

  function setEnd(value: number) {
    onPlayingChange(false);
    onChange(start, Math.max(value, start + 1));
  }

  const span = Math.max(1, last - first);
  const fill = {
    "--from": `${((start - first) / span) * 100}%`,
    "--to": `${((end - first) / span) * 100}%`,
  } as CSSProperties;

  // Clicking a year on the bar takes the globe there: that year becomes the "to" year. If
  // it's at or before the "from" year, "from" steps back to just before it.
  function jumpTo(e: MouseEvent<HTMLElement>) {
    // The thumbs are real sliders and handle their own clicks
    if (e.target instanceof HTMLInputElement) return;

    const rect = rail.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;

    const along = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const year = Math.round(first + along * span);

    onPlayingChange(false);
    if (year > start) {
      onChange(start, year);
    } else {
      const from = Math.max(first, year - 1);
      onChange(from, Math.max(year, from + 1));
    }
  }

  return (
    <section
      ref={bar}
      className={[styles.timeline, dragging ? styles.dragging : ""].join(" ")}
      style={{ "--dx": `${offset.x}px`, "--dy": `${offset.y}px` } as CSSProperties}
      aria-label="Years"
    >
      <button
        type="button"
        className={styles.play}
        onClick={togglePlay}
        disabled={start >= last}
        aria-label={playing ? "Pause" : "Play through the years"}
        title={playing ? "Pause" : "Play through the years"}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>

      <div className={styles.body}>
        <button
          type="button"
          className={styles.grip}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          onKeyDown={dragKey}
          aria-label="Move the timeline (arrow keys; Home resets)"
          title="Drag to move. Double-click to reset."
        >
          <GripHorizontal size={16} />
        </button>

        <p className={styles.readout} aria-live={playing ? "off" : "polite"}>
          <span className={styles.year}>{start}</span>
          <span className={styles.arrow} aria-hidden="true">
            &rarr;
          </span>
          <span className={styles.year}>{end}</span>        </p>

        <div className={styles.track} style={fill} onClick={jumpTo}>
          <div ref={rail} className={styles.rail} aria-hidden="true">
            <div className={styles.range} />
            {years.map(year => (
              <span
                key={year}
                className={[
                  styles.tick,
                  year >= start && year <= end ? styles.tickOn : "",
                  year === first || year === last || year % 5 === 0 ? styles.tickMajor : "",
                ].join(" ")}
                style={{ left: `${((year - first) / span) * 100}%` }}
              />
            ))}
          </div>

          <input
            type="range"
            className={styles.thumb}
            min={first}
            max={last}
            step={1}
            value={start}
            onChange={e => setStart(Number(e.target.value))}
            aria-label="From year"
          />
          <input
            type="range"
            className={styles.thumb}
            min={first}
            max={last}
            step={1}
            value={end}
            onChange={e => setEnd(Number(e.target.value))}
            aria-label="To year"
          />
        </div>

        <div className={styles.labels} aria-hidden="true" onClick={jumpTo}>
          {years
            .filter(year => year === first || year === last || (year % 5 === 0 && last - year >= 2 && year - first >= 2))
            .map(year => (
              <span key={year} style={{ left: `${((year - first) / span) * 100}%` }}>
                {year}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}
