import { useEffect, useRef, type RefObject } from "react";

import type { Scene } from "../components/landing/timeline";

/** Keeps `--p` on an element equal to the landing's scroll progress (0 to 1), so CSS can move its layers. */
export function useSceneProgress(scene: RefObject<Scene>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let drawn = -1;

    function tick() {
      const progress = scene.current.progress;
      if (progress !== drawn) {
        ref.current?.style.setProperty("--p", progress.toFixed(4));
        drawn = progress;
      }
      frame = requestAnimationFrame(tick);
    }

    tick();
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  return ref;
}
