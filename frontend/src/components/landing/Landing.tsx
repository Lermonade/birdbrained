import { useLayoutEffect, useRef, type RefObject } from "react";
import { ChevronDown } from "lucide-react";

import type { GlobeHandle, GlobeView } from "../globe_visualization/GlobeVisualization";
import Bird from "./Bird";
import { BIRD_ART } from "./birdArt";
import {
  alongPath,
  clamp01,
  easeInOut,
  easeOut,
  lerp,
  segment,
  through,
  type Curve,
  type Point,
  type Scene,
} from "./timeline";

import styles from "./landing.module.css";

interface LandingProps {
  active: boolean; // true on "/", false once the dashboard is open
  onEnter: () => void; // the flight is over; open the dashboard
  onImpact: (landed: boolean) => void; // the bird reached the globe, or left it again
  destination: GlobeView; // where the bird lands and the camera ends up
  globe: RefObject<GlobeHandle | null>;
  globeFrame: RefObject<HTMLElement | null>; // the box the globe is drawn in
  scene: RefObject<Scene>;
}

const NAME = "BirdBrained";

// The scene plays out over the scroll. These are fractions of it.
const TAKEOFF = 0.02;
const IMPACT = 0.92;
const ENTER = 0.965;

// Below this the globe is still under the bottom of the screen, so it isn't drawn at all
const GLOBE_OUT_OF_SIGHT = 0.12;

// How quickly the scene catches up with the scroll position (per frame at 60fps)
const CATCH_UP = 0.12;

// Playing the flight without scrolling: the scroll cue, leaving by the navbar,
// and the flight back out when you return from the dashboard
const AUTOPLAY_MS = 2600;
const EXIT_MS = 1100;
const REWIND_MS = 1500;

// Where on the last letter the bird sits, as fractions of the letter's box
const PERCH_X = 0.72;
const PERCH_Y = 0.2;

// The cursor counts as near the perched bird within this many px
const NEAR_BIRD = 90;

// Bird size along the flight: it swoops close on the low pass, then dives away
const SIZE_STOPS: [number, number][] = [
  [0, 1],
  [0.2, 0.72],
  [0.45, 1],
  [0.66, 1.85],
  [0.8, 1.35],
  [1, 0.05],
];

// Up off the title, over the top to the left, low across the bottom, then into the globe.
// Each curve starts in the direction the last one ended, so the turns are smooth.
function flightPath(perch: Point, target: Point, width: number, height: number): Curve[] {
  const at = (x: number, y: number): Point => ({ x: x * width, y: y * height });
  const mirror = (control: Point, around: Point): Point => ({
    x: 2 * around.x - control.x,
    y: 2 * around.y - control.y,
  });

  const climbControl = at(0.95, 0.34);
  const topRight = at(0.88, 0.22);
  const crossControl = at(0.3, 0.11);
  const left = at(0.12, 0.28);
  const swoopControl = at(0.1, 0.8);
  const low = at(0.4, 0.77);
  const diveControl = { x: target.x + 0.24 * width, y: target.y + 0.03 * height };

  return [
    [perch, { x: perch.x + 0.07 * width, y: perch.y - 0.12 * height }, climbControl, topRight],
    [topRight, mirror(climbControl, topRight), crossControl, left],
    [left, mirror(crossControl, left), swoopControl, low],
    [low, mirror(swoopControl, low), diveControl, target],
  ];
}

interface Engine {
  setActive: (active: boolean) => void;
  scrolled: () => void;
  pointerMoved: (clientX: number, clientY: number) => void;
  play: () => void;
  stopPlaying: () => void;
}

