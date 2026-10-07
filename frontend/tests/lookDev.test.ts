import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ENV, severityColor, THREAT_COLOR, UNCHECKED_COLOR } from "../src/city/palette";
import { getDirLayout, type DirLayout } from "../src/city/layout";
import { CELL_SPREAD } from "../src/components/HeatCells";
import {
  GROUND_RAMP,
  GROUND_AO_DEPTH,
  GROUND_STOPS,
  GROUND_RAMP_GLSL,
  groundAo,
  groundHazeMix,
  groundShade,
  groundDistance,
  groundFrameRadius,
  grownFootprint,
  makeGroundMaterial,
  setGroundFrame,
  type GroundFootprint,
} from "../src/render/ground";
import {
  SKY_STOPS,
  SKY_RADIUS,
  SKY_RAMP_EXPONENT,
  SKY_VERTEX_SHADER,
  SKY_FRAGMENT_SHADER,
  SUN_POSITION,
  skyRamp,
} from "../src/render/sky";

/** WCAG relative luminance, the same measure the HUD guards use. */
function lin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function chromaBlue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return b - r;
}

/**
 * The sky used to be a clear colour equal to the fog colour, so the horizon was
 * one flat band with nothing behind it. These are the contracts the graded dome
 * has to keep — they are about the ramp's endpoints and its determinism, not
 * about a picture anyone liked.
 */
describe("lookDev: graded sky", () => {
  it("starts exactly at the fog colour, or the horizon seam is back", () => {
    expect(SKY_STOPS.horizon).toBe(ENV.fog);
    // The background fill is the fallback for the first frame; a different tone
    // there would flash a seam the dome was meant to remove.
    expect(ENV.skyTop).toBe(ENV.fog);
  });

  it("ramps from the horizon to a zenith that has depth", () => {
    expect(skyRamp(0)).toBe(0);
    expect(skyRamp(1)).toBe(1);
    // Measured on the shipped background, the whole sky was one value. The
    // zenith has to be a full stop below the haze for distance to read at all.
    const ratio = relLum(SKY_STOPS.zenith) / relLum(SKY_STOPS.horizon);
    expect(ratio).toBeLessThanOrEqual(0.75);
    expect(ratio).toBeGreaterThan(0.3);
    // …and cooler, not just darker: a grey ramp would flatten, a sky stacks.
    expect(chromaBlue(SKY_STOPS.zenith)).toBeGreaterThan(chromaBlue(SKY_STOPS.horizon) + 20);
  });

  it("is monotone and front-loaded, so the gradient sits where the eye is", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = skyRamp(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Halfway up the dome has already spent most of the range (0.55 exponent).
    expect(skyRamp(0.5)).toBeGreaterThan(0.5 + SKY_RAMP_EXPONENT * 0.2);
  });

  it("keeps the sun's warmth far away from the alarm channel's saturation", () => {
    // The glow pools warm on purpose — that is what tells you where the sun is.
    // What it may never do is reach the saturation of a finding marker, or
    // "is that haze or is that a finding" is back on the table.
    const spread = (hex: string): number => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(...c) - Math.min(...c);
    };
    for (const hex of [SKY_STOPS.horizon, SKY_STOPS.zenith, SKY_STOPS.sun]) {
      expect(spread(hex), `${hex} is too saturated for sky`).toBeLessThan(90);
    }
    // …and the alarms really are saturated, so the gap is a gap.
    for (const sev of ["P0", "P1", "P2"] as const) {
      expect(spread(severityColor(sev, false))).toBeGreaterThan(150);
    }
  });

  it("renders the same frame twice: no clock, no per-frame writes", () => {
    const sources = [SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER].join("\n");
    expect(sources).not.toMatch(/uTime|elapsedTime|clock|rand\(|noise\(/i);
    const dome = readFileSync(
      path.resolve(import.meta.dirname, "../src/render/SkyDome.tsx"),
      "utf-8",
    );
    expect(dome).not.toContain("useFrame");
  });

  it("compiles under GLSL ES: no bare integer where a float builtin is called", () => {
    // Caught live: `pow(x, 7)` is a type error in GLSL ES 1.00 — there is no
    // implicit int→float — and a failed shader does not throw, it just leaves
    // the old clear colour on screen. Every interpolated constant therefore has
    // to arrive with a decimal point.
    const bad = /\b(?:pow|mix|clamp|max|min|smoothstep|step|length)\([^;]*,\s*\d+\s*\)/;
    for (const src of [SKY_VERTEX_SHADER, SKY_FRAGMENT_SHADER]) {
      expect(bad.test(src), `integer literal in a float builtin:\n${src}`).toBe(false);
    }
    // …and the constants really are the numbers the ramp function claims.
    expect(SKY_FRAGMENT_SHADER).toContain(SKY_RAMP_EXPONENT.toFixed(2));
  });

  it("shares one sun between the light and the atmosphere", () => {
    const scene = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
      "utf-8",
    );
    expect(scene).toContain("SUN_POSITION");
    expect(SUN_POSITION).toEqual([...ENV.sunDirection]);
  });

  it("keeps the shell outside the city's scale without crossing the far plane", () => {
    // The overview flight reaches bounds * 1.6; the shell is pinned to the far
    // plane by the vertex shader, so the radius only has to clear the model.
    expect(SKY_RADIUS).toBeGreaterThanOrEqual(1200);
    expect(SKY_VERTEX_SHADER).toContain("xyww");
  });
});

