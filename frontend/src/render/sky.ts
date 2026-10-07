/**
 * The sky — a graded dome, not a clear colour.
 *
 * The world used to be painted with `<color attach="background">` set to
 * exactly the fog colour. That is the cheapest possible atmosphere and it has
 * one visible flaw: the distance where the ground plane dissolves into haze and
 * the sky above it are the SAME value, so the horizon reads as one flat band
 * with no depth behind it, and any camera that sees past the plane sees a
 * studio cyc instead of a sky.
 *
 * This module holds the ramp as data so it can be measured without a GPU:
 * `skyRamp()` is the same formula the fragment shader evaluates, and the tests
 * assert its endpoints against `ENV` — the seam contract (ramp(0) === the fog
 * colour the ground fades to) is the whole reason the horizon stops being a
 * stripe.
 *
 * Nothing here is time-dependent: no uniform changes per frame, no noise. The
 * dome is a static gradient fixed to view elevation, so it renders the same
 * picture twice in a row, which is what the pixel measurements rely on.
 */

import { ENV } from "../city/palette";

/**
 * Radius of the dome, in world units. The shell is drawn at the far plane
 * (`gl_Position.xyww`), so this number only sets how much of the sphere is left
 * of the eye — the gradient itself is evaluated from the eye, which is what
 * keeps it from sliding across the frame when the camera flies. 1200 clears the
 * furthest overview shot the layout can ask for.
 */
export const SKY_RADIUS = 1200;

/** Sphere tessellation — 16 x 8 rings is ~250 triangles for the whole sky. */
export const SKY_SEGMENTS: readonly [number, number] = [24, 12];

/**
 * Easing of the elevation ramp. `0.55` front-loads the change: most of the
 * visible gradient happens in the first degrees above the horizon, which is
 * where the atmosphere actually does its work and where the city's silhouette
 * sits. A linear ramp would spend the range on the zenith nobody looks at.
 */
export const SKY_RAMP_EXPONENT = 0.55;

/** How tight the sun's glow is around the key-light azimuth (Pow exponent). */
export const SKY_SUN_CONCENTRATION = 7;

/** Peak added brightness of the sun glow, in working (linear) space. */
export const SKY_SUN_GAIN = 0.12;

/**
 * How far below the horizon the sun's pool is allowed to reach.
 *
 * Without this falloff the glow kept adding light to view directions that point
 * INTO the ground, which washed the whole upper frame toward white and undid the
 * depth the ramp exists to create. The glow is a sky phenomenon; at and below
 * the horizon it is gone.
 *
 * Opened and left open: the row the eye reads as "the sky at the horizon" measures
 * 247.79 with the post stack on and 231.02 in gfxLite, while the frame's own
 * background fill reads 220.55 in both. Neither number is produced by this fade —
 * moving its lower edge to the horizon line changed the measurement by nothing at
 * all — so the gap is not the glow's but the dome's output path disagreeing with
 * the built-in materials' about who encodes the sky, which needs `App.tsx`'s
 * `<EffectComposer>` block and this shader settled together.
 */
export const SKY_SUN_HORIZON_FADE: readonly [number, number] = [-0.02, 0.16];

/** The ramp, 0 at the horizon and 1 at the zenith. Mirrored in GLSL below. */
export function skyRamp(elevation: number): number {
  const e = Math.max(0, Math.min(1, elevation));
  return Math.pow(e, SKY_RAMP_EXPONENT);
}

/**
 * The three stops, as hex. Kept here (and not inline in the shader) so
 * `tests/lookDev.test.ts` can pin the seam: the horizon stop MUST be the fog
 * colour, or the graded sky reintroduces the stripe it replaces.
 */
export const SKY_STOPS = {
  /** Where the ground plane fades out. Equals the fog — that is the contract. */
  horizon: ENV.fog,
  /** Straight up: cooler and a full stop darker, so distance has somewhere to go. */
  zenith: ENV.skyZenith,
  /** The key light's own family, pooled just around the sun azimuth. */
  sun: ENV.skySun,
} as const;

/** Direction of the scene's key light, normalised — the glow pools here. */
export const SKY_SUN_DIRECTION: readonly [number, number, number] = (() => {
  const [x, y, z] = ENV.sunDirection;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
})();

/**
 * Where the scene's sun stands. The key light is placed FROM this and the sky
 * glows TOWARD it, so the highlight in the atmosphere and the shading on the
 * facades can never disagree.
 */
export const SUN_POSITION: [number, number, number] = [
  ENV.sunDirection[0],
  ENV.sunDirection[1],
  ENV.sunDirection[2],
];

export const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vViewDir;
  void main() {
    // The gradient is a function of the VIEW direction, not of the point on the
    // shell: an eye-centred direction is what stops the ramp from sliding
    // across the frame while the camera flies.
    vec4 world = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(world.xyz - cameraPosition);
    vec4 projected = projectionMatrix * viewMatrix * world;
    // Pin the shell to the far plane (z = w after the divide) so it is never
    // clipped by zoom, and always drawn behind the city instead of through it.
    gl_Position = projected.xyww;
  }
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vViewDir;

  void main() {
    vec3 dir = normalize(vViewDir);
    // Same ramp as skyRamp(): pow(clamp(elev, 0.0, 1.0), 0.55).
    float t = pow(clamp(max(dir.y, 0.0), 0.0, 1.0), ${SKY_RAMP_EXPONENT.toFixed(2)});
    vec3 sky = mix(uHorizon, uZenith, t);
    // A broad, weak pool toward the key light. Kept additive and small so the
    // look stays a daylight architectural model rather than a sunset.
    float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), ${SKY_SUN_CONCENTRATION.toFixed(1)});
    // A sky phenomenon only: the pool fades out across the horizon line, or it
    // would wash the ground the camera looks at most of the time.
    float aboveHorizon = smoothstep(${SKY_SUN_HORIZON_FADE[0].toFixed(2)}, ${SKY_SUN_HORIZON_FADE[1].toFixed(2)}, dir.y);
    sky += uSun * sun * aboveHorizon * ${SKY_SUN_GAIN.toFixed(2)};
    gl_FragColor = vec4(sky, 1.0);
    // The same output path every built-in material takes: identity when the
    // post stack renders into a linear target, tone mapped and encoded when it
    // draws straight to the canvas (gfxLite). Anything else would make the sky
    // change value with the graphics preference.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
