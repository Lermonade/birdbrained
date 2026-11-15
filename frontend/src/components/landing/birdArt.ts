// The landing bird's artwork. This is the one place to swap in team art.
//
// Right now it's a plain placeholder drawn in Bird.tsx. To use real art, export
// a sprite sheet and point BIRD_ART at it:
//
//   import sheet from "../../assets/bird_sheet.png";
//
//   export const BIRD_ART: BirdArt = {
//     type: "sprite",
//     src: sheet,
//     frames: 8,          // wing-beat frames, left to right in one row
//     frameWidth: 256,    // size of one frame in the image, in px
//     frameHeight: 160,
//     perchedFrame: 0,    // frame to show while it sits on the title
//     sideView: true,     // true: drawn from the side. false: drawn from above.
//   };
//
// What the art needs:
//   - The bird faces RIGHT (it is rotated to follow its flight path).
//   - A transparent background, light enough to read on dark space.
//   - Every frame the same size, the bird centered in its frame.
//   - Side-view art is flipped to stay upright when it flies left.
//     Art drawn from above is just rotated.

export interface SpriteArt {
  type: "sprite";
  src: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  perchedFrame: number;
  sideView: boolean;
}

export type BirdArt = { type: "placeholder" } | SpriteArt;

export const BIRD_ART: BirdArt = { type: "placeholder" };
