/**
 * The ground — value structure instead of one flat sheet.
 *
 * The plane the city stands on was a single 1200 x 1200 quad in one colour, and
 * the scene's fog saturates everything beyond the plaza to the haze tone anyway,
 * so most of the frame was literally one number: measured 220.55 from the city's
 * edge to the rim of the quad, against an albedo of 183 — the light sum was
 * lifting the floor thirty-five levels above its own material, and a city on a
 * floor with no value structure reads as a decal floating over paper, which is
 * what the overview shots showed.
 *
 * Two ramps, both a function of the distance from the level's centre and
 * nothing else:
 *
 * 1. `groundAo` — the mass of the city shades the ground around it. This is
 *    ambient occlusion, radially symmetric on purpose: it makes no claim about
 *    where the sun's cast shadow falls, which would need a shadow map and the
 *    buildings' cooperation (`castShadow` lives in another lane's file).
 * 2. `groundHazeMix` — the open ground beyond that goes to the fog colour, so
 *    the quad's rim arrives at exactly the horizon's value and stops being an
 *    edge. Because the built-in fog mixes toward the same colour, the two can
 *    only converge: no double haze, no overshoot, no seam.
 *
 * Which way that convergence runs is the atmosphere's business, not the ramp's.
 * The current daylight palette lets open ground rise gently toward a lighter
 * horizon; the streets and architecture carry the stronger value contrast.
 *
 * The ramp deliberately does NOT touch the ground the city is drawn on
 * (`GROUND_RAMP.untouched`): that is the band the far-zoom heat grid sits on,
 * and `tests/hudLegibility.test.ts` measures the calm tiles against `ENV.ground`.
 * Shading under the city would have quietly broken that guard's intent while
 * leaving its hex arithmetic green: the calmest heat levels would sit on a
 * different tone than the one the contrast test measured.
 *
 * Two decisions make that promise hold instead of merely scoring green:
 *
 * — **The metric.** `layout.bounds` is a Chebyshev half-extent, the side of the
 *   square every flight, the minimap and the far-LOD threshold are sized by.
 *   Grading the floor by Euclidean radius lets a level's corners poke through
 *   the untouched band: measured over every level of the 236-file city, the
 *   furthest cell corner sits at 1.000 of the square and at 1.411 of the radius.
 *   So the ramp counts the same square the layout does — see `groundDistance`.
 * — **The ruler.** `bounds` is not what covers the ground. It carries the
 *   layout's 12-unit street margin, and the far-zoom cells are drawn 1.55x /
 *   1.35x wider than the plot they stand on. Normalised by `bounds` the
 *   untouched band therefore drifts with the size of the level: measured over
 *   every level of the shipped cities the worst cell corner sits at 0.884 (the
 *   73-file demo) to 0.910 (236 files), but at 0.966 on a wide 1240-file level in
 *   the shipped voronoi mode and 0.976 in the legacy grid one. On those levels
 *   real cells stood on shaded ground — up to 1.1 % of the floor's albedo taken
 *   away under the outermost tiles — while the guard claimed none could. The ramp
 *   is aimed at `groundFrameRadius` instead: the Chebyshev half-extent of the
 *   cells themselves, so the band ends exactly where the drawn city ends, at any
 *   level size, and `untouched = 1` is a construction and not a headroom.
 *
 * Deterministic by construction: no clock, no noise, no texture fetch.
 */

import * as THREE from "three";
import { ENV } from "../city/palette";
import { surfacePoint, type WorldSurface } from "../city/worldSurface";

/** A real surface, so normals, shadows and the city's anchors agree.
 * Large-radius views use a sampled cap; a sufficiently curved world gets a
 * complete sphere with a visible horizon. Both have a fixed geometry budget. */
