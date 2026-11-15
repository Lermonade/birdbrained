// A clear shell just over the globe's surface that draws what an illustrator would add
// to a sphere: one flat shadow on the side away from the light, and an inked outline.
// Both are worked out in screen space, so they stay put while the globe turns under them.

import * as THREE from "three";

import type { ShellOptions } from "./types";

const GLOBE_RADIUS = 100; // three-globe's
const LIGHT = new THREE.Vector3(-0.55, 0.5, 0.67).normalize(); // from the upper left, toward you

const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vToCamera;

  void main() {
    vec4 position4 = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vToCamera = normalize(-position4.xyz);
    gl_Position = projectionMatrix * position4;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uShadow;
  uniform float uShadowAlpha;
  uniform vec3 uOutline;
  uniform float uOutlineAlpha;

  varying vec3 vNormal;
  varying vec3 vToCamera;

  void main() {
    vec3 normal = normalize(vNormal);

    // One hard-edged band of shadow
    float lit = dot(normal, uLight);
    float shadow = (1.0 - smoothstep(-0.12 - fwidth(lit), -0.12 + fwidth(lit), lit)) * uShadowAlpha;

    // A line where the sphere turns away from you
    float rim = 1.0 - dot(normal, normalize(vToCamera));
    float line = smoothstep(0.9 - fwidth(rim), 0.9 + fwidth(rim), rim) * uOutlineAlpha;

    float alpha = line + shadow * (1.0 - line);
    vec3 color = (uOutline * line + uShadow * shadow * (1.0 - line)) / max(alpha, 0.0001);

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export function createShadeShell(options: ShellOptions): THREE.Mesh {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.003, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uLight: { value: LIGHT },
        uShadow: { value: new THREE.Color(options.shadow) },
        uShadowAlpha: { value: options.shadowAlpha },
        uOutline: { value: new THREE.Color(options.outline) },
        uOutlineAlpha: { value: options.outlineAlpha },
      },
    })
  );

  // Hovering and clicking go straight through to the pillars
  shell.raycast = () => {};

  return shell;
}
