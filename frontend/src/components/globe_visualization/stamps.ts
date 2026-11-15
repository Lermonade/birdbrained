// Printed stamps: one flat inked disc per region and species, sized by sightings, with a
// thin rim in the look's ink. They sit almost flush with the Earth, like marks printed on
// the map, instead of towering over it.
//
// Drawn through globe.gl's custom layer. It matches data to objects by identity, so each
// region keeps one stamp object for as long as it's shown: a new year only changes the
// size it's easing toward, and one animation loop moves every stamp there smoothly.

import type Globe from "globe.gl";
import * as THREE from "three";

import type { DataPoint } from "./GlobeVisualization";
import { STAMP_MIN_DEG, stampRadius } from "./scales";

type GlobeInstance = InstanceType<typeof Globe>;

export interface StampInput {
  key: string; // stays the same across years, so the stamp is reused
  lat: number;
  lng: number;
  size: number; // 0 to 1, see scales.ts
  layer: number; // stack order within its region: 0 at the bottom
  color: string;
  label: string;
  point: DataPoint; // handed back on click
}

interface Stamp extends StampInput {
  target: number; // radius it's easing toward, degrees
  shown: number; // radius now, degrees
  lift: number; // raised off the Earth now, world units (hover)
  wait: number; // ms before it starts to grow in
  hovered: boolean;
  leaving: boolean; // shrinking away, then removed
  obj?: THREE.Group;
  nudge: number;
}

// three-globe's
const GLOBE_RADIUS = 100;
const DEG = Math.PI / 180;

// Heights in world units. A stamp is a lip, not a pillar.
const BASE = 0.05; // off the surface, so it never flickers into the Earth
// The rim is as tall as the stamp, with the face just above it, so where stamps overlap
// the higher one's rim still shows over its neighbor
const THICKNESS = 0.6;
const FACE_ABOVE_RIM = 0.1;
const RIM = 0.35; // the rim's width around the face
const HOVER_LIFT = 1.4;
const SMALL_FIRST = 0.3; // smaller stamps sit a little higher, so they overlap bigger neighbors
// Plus a fixed nudge per stamp, so two the same size never sit exactly level and flicker
const NUDGE = 0.2;

// Easing and the entrance, in ms
const EASE = 140;
const STAGGER_PER_DEG = 7; // stamps further from the view's center come in later
const MAX_STAGGER = 650;

const HOVER_BRIGHTEN = 0.22;

const DISC = new THREE.CylinderGeometry(1, 1, 1, 48).translate(0, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color("#ffffff");

const scratchNormal = new THREE.Vector3();
const scratchColor = new THREE.Color();

// 0 to 1, the same every time for the same key
function nudge(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return ((hash >>> 0) % 1000) / 1000;
}

function angularDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const cos =
    Math.sin(aLat * DEG) * Math.sin(bLat * DEG) +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((aLng - bLng) * DEG);
  return Math.acos(Math.min(Math.max(cos, -1), 1)) / DEG;
}

export class StampLayer {
  private stamps = new Map<string, Stamp>();
  private frame = 0;
  private last = 0;
  private globe: GlobeInstance;
  private outline: string;

  constructor(globe: GlobeInstance, outline: string, onClick: (point: DataPoint) => void) {
    this.globe = globe;
    this.outline = outline;

    globe
      .customThreeObject((d: object) => this.build(d as Stamp))
      .customThreeObjectUpdate((_obj: THREE.Object3D, d: object) => this.place(d as Stamp))
      .customLayerLabel((d: object) => ((d as Stamp).leaving ? "" : (d as Stamp).label))
      .onCustomLayerHover((d: object | null, previous: object | null) => {
        if (previous) (previous as Stamp).hovered = false;
        if (d && !(d as Stamp).leaving) (d as Stamp).hovered = true;
        this.kick();
      })
      .onCustomLayerClick((d: object) => {
        const stamp = d as Stamp;
        if (!stamp.leaving) onClick(stamp.point);
      });
  }