export function makeSurfaceGroundGeometry(surface: WorldSurface): THREE.BufferGeometry {
  if (surface.strength > 0 && surface.radius <= 1200) {
    return new THREE.SphereGeometry(surface.radius, 96, 48).translate(
      surface.centre.x,
      -surface.radius - 0.05,
      surface.centre.z,
    );
  }
  const diameter = Math.max(1200, surface.extent * 2.6);
  const geometry = new THREE.PlaneGeometry(
    diameter,
    diameter,
    surface.strength > 0 ? 96 : 1,
    surface.strength > 0 ? 96 : 1,
  ).rotateX(-Math.PI / 2);
  geometry.translate(surface.centre.x, 0, surface.centre.z);
  const positions = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    surfacePoint(surface, positions.getX(i), -0.05, positions.getZ(i), point);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export const GROUND_RAMP = {
  /** Up to this multiple of the cell field's half-extent the ground is
      untouched. Every heat cell of the far-zoom grid lives inside it, because
      the ruler is that grid's own extent — see the note above. */
  untouched: 1,
  /** The city's shading of its own surroundings peaks just outside that … */
  aoPeak: 1.2,
  /** … and is gone by here. */
  aoEnd: 2.25,
  /** Where the open ground starts climbing to the haze … */
  hazeStart: 1.5,
  /** … and where it has become the haze. */
  hazeEnd: 3.2,
} as const;

/** How much of the ground's albedo the city's ambient occlusion takes away. */
export const GROUND_AO_DEPTH = 0.16;

/**
 * The two stops of the floor's ramp, as hex.
 *
 * `base` is the shipped asphalt and it is what stands under the city, so
 * `tests/hudLegibility.test.ts` still describes the picture; `rise` is the fog,
 * which is what lets the plane's rim meet the horizon without an edge.
 */
export const GROUND_STOPS = { base: ENV.ground, rise: ENV.fog } as const;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * How far out a point is, in the level's OWN metric.
 *
 * `layout.bounds` is a Chebyshev half-extent — the side of the square every
 * flight, the minimap and the far-LOD threshold are sized by. Grading the ground
 * by Euclidean radius instead lets the corners of a level poke through the band
 * that is promised to be untouched: measured over every level of the 236-file
 * city, the furthest cell corner sits at 1.000 of the square and at 1.411 of the
 * radius, so the ramp counts the same square the layout does.
 */
export function groundDistance(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz));
}

/** Something that stands on the floor: a placed rectangle in world XZ. */
export type GroundFootprint = { x: number; z: number; w: number; d: number };

/**
 * A plot grown into the body drawn on it.
 *
 * The far-zoom heat cell is wider than the file it represents (`CELL_SPREAD` in
 * `components/HeatCells`), so the ground it covers is the grown rectangle and
 * not the plot. A promise about "the ground under the city" that measures the
 * plot is a promise about nothing that is on screen.
 */
export function grownFootprint(rect: GroundFootprint, spread: number): GroundFootprint {
  return { x: rect.x, z: rect.z, w: rect.w * spread, d: rect.d * spread };
}

/**
 * The ruler the ramp is aimed with: the Chebyshev half-extent of everything
 * drawn on the floor, measured about the level's own centre.
 *
 * Its corners are by construction the furthest ground any of those bodies
 * covers, which is what makes `GROUND_RAMP.untouched = 1` hold at every level
 * size instead of only at the one size a test happens to build.
 */
export function groundFrameRadius(
  footprints: readonly GroundFootprint[],
  centre: { x: number; z: number },
  fallback = 60,
): number {
  if (footprints.length === 0) return fallback;
  let r = 0;
  for (const f of footprints) {
    const hw = f.w / 2;
    const hd = f.d / 2;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        r = Math.max(r, groundDistance(f.x + sx * hw - centre.x, f.z + sz * hd - centre.z));
  }
  return Math.max(1, r);
}

/** 0 in the open, 1 at the peak of the city's shade. */
export function groundAo(normalisedDistance: number): number {
  const d = Math.max(0, normalisedDistance);
  if (d <= GROUND_RAMP.untouched) return 0;
  if (d >= GROUND_RAMP.aoEnd) return 0;
  if (d < GROUND_RAMP.aoPeak) return smoothstep(GROUND_RAMP.untouched, GROUND_RAMP.aoPeak, d);
  return 1 - smoothstep(GROUND_RAMP.aoPeak, GROUND_RAMP.aoEnd, d);
}

/**
 * 0 on the city's own asphalt, 1 out in the haze.
 *
 * The ramp itself — the shader applies it unchanged.
 */
export function groundHazeMix(normalisedDistance: number): number {
  return smoothstep(GROUND_RAMP.hazeStart, GROUND_RAMP.hazeEnd, Math.max(0, normalisedDistance));
}

/** The albedo multiplier the shade applies at a normalised distance. */
export function groundShade(normalisedDistance: number): number {
  return 1 - GROUND_AO_DEPTH * groundAo(normalisedDistance);
}

