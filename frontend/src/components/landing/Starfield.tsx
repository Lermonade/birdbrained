import { useEffect, useRef, type RefObject } from "react";

import type { Scene } from "./timeline";

import styles from "./landing.module.css";

interface StarfieldProps {
  scene: RefObject<Scene>; // stars slide a little as the landing scrolls
}

interface Star {
  x: number; // 0 to 1 across the screen
  y: number;
  depth: number; // 0 = far, 1 = near; near stars move more
  radius: number;
  alpha: number;
  color: string;
  twinkleSpeed: number;
  twinklePhase: number;
}

const COLORS = ["247, 245, 239", "247, 245, 239", "247, 245, 239", "196, 214, 255", "255, 222, 180"];

// One star per this many square px of screen
const AREA_PER_STAR = 4600;

// How far the nearest stars shift, in px
const POINTER_SHIFT = 16;
const SCROLL_SHIFT = 260;

// Same sky every visit
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(count: number): Star[] {
  const random = seededRandom(7);

  return Array.from({ length: count }, () => {
    const depth = random();
    const bright = random() > 0.94;

    return {
      x: random(),
      y: random(),
      depth,
      radius: bright ? 1.5 + random() * 0.8 : 0.4 + depth * 0.8,
      alpha: bright ? 0.95 : 0.3 + depth * 0.5,
      color: COLORS[Math.floor(random() * COLORS.length)],
      twinkleSpeed: 0.4 + random() * 1.6,
      twinklePhase: random() * Math.PI * 2,
    };
  });
}

export default function Starfield({ scene }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let frame = 0;

    // Where the pointer is, -1 to 1 from the middle, and where the sky has eased to
    const pointer = { x: 0, y: 0 };
    const drift = { x: 0, y: 0 };

    function draw(time: number) {
      if (!ctx) return;

      drift.x += (pointer.x - drift.x) * 0.05;
      drift.y += (pointer.y - drift.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      for (const star of stars) {
        const x = star.x * width - drift.x * star.depth * POINTER_SHIFT;
        const scrolled =
          star.y * height -
          drift.y * star.depth * POINTER_SHIFT -
          scene.current.progress * star.depth * SCROLL_SHIFT;
        // Stars that slide off the top come back in at the bottom
        const y = ((scrolled % height) + height) % height;

        const twinkle = still
          ? 1
          : 0.72 + 0.28 * Math.sin(time * 0.001 * star.twinkleSpeed + star.twinklePhase);

        ctx.fillStyle = `rgba(${star.color}, ${star.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fill();

        // A soft glow around the few bright ones
        if (star.radius > 1.4) {
          ctx.fillStyle = `rgba(${star.color}, ${0.12 * twinkle})`;
          ctx.beginPath();
          ctx.arc(x, y, star.radius * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function loop(time: number) {
      draw(time);
      frame = requestAnimationFrame(loop);
    }

    function resize() {
      if (!canvas || !ctx) return;

      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      stars = makeStars(Math.round((width * height) / AREA_PER_STAR));
      if (still) draw(0);
    }

    function handlePointerMove(e: PointerEvent) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    if (!still) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      frame = requestAnimationFrame(loop);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(frame);
    };
  }, [scene]);

  return <canvas ref={canvasRef} className={styles.starfield} aria-hidden="true" />;
}