export default function Landing({
  active,
  onEnter,
  onImpact,
  destination,
  globe,
  globeFrame,
  scene,
}: LandingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const subheadingRef = useRef<HTMLParagraphElement | null>(null);
  const cueRef = useRef<HTMLButtonElement | null>(null);
  const birdRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const propsRef = useRef({ onEnter, onImpact, destination });

  useLayoutEffect(() => {
    propsRef.current = { onEnter, onImpact, destination };
  }, [onEnter, onImpact, destination]);

  // The scene runs outside React: one loop reads the scroll and writes styles directly
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroller = scrollerRef.current;
    const stage = stageRef.current;
    const title = titleRef.current;
    const subheading = subheadingRef.current;
    const cue = cueRef.current;
    const bird = birdRef.current;
    if (!root || !scroller || !stage || !title || !subheading || !cue || !bird) return;

    const letters = Array.from(title.children) as HTMLElement[];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scroll position (target) and where the scene has eased to (s), both 0 to 1
    let s = 1;
    let target = 1;
    let previousS = 1;
    let drawnS = -1;

    let isActive = false;
    let firstCall = true;
    let landed = true;
    let entered = true;
    // A timed run to one end of the scene, used when the scroll isn't what's driving it
    let run: { from: number; to: number; start: number; duration: number } | null = null;

    let frame = 0;
    let autoplay = 0;
    let lastTime = 0;
    let flapPhase = 0;

    let width = 0;
    let height = 0;
    let perch: Point = { x: 0, y: 0 };
    let globeY = 0;
    let globeScale = 1;

    let pointer: Point | null = null;
    let near = false;
    let globePaused = false;

    function measure() {
      width = stage!.offsetWidth;
      height = stage!.offsetHeight;

      // offsetLeft/offsetTop ignore transforms, so this is the letter's resting place
      const last = letters[letters.length - 1];
      perch = {
        x: last.offsetLeft + last.offsetWidth * PERCH_X,
        y: last.offsetTop + last.offsetHeight * PERCH_Y,
      };

      drawnS = -1;
    }

    // Where the landing spot on the globe is on screen, after the globe's own slide and scale
    function landingPoint(): Point {
      const box = globeFrame.current;
      const { destination: spot } = propsRef.current;

      const boxWidth = box?.offsetWidth ?? width;
      const boxHeight = box?.offsetHeight ?? height;
      const centerX = (box?.offsetLeft ?? 0) + boxWidth / 2;
      const centerY = (box?.offsetTop ?? 0) + boxHeight / 2;

      const point = globe.current?.screenPoint(spot.lat, spot.lng);
      if (!point) return { x: centerX, y: centerY + globeY };

      return {
        x: centerX + (point.x - boxWidth / 2) * globeScale,
        y: centerY + (point.y - boxHeight / 2) * globeScale + globeY,
      };
    }

    // Everything that depends only on the scroll: title, globe, camera
    function drawScroll() {
      const box = globeFrame.current;
      const { destination: spot } = propsRef.current;

      cue!.style.opacity = String(1 - segment(s, 0, 0.04));
      cue!.style.visibility = s < 0.04 ? "visible" : "hidden";

      if (reducedMotion) {
        // No movement: the title fades out as the globe fades in
        const fade = segment(s, 0.15, 0.85);
        title!.style.opacity = String(1 - fade);
        subheading!.style.opacity = String(1 - fade);
        box?.style.setProperty("--globe-opacity", String(fade));
        globe.current?.setView(spot);
        return;
      }

      // Each letter lifts away, one after another. The last one dips as the bird pushes off.
      letters.forEach((letter, i) => {
        const lift = easeInOut(segment(s, 0.03 + i * 0.011, 0.2 + i * 0.011));
        const dip = i === letters.length - 1 ? Math.sin(Math.PI * segment(s, 0, 0.05)) * 0.06 : 0;
        const tilt = lift * (i % 2 ? 7 : -7);

        letter.style.transform = `translateY(${dip - lift * 0.9}em) rotate(${tilt}deg)`;
        letter.style.opacity = String(1 - lift);
      });

      subheading!.style.opacity = String(1 - segment(s, 0, 0.1));

      // The globe rises from below the screen
      const rise = easeOut(segment(s, 0.2, 0.8));
      globeY = (1 - rise) * height * 1.02;
      globeScale = lerp(0.8, 1, rise);
      box?.style.setProperty("--globe-y", `${globeY}px`);
      box?.style.setProperty("--globe-scale", String(globeScale));

      // ...and turns until the landing spot faces you
      const turn = easeInOut(segment(s, 0.2, 0.88));
      const altitude = spot.altitude ?? 1.4;
      globe.current?.setView({
        lat: lerp(spot.lat - 30, spot.lat, turn),
        lng: spot.lng - (1 - turn) * 110,
        altitude: lerp(altitude + 0.9, altitude, turn),
      });
    }

    function drawBird() {
      if (reducedMotion) {
        bird!.style.opacity = "0";
        return;
      }

      const u = segment(s, TAKEOFF, IMPACT);
      const perched = u <= 0;

      // While it sits, it turns to face the cursor and hops when the cursor comes close
      let facing = 1;
      if (perched && pointer) {
        facing = pointer.x < perch.x ? -1 : 1;

        const nowNear = Math.hypot(pointer.x - perch.x, pointer.y - perch.y) < NEAR_BIRD;
        if (nowNear && !near) {
          bird!.classList.remove(styles.hop);
          void bird!.offsetWidth; // restart the animation
          bird!.classList.add(styles.hop);
        }
        near = nowNear;
      }

      const path = flightPath(perch, landingPoint(), width, height);
      const position = alongPath(path, u);
      const size = through(SIZE_STOPS, u);

      // It swings round to its heading as it leaves the perch
      const angle = position.angle * segment(s, TAKEOFF, TAKEOFF + 0.04);
      // Side-view art flips so it isn't upside down when flying left
      const sideView = BIRD_ART.type === "sprite" && BIRD_ART.sideView;
      const upright = sideView && Math.cos(angle) < 0 ? -1 : 1;

      bird!.style.transform =
        `translate(${position.x}px, ${position.y}px) rotate(${angle}rad) ` +
        `scale(${size}, ${size * upright})`;
      bird!.style.opacity = String(1 - segment(s, IMPACT - 0.025, IMPACT));
      bird!.style.setProperty("--facing", String(facing));
      bird!.style.setProperty("--perched", String(1 - segment(s, TAKEOFF, TAKEOFF + 0.04)));
      bird!.style.setProperty("--flap", String(0.5 + 0.5 * Math.sin(flapPhase)));

      if (BIRD_ART.type === "sprite") {
        const { frames, perchedFrame } = BIRD_ART;
        const beat = Math.floor((flapPhase / (Math.PI * 2)) * frames) % frames;
        const shown = perched ? perchedFrame : beat;
        bird!.style.setProperty("--frame", frames > 1 ? `${(shown / (frames - 1)) * 100}%` : "0%");
      }
    }

    function finish() {
      s = 1;
      target = 1;
      run = null;
      scene.current.progress = 1;

      root!.dataset.state = "gone";
      root!.inert = true;

      globePaused = false;
      globe.current?.setPaused(false);

      const box = globeFrame.current;
      box?.style.removeProperty("--globe-y");
      box?.style.removeProperty("--globe-scale");
      box?.style.removeProperty("--globe-opacity");
    }

    function tick(now: number) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
      lastTime = now;

      if (run) {
        const t = clamp01((now - run.start) / run.duration);
        s = lerp(run.from, run.to, easeInOut(t));
        if (t >= 1 && isActive) run = null; // back at the top; the scroll takes over
      } else {
        s += (target - s) * (1 - Math.pow(1 - CATCH_UP, dt * 60));
        if (Math.abs(target - s) < 0.0004) s = target;
      }

      // Wings beat faster the faster the scene is moving
      const speed = Math.abs(s - previousS) / dt;
      previousS = s;
      flapPhase += dt * (9 + Math.min(1, speed * 1.5) * 24);

      scene.current.progress = s;
      if (s !== drawnS) {
        drawScroll();
        drawnS = s;
      }
      drawBird();

      // Leave the whole frame to the title and the stars until the globe is on its way up
      const outOfSight = s < GLOBE_OUT_OF_SIGHT;
      if (outOfSight !== globePaused && globe.current?.setPaused(outOfSight)) {
        globePaused = outOfSight;
      }

      if (!landed && s >= IMPACT) {
        landed = true;
        if (!reducedMotion) {
          const { destination: spot } = propsRef.current;
          globe.current?.ripple(spot.lat, spot.lng);
        }
        propsRef.current.onImpact(true);
      } else if (landed && s < IMPACT - 0.03) {
        landed = false;
        propsRef.current.onImpact(false);
      }

      if (isActive && !entered && s >= ENTER) {
        entered = true;
        propsRef.current.onEnter();
      } else if (isActive && entered && s < ENTER - 0.05) {
        // Rewound far enough (after coming back from the dashboard) to arm it again
        entered = false;
      }

      if (!isActive && s >= 0.9995) {
        finish();
        frame = 0;
        return;
      }

      frame = requestAnimationFrame(tick);
    }

    function stopPlaying() {
      cancelAnimationFrame(autoplay);
      autoplay = 0;
    }

    const engine: Engine = {
      setActive(next) {
        const first = firstCall;
        firstCall = false;
        isActive = next;
        stopPlaying();

        if (next) {
          entered = !first; // coming back, the scene is still at its end; see tick()
          run = null;
          root.dataset.state = "live";
          root.inert = false;

          scroller.scrollTop = 0;
          target = 0;
          if (first) {
            // A fresh load starts at the top
            s = 0;
            previousS = 0;
            landed = false;
          } else if (!reducedMotion) {
            // Back from the dashboard: the bird flies back out and the scene rewinds
            run = { from: s, to: 0, start: performance.now(), duration: 200 + s * REWIND_MS };
          }

          measure();
          // Place everything before the first paint, so nothing flashes in the wrong spot
          drawScroll();
          drawnS = s;
          drawBird();

          lastTime = 0;
          if (!frame) frame = requestAnimationFrame(tick);
          // Focus it so Space, Page Down and the arrow keys scroll the scene
          scroller.focus({ preventScroll: true });
          return;
        }

        if (first || s >= 0.9995) {
          finish();
          return;
        }

        // Left some other way (the navbar): play the rest of the flight, quickly
        run = { from: s, to: 1, start: performance.now(), duration: 300 + (1 - s) * EXIT_MS };
      },

      scrolled() {
        if (!isActive) return;
        const max = scroller.scrollHeight - scroller.clientHeight;
        target = max > 0 ? clamp01(scroller.scrollTop / max) : 0;
        // Scrolling during the rewind takes over from it
        if (run && target > 0.002) run = null;
      },

      pointerMoved(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        pointer = { x: clientX - rect.left, y: clientY - rect.top };
      },

      play() {
        stopPlaying();
        const max = scroller.scrollHeight - scroller.clientHeight;
        const from = scroller.scrollTop;

        if (reducedMotion) {
          scroller.scrollTop = max;
          return;
        }

        const start = performance.now();
        const duration = 300 + (1 - from / max) * AUTOPLAY_MS;

        const step = (now: number) => {
          const t = clamp01((now - start) / duration);
          scroller.scrollTop = lerp(from, max, easeInOut(t));
          autoplay = t < 1 ? requestAnimationFrame(step) : 0;
        };
        autoplay = requestAnimationFrame(step);
      },

      stopPlaying,
    };

    engineRef.current = engine;

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stage);
    // The title's letters change size when the web font arrives
    document.fonts.ready.then(measure);

    const globeHandle = globe.current;

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(autoplay);
      globeHandle?.setPaused(false);
      engineRef.current = null;
    };
  }, [globe, globeFrame, scene]);

  useLayoutEffect(() => {
    engineRef.current?.setActive(active);
  }, [active]);

  return (
    <div
      ref={rootRef}
      className={styles.landing}
      data-state="gone" /* the scene loop switches this to "live" */
      onPointerMove={e => engineRef.current?.pointerMoved(e.clientX, e.clientY)}
    >
      <div
        ref={scrollerRef}
        className={styles.scroller}
        tabIndex={-1}
        onScroll={() => engineRef.current?.scrolled()}
        onWheel={() => engineRef.current?.stopPlaying()}
        onTouchStart={() => engineRef.current?.stopPlaying()}
      >
        {/* The track gives the scroll its length; the stage stays pinned while it passes */}
        <div className={styles.track}>
          <div ref={stageRef} className={styles.stage}>
            <h1 ref={titleRef} className={styles.title} aria-label={NAME}>
              {Array.from(NAME).map((letter, i) => (
                <span key={i} className={styles.letter} aria-hidden="true">
                  <span className={styles.glyph} style={{ animationDelay: `${i * 45}ms` }}>
                    {letter}
                  </span>
                </span>
              ))}
            </h1>

            <p ref={subheadingRef} className={styles.subheading}>
              Where America's birds are gaining ground, and where they're losing it.
            </p>

            <Bird ref={birdRef} />

            <button
              ref={cueRef}
              className={styles.cue}
              onClick={() => engineRef.current?.play()}
              aria-label="Take off"
            >
              <ChevronDown size={24} className={styles.cueArrow} aria-hidden="true" />
              <ChevronDown
                size={24}
                className={`${styles.cueArrow} ${styles.cueArrowSecond}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