  /** Show these stamps. New ones grow in, gone ones shrink away, the rest ease to their new size. */
  update(inputs: StampInput[]) {
    const entering = this.stamps.size === 0;
    const view = this.globe.pointOfView();
    const current = new Set<string>();

    for (const input of inputs) {
      current.add(input.key);
      const stamp = this.stamps.get(input.key);

      if (stamp) {
        Object.assign(stamp, input, { target: stampRadius(input.size), leaving: false });
        continue;
      }

      // The first stamps spread out from wherever the camera is looking
      const wait = entering
        ? Math.min(MAX_STAGGER, angularDistance(view.lat, view.lng, input.lat, input.lng) * STAGGER_PER_DEG)
        : 0;

      this.stamps.set(input.key, {
        ...input,
        target: stampRadius(input.size),
        shown: 0,
        lift: 0,
        wait,
        hovered: false,
        leaving: false,
        nudge: nudge(input.key),
      });
    }

    for (const stamp of this.stamps.values()) {
      if (current.has(stamp.key)) continue;
      stamp.target = 0;
      stamp.leaving = true;
      stamp.hovered = false;
      stamp.wait = 0;
    }

    this.sync();
    this.kick();
  }

  /** Take every stamp away at once, without animating. */
  clear() {
    this.stamps.clear();
    this.sync();
  }

  /** The rim's ink, from the look. */
  setOutline(outline: string) {
    if (outline === this.outline) return;
    this.outline = outline;

    for (const stamp of this.stamps.values()) {
      const rim = stamp.obj?.children[0] as THREE.Mesh | undefined;
      (rim?.material as THREE.MeshBasicMaterial | undefined)?.color.set(outline);
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private sync() {
    this.globe.customLayerData([...this.stamps.values()]);
  }

  private kick() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const step = 1 - Math.exp(-dt / EASE);

    let moving = false;
    let removed = false;

    for (const stamp of this.stamps.values()) {
      if (stamp.wait > 0) {
        stamp.wait -= dt;
        moving = true;
        continue;
      }

      stamp.shown += (stamp.target - stamp.shown) * step;
      if (Math.abs(stamp.target - stamp.shown) < 0.002) stamp.shown = stamp.target;
      else moving = true;

      const lift = stamp.hovered ? HOVER_LIFT : 0;
      stamp.lift += (lift - stamp.lift) * step;
      if (Math.abs(lift - stamp.lift) < 0.01) stamp.lift = lift;
      else moving = true;

      if (stamp.leaving && stamp.shown === 0) {
        this.stamps.delete(stamp.key);
        removed = true;
        continue;
      }

      this.place(stamp);
    }

    if (removed) this.sync();
    this.frame = moving ? requestAnimationFrame(this.tick) : 0;
  };

  // Made fresh for each stamp: globe.gl disposes a stamp's materials when it's removed
  private build(stamp: Stamp): THREE.Group {
    // Pushed back in depth, so where the rim and a face are level the face wins
    const rim = new THREE.Mesh(
      DISC,
      new THREE.MeshBasicMaterial({
        color: this.outline,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    );
    const face = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial());

    const group = new THREE.Group();
    group.add(rim, face);
    stamp.obj = group;
    return group;
  }

  private place(stamp: Stamp) {
    const group = stamp.obj;
    if (!group) return;

    const radius = stamp.shown * DEG * GLOBE_RADIUS;
    group.visible = radius > 0.01;
    if (!group.visible) return;

    const [rim, face] = group.children as THREE.Mesh[];

    // Brighter while hovered, in step with the lift
    const hover = stamp.lift / HOVER_LIFT;
    (face.material as THREE.MeshBasicMaterial).color.copy(
      scratchColor.set(stamp.color).lerp(WHITE, HOVER_BRIGHTEN * hover)
    );

    // Each species in a region sits fully on top of the one below it
    const altitude =
      BASE +
      stamp.layer * (THICKNESS + FACE_ABOVE_RIM + NUDGE) +
      (1 - stamp.size) * SMALL_FIRST +
      stamp.nudge * NUDGE +
      stamp.lift;
    const { x, y, z } = this.globe.getCoords(stamp.lat, stamp.lng, altitude / GLOBE_RADIUS);

    group.position.set(x, y, z);
    group.quaternion.setFromUnitVectors(UP, scratchNormal.set(x, y, z).normalize());

    // The rim grows in with the stamp, so a tiny stamp isn't all rim
    const rimWidth = RIM * Math.min(1, stamp.shown / STAMP_MIN_DEG);
    rim.scale.set(radius + rimWidth, THICKNESS, radius + rimWidth);
    face.scale.set(radius, THICKNESS + FACE_ABOVE_RIM, radius);
  }
}
