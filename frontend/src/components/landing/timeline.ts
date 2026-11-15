// Small math helpers for the scroll-driven landing scene.

/** What the landing shares with the backdrop behind it. */
export interface Scene {
  progress: number; // 0 = top of the landing, 1 = dashboard
}

export interface Point {
  x: number;
  y: number;
}

/** A cubic Bezier: start, two control points, end. */
export type Curve = [Point, Point, Point, Point];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 before `from`, 1 after `to`, and a straight ramp in between. */
export function segment(s: number, from: number, to: number): number {
  return clamp01((s - from) / (to - from));
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A value that passes through [position, value] stops, eased between them. */
export function through(stops: [number, number][], u: number): number {
  if (u <= stops[0][0]) return stops[0][1];

  for (let i = 1; i < stops.length; i++) {
    const [position, value] = stops[i];
    if (u <= position) {
      const [prevPosition, prevValue] = stops[i - 1];
      return lerp(prevValue, value, smoothstep((u - prevPosition) / (position - prevPosition)));
    }
  }

  return stops[stops.length - 1][1];
}

function curvePoint([p0, p1, p2, p3]: Curve, t: number): Point {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function curveTangent([p0, p1, p2, p3]: Curve, t: number): Point {
  const m = 1 - t;
  const a = 3 * m * m;
  const b = 6 * m * t;
  const c = 3 * t * t;

  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

/** Where you are, and which way you're heading, `u` (0 to 1) along a chain of curves. */
export function alongPath(curves: Curve[], u: number): Point & { angle: number } {
  const scaled = clamp01(u) * curves.length;
  const index = Math.min(curves.length - 1, Math.floor(scaled));
  const t = scaled - index;

  const point = curvePoint(curves[index], t);
  const tangent = curveTangent(curves[index], t);

  return { ...point, angle: Math.atan2(tangent.y, tangent.x) };
}