/**
 * The floor used to be one colour over the whole quad, and the fog saturated
 * everything past the plaza to the haze tone, so most of the frame was one
 * number. These are the contracts of the two ramps that replaced it — above all
 * the one that keeps the far-zoom heat grid honest.
 */
describe("lookDev: graded ground", () => {
  it("leaves the ground under the city exactly at ENV.ground", () => {
    // Inside the built footprint nothing changes, so the number
    // tests/hudLegibility.test.ts measures the calm heat tiles against is still
    // the tone actually under them. Every heat cell of the far-zoom grid lives
    // inside `untouched`.
    for (const d of [0, 0.4, 0.8, GROUND_RAMP.untouched]) {
      expect(groundShade(d), `d=${d}`).toBe(1);
      expect(groundHazeMix(d)).toBe(0);
    }
    expect(GROUND_STOPS.base).toBe(ENV.ground);
    // the calm tiles are dark, so the untouched band is the whole point
    for (const hex of [THREAT_COLOR.safe, UNCHECKED_COLOR]) {
      expect(relLum(hex)).toBeLessThan(relLum(ENV.ground));
    }
  });

  it("shades a plinth around the city and lets go of it again", () => {
    expect(groundAo(GROUND_RAMP.aoPeak)).toBeCloseTo(1, 5);
    expect(groundAo(GROUND_RAMP.aoEnd)).toBe(0);
    expect(groundShade(GROUND_RAMP.aoPeak)).toBeCloseTo(1 - GROUND_AO_DEPTH, 5);
    // a bump, not a step: bounded slope everywhere, so no ring is drawn
    const STEP = 0.01; // a hundredth of the level's half-extent
    let prev = groundAo(0);
    for (let i = 1; i <= Math.ceil((GROUND_RAMP.aoEnd + 1) / STEP); i++) {
      const d = i * STEP;
      const v = groundAo(d);
      expect(Math.abs(v - prev), `slope at d=${d.toFixed(2)}`).toBeLessThan(0.1);
      prev = v;
    }
    // and the shade is bounded: it never takes the ground below the ratio the
    // heat-cell guard insists on for the weakest tile
    const worst = relLum(ENV.ground) * (1 - GROUND_AO_DEPTH);
    const unchecked = relLum(UNCHECKED_COLOR);
    const ratio = (Math.max(worst, unchecked) + 0.05) / (Math.min(worst, unchecked) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(2.5);
  });

  it("climbs to the fog colour and never past it", () => {
    expect(groundHazeMix(GROUND_RAMP.hazeEnd)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const v = groundHazeMix((i / 200) * (GROUND_RAMP.hazeEnd + 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    // The rim has to END on the horizon's value or the plane keeps an edge.
    expect(GROUND_STOPS.rise).toBe(ENV.fog);
    expect(ENV.fog).toBe(SKY_STOPS.horizon);
  });

  it("drives one ramp in GLSL and in TypeScript", () => {
    // The shader is the picture; if its constants drift from the ones the tests
    // reason about, every pixel measurement silently describes something else.
    for (const v of Object.values(GROUND_RAMP)) {
      expect(GROUND_RAMP_GLSL, String(v)).toContain(v.toFixed(2));
    }
    expect(GROUND_RAMP_GLSL).not.toMatch(
      /\b(?:pow|mix|clamp|max|min|smoothstep|step|distance)\([^;]*,\s*\d+\s*\)/,
    );
    const glslAo = (d: number): number => {
      const R = GROUND_RAMP;
      const ss = (a: number, b: number, x: number): number => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      if (d <= R.untouched || d >= R.aoEnd) return 0;
      if (d < R.aoPeak) return ss(R.untouched, R.aoPeak, d);
      return 1 - ss(R.aoPeak, R.aoEnd, d);
    };
    for (const d of [0, 0.9, 0.95, 1.0, 1.15, 1.6, 2.2, 3]) {
      expect(glslAo(d)).toBeCloseTo(groundAo(d), 10);
    }
  });

  it("grades a lit material instead of replacing it", () => {
    // An unlit custom shader would buy the gradient by throwing away the
    // hemisphere light, the key light and the landmark's warm pool.
    const material = makeGroundMaterial();
    expect(typeof material.onBeforeCompile).toBe("function");
    expect(material.isMeshStandardMaterial).toBe(true);
    expect(material.roughness).toBeGreaterThan(0.9);
    // one program for every level, so drilling in does not recompile the floor
    expect(material.customProgramCacheKey!()).toBe(material.customProgramCacheKey!());
    expect(String(material.onBeforeCompile)).toContain("color_fragment");
    material.dispose();
  });
});

/**
 * The heat grid of the far zoom is the one place where a ground tone is a
 * legibility contract and not a mood (`DUSK_LIFT`, `tests/hudLegibility.test.ts`).
 * The ramp is only honest while no cell stands on graded ground, and that is a
 * fact about the layout — so it is checked against real layouts, in the level's
 * own metric, with the cell's own extent rather than the plot under it.
 */
describe("lookDev: the ramp never reaches the heat cells", () => {
  function file(id: string, path: string, lines: number, findings: number) {
    return {
      id,
      name: path.split("/").pop() ?? path,
      path,
      language: "TypeScript",
      linesOfCode: lines,
      cyclomaticComplexity: 4 + findings,
      threatLevel: findings > 0 ? ("critical" as const) : ("safe" as const),
      findings: Array.from({ length: findings }, (_, i) => ({
        type: "CMD_INJECTION",
        severity: "P0" as const,
        line: i + 1,
        message: "x",
      })),
    };
  }
  /** A directory node, shaped like the payloads the backend sends. */
  type DirNode = Record<string, unknown>;
  function dir(
    name: string,
    path: string,
    files: number,
    lines: number,
    children: DirNode[] = [],
  ): DirNode {
    const detailFiles = Array.from({ length: files }, (_, i) =>
      file(`${path}/${i}`, `${path}/f${i}.ts`, lines, i === 0 ? 2 : 0),
    );
    return {
      name,
      path,
      fileCount: files,
      linesOfCode: files * lines,
      languages: { TypeScript: files * lines },
      findingsBySeverity: { P0: files ? 1 : 0, P1: 0, P2: 0 },
      threatScore: 5,
      topFindings: detailFiles[0]?.findings ?? [],
      children,
      detailFiles,
      remainingFiles: 0,
      districtFiles: detailFiles,
    };
  }
  function city(root: DirNode): never {
    return {
      repo: { owner: "o", name: "n", branch: "main" },
      totalFiles: 40,
      renderedFiles: 40,
      totalLines: 20000,
      findingsBySeverity: { P0: 8, P1: 0, P2: 0 },
      languages: { TypeScript: 20000 },
      tree: root,
      fileConnections: [],
      dirConnections: [],
      meta: {
        churn: false,
        deadCode: false,
        duplicates: false,
        cycles: false,
        coverage: false,
        blame: false,
      },
    } as never;
  }

  /** The rectangles the far zoom actually draws on the floor. */
  function cells(layout: DirLayout): GroundFootprint[] {
    return [
      ...layout.buildings.map((b) => grownFootprint(b, CELL_SPREAD.building)),
      ...layout.blocks.map((b) => grownFootprint(b, CELL_SPREAD.block)),
    ];
  }

  /** The same corner measured three ways: the level's square about the cell
      field (what the ramp uses), the radius it must not use, and the square
      about `layout.bounds` (the ruler it used to be aimed with). */
  function corners(layout: DirLayout) {
    const field = groundFrameRadius(cells(layout), layout.centre);
    let byField = 0;
    let byRadius = 0;
    let byBounds = 0;
    for (const f of cells(layout))
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const dx = f.x + (sx * f.w) / 2 - layout.centre.x;
          const dz = f.z + (sz * f.d) / 2 - layout.centre.z;
          byField = Math.max(byField, groundDistance(dx, dz) / field);
          byRadius = Math.max(byRadius, Math.hypot(dx, dz) / field);
          byBounds = Math.max(byBounds, groundDistance(dx, dz) / layout.bounds);
        }
    return { field, byField, byRadius, byBounds };
  }

  const small = city(
    dir("", "", 9, 400, [
      dir("a", "a", 6, 900),
      dir("b", "b", 6, 700),
      dir("c", "c", 6, 500),
      dir("d", "d", 4, 300),
      dir("e", "e", 3, 200),
      dir("f", "f", 2, 150),
    ]),
  );
  // A flat package: its own files fill the plaza, sixteen sub-directories ring
  // it. This is the shape that makes the level wide, and width is what moved the
  // old `bounds` ruler out of the promise.
  const wide = city(
    dir(
      "",
      "",
      900,
      250,
      Array.from({ length: 16 }, (_, i) => dir(`p${i}`, `p${i}`, 20, 600)),
    ),
  );

  it("keeps every cell on untouched ground, at any size of level", () => {
    for (const [label, root] of [
      ["40-file level", small],
      ["1240-file level", wide],
    ] as const) {
      for (const focus of [[], ["a"], ["p0"], ["p0", "f0"]] as string[][]) {
        const layout = getDirLayout(root, focus);
        const c = corners(layout);
        expect(c.byField, `${label} @ ${focus.join("/")}: no cell count`).toBeGreaterThan(0);
        expect(
          c.byField,
          `${label} @ ${focus.join("/")}: a cell at d=${c.byField.toFixed(3)} would stand on graded ground`,
        ).toBeLessThanOrEqual(GROUND_RAMP.untouched);
        // The promise itself: nothing of the drawn city sees a graded floor.
        expect(groundShade(c.byField)).toBe(1);
        expect(groundHazeMix(c.byField)).toBe(0);
      }
    }
  });

  it("is the level's own square that holds the cells, not the radius", () => {
    // Same corners, same ruler, one metric swap: measured on the 40-file level
    // the radius puts a cell corner at 1.36 of the band promised to end at 1.
    for (const root of [small, wide]) {
      const layout = getDirLayout(root, []);
      const c = corners(layout);
      expect(c.byRadius).toBeGreaterThan(GROUND_RAMP.untouched);
      expect(c.byField).toBeLessThanOrEqual(GROUND_RAMP.untouched);
    }
  });

  it("cannot be aimed at layout.bounds, whose margin is a fixed distance", () => {
    // `levelFrame` adds a 12-unit street margin to the half-extent, so a corner
    // as a fraction of `bounds` climbs with the size of the level and no single
    // constant can be both honest and tight: 0.906 on the small level, 0.966 on
    // the wide one — past the 0.95 the first version of this ramp promised.
    const smallCorners = corners(getDirLayout(small, []));
    const wideCorners = corners(getDirLayout(wide, []));
    expect(wideCorners.byBounds).toBeGreaterThan(smallCorners.byBounds);
    expect(wideCorners.byBounds).toBeGreaterThan(0.95);
    // Aimed at the cells instead, both are the same number: the rim, exactly.
    expect(smallCorners.byField).toBeCloseTo(GROUND_RAMP.untouched, 10);
    expect(wideCorners.byField).toBeCloseTo(GROUND_RAMP.untouched, 10);
    // and the field really is inside the level's square, so the plinth that
    // starts at its rim is still on screen in an overview shot.
    const wideLayout = getDirLayout(wide, []);
    expect(wideCorners.field).toBeLessThan(wideLayout.bounds);
    expect(wideCorners.field / wideLayout.bounds).toBeGreaterThan(0.85);
  });

  it("is aimed at the cell field by the scene, with the scene's own spread", () => {
    const scene = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
      "utf-8",
    );
    expect(scene).toContain("groundFrameRadius");
    expect(scene).not.toMatch(/setGroundFrame\([^)]*\bbounds\b/);
    // The cells must be drawn with the spread the promise measures, or the two
    // drift apart and the promise is about a picture that does not exist.
    const heat = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/HeatCells.tsx"),
      "utf-8",
    );
    const scales = heat.match(/dummy\.scale\.set\([^;]+\);/g) ?? [];
    expect(scales).toHaveLength(2);
    expect(scales[0]).toContain("CELL_SPREAD.building");
    expect(scales[1]).toContain("CELL_SPREAD.block");
  });

  it("grows a footprint the way the grid does, and not the shader's geometry", () => {
    // groundFrameRadius is a Chebyshev half-extent about the given centre: a
    // single unit at the centre measures half its side, and moving it out moves
    // the ruler with it — the empty level falls back instead of dividing by 0.
    expect(groundFrameRadius([{ x: 0, z: 0, w: 10, d: 10 }], { x: 0, z: 0 })).toBe(5);
    expect(groundFrameRadius([{ x: 30, z: 0, w: 10, d: 10 }], { x: 0, z: 0 })).toBe(35);
    expect(groundFrameRadius([], { x: 0, z: 0 })).toBe(60);
    expect(grownFootprint({ x: 1, z: 2, w: 10, d: 4 }, 2)).toEqual({ x: 1, z: 2, w: 20, d: 8 });
    const material = makeGroundMaterial();
    setGroundFrame(material, { x: 7, z: -3 }, 120);
    const u = material.userData.uniforms as {
      uGroundCentre: { value: { x: number; z: number } };
      uGroundRadius: { value: number };
    };
    expect(u.uGroundCentre.value.x).toBe(7);
    expect(u.uGroundRadius.value).toBe(120);
    setGroundFrame(material, { x: 0, z: 0 }, 0);
    expect(u.uGroundRadius.value).toBe(1);
    material.dispose();
  });
});

describe("lookDev: one sky in both quality paths", () => {
  const app = readFileSync(path.resolve(import.meta.dirname, "../src/App.tsx"), "utf-8");
  const composer = app.slice(app.indexOf("<EffectComposer"), app.indexOf("</EffectComposer>"));

  it("tone maps the composer path, or the atmosphere changes with the setting", () => {
    // `<EffectComposer>` renders the scene with the renderer's own tone mapping
    // switched off, so the full-quality path showed the city un-tone-mapped:
    // the upper sky measured 202,223,239 with the composer against 211,219,224
    // in gfxLite — a 15-level shift in the atmosphere, on the same palette, from
    // a graphics preference that is only supposed to cost bloom and pixels.
    // With the effect back both paths land within 0.1 of each other.
    expect(composer.length, "no composer block found").toBeGreaterThan(10);
    expect(composer, "the composer lost its ToneMapping effect").toContain("<ToneMapping");
    expect(composer).toContain("ToneMappingMode.ACES_FILMIC");
  });

  it("keeps the bloom outside the atmosphere it is supposed to leave alone", () => {
    // Bloom stays, and it stays the only difference the preference makes.
    expect(composer).toContain("<Bloom");
    expect(composer.indexOf("<Bloom")).toBeLessThan(composer.indexOf("<ToneMapping"));
  });
});