/**
 * The GLSL twin of the two ramps above.
 *
 * Kept as an exported string so the tests can pin its constants against the
 * TypeScript ones: the shader is the picture, and a ramp that only exists in one
 * of the two is a measurement of nothing.
 */
export const GROUND_RAMP_GLSL = /* glsl */ `
  float groundRampSmoothstep(float e0, float e1, float x) {
    float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
  // The level's own square metric — see groundDistance().
  float groundDistanceAt(vec2 xz, vec2 centre) {
    vec2 o = abs(xz - centre);
    return max(o.x, o.y);
  }
  float groundAoAt(float d) {
    if (d <= ${GROUND_RAMP.untouched.toFixed(2)} || d >= ${GROUND_RAMP.aoEnd.toFixed(2)}) return 0.0;
    if (d < ${GROUND_RAMP.aoPeak.toFixed(2)})
      return groundRampSmoothstep(${GROUND_RAMP.untouched.toFixed(2)}, ${GROUND_RAMP.aoPeak.toFixed(2)}, d);
    return 1.0 - groundRampSmoothstep(${GROUND_RAMP.aoPeak.toFixed(2)}, ${GROUND_RAMP.aoEnd.toFixed(2)}, d);
  }
  float groundHazeAt(float d) {
    return groundRampSmoothstep(${GROUND_RAMP.hazeStart.toFixed(2)}, ${GROUND_RAMP.hazeEnd.toFixed(2)}, d);
  }
`;

/**
 * The ground's material: a lit standard surface whose albedo is graded by
 * distance. Patched rather than replaced, so the plane keeps answering the
 * hemisphere light, the key light and the landmark's warm pool — an unlit custom
 * shader would have thrown all of that away to gain a gradient.
 */
export function makeGroundMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(GROUND_STOPS.base),
    roughness: 0.96,
    metalness: 0.02,
  });
  const uniforms = {
    uGroundBase: { value: new THREE.Color(GROUND_STOPS.base) },
    uGroundRise: { value: new THREE.Color(GROUND_STOPS.rise) },
    uGroundCentre: { value: new THREE.Vector2(0, 0) },
    uGroundRadius: { value: 60 },
    uGroundAoDepth: { value: GROUND_AO_DEPTH },
    uGroundHazeCeiling: { value: 1 },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "varying vec2 vGroundXZ;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvGroundXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;",
      );
    shader.fragmentShader =
      "varying vec2 vGroundXZ;\nuniform vec3 uGroundBase;\nuniform vec3 uGroundRise;\nuniform vec2 uGroundCentre;\nuniform float uGroundRadius;\nuniform float uGroundAoDepth;\nuniform float uGroundHazeCeiling;\n" +
      GROUND_RAMP_GLSL +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "\tfloat groundD = groundDistanceAt( vGroundXZ, uGroundCentre ) / max( uGroundRadius, 1.0 );",
          "\tfloat groundAo = groundAoAt( groundD );",
          "\tfloat groundHaze = groundHazeAt( groundD ) * uGroundHazeCeiling;",
          "\tdiffuseColor.rgb = mix( uGroundBase, uGroundRise, groundHaze );",
          "\tdiffuseColor.rgb *= 1.0 - uGroundAoDepth * groundAo;",
        ].join("\n"),
      );
  };
  // One program for every level: only uniform values change between cities, so
  // the shader is compiled once per session instead of once per drill-in.
  material.customProgramCacheKey = (): string => "cityGroundRamp";
  return material;
}

/** Aim the ramp at the level that is actually on screen. */
export function setGroundFrame(
  material: THREE.MeshStandardMaterial,
  centre: { x: number; z: number },
  radius: number,
  curvatureStrength = 0,
): void {
  const u = material.userData.uniforms as
    | {
        uGroundCentre: { value: THREE.Vector2 };
        uGroundRadius: { value: number };
        uGroundHazeCeiling: { value: number };
      }
    | undefined;
  if (!u) return;
  u.uGroundCentre.value.set(centre.x, centre.z);
  // The radius is `groundFrameRadius()` of the level — the extent of what is
  // drawn on the floor, not `layout.bounds`, which carries a street margin and
  // would move the untouched band with the size of the level.
  u.uGroundRadius.value = Math.max(1, radius);
  // Flat land dissolves into its horizon. A globe retains a calm visible rim.
  u.uGroundHazeCeiling.value = 1 - Math.max(0, Math.min(1, curvatureStrength)) * 0.45;
}
