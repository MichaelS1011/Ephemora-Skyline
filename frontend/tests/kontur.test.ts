// @vitest-environment node
/**
 * MASTER-2027 Zielbild #10 (Z-03) — the chosen tower carries its own contour.
 *
 * The step replaces the circular selection ring with a band at the roof line
 * and a band around the footprint, each drawn as casing plus core. Four things
 * make that a marker rather than paint, and each is held here:
 *
 *   1. it stands on EVERY surface it can be seen against — the gold alone
 *      clears the 2.5:1 world floor on 12 of the 44 surfaces in the palette,
 *      so the framed pair has to, and the pair is what the reader sees;
 *   2. it is thick enough to survive the size band the residents are held to
 *      (19.053–28.579 px per world unit), at the far end as well as the near,
 *      and on the ground where the view squashes a flat band by sin(0.68);
 *   3. it costs nothing the city did not already pay — one mesh where the ring
 *      was one mesh, no new instance, no new colour, no new hex;
 *   4. it belongs to the selection alone, and its ground annulus tiles without
 *      overlapping itself, because overlapping transparent quads darken their
 *      own corners.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import * as THREE from "three";
import { BUILDING_SELECTION, ENV, LANGUAGE_COLORS } from "../src/city/palette";
import { contrast } from "./colourMath";
import { SELECTION_CONTOUR, selectionContourGeometry } from "../src/city/selectionContour";

const BUILDING = readFileSync(new URL("../src/components/Building.tsx", import.meta.url), "utf-8");

/** The four surfaces a band can lie on: every facade tone and every ENV ink. */
const FLAECHEN: Array<[string, string]> = [
  ...Object.entries(LANGUAGE_COLORS).map(([k, v]) => [`facade ${k}`, v] as [string, string]),
  ...Object.entries(ENV)
    .filter(([, v]) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v as string))
    .map(([k, v]) => [k, v as string] as [string, string]),
];

function attrs(geo: THREE.BufferGeometry): { pos: Float32Array; col: Float32Array } {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = geo.getAttribute("color") as THREE.BufferAttribute;
  expect(pos, "the contour carries positions").toBeDefined();
  expect(col, "one geometry carries casing and core, so colour is per vertex").toBeDefined();
  return { pos: pos.array as Float32Array, col: col.array as Float32Array };
}

describe("the contour stands on every surface in the city", () => {
  it("frames the gold with the casing ink so no surface loses both edges", () => {
    expect(FLAECHEN.length).toBeGreaterThanOrEqual(40);
    for (const [name, surface] of FLAECHEN) {
      const core = contrast(BUILDING_SELECTION, surface);
      const casing = contrast(ENV.arcCasing, surface);
      // The weaker of the two edges is what the reader gets on a good day: the
      // core always sits on the casing, so at least one of the two touches the
      // surface at full strength.
      expect(Math.max(core, casing), `contour against ${name}`).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("keeps the core clear of its own casing", () => {
    // The arc rule: a core that touches its frame has to clear three to one on
    // the frame, or the frame reads as dirt rather than as an edge.
    expect(contrast(BUILDING_SELECTION, ENV.arcCasing)).toBeGreaterThanOrEqual(3);
  });

  it("adds no colour and no hex to the world", () => {
    const module = readFileSync(
      new URL("../src/city/selectionContour.ts", import.meta.url),
      "utf-8",
    );
    expect(module.match(/#[0-9a-fA-F]{3,8}/g) ?? [], "no literal colour in the builder").toEqual(
      [],
    );
    expect(module).toContain("ENV.arcCasing");
    expect(module).toContain("BUILDING_SELECTION");
  });
});

describe("the band is thick enough at every scale it is seen at", () => {
  // `ephe-readability.test.ts` measures 19.053 px per world unit across a 20 px
  // resident and 28.579 px across a 30 px one. The contour is not drawn on a
  // resident, though: measured on the plate (`kontur-messung.json`) the demo's
  // parked overview puts 51 px across the 4-unit face of a mid-rise tower, so
  // the world runs at 12.75 px per unit where the roof band sits. That is the
  // scale the band has to survive, and it is a third of the one the residents
  // are held at. A flat band is seen shorter again, at sin(0.68).
  const NAH = 28.579;
  const FERN = 19.053;
  const BETRIEBSMASS = 12.75;
  const SQUASH = Math.sin(0.68);
  const { roofCasing, roofCore, footCasing, footCore } = SELECTION_CONTOUR;
  const rand = (roofCasing - roofCore) / 2;
  const randFuß = (footCasing - footCore) / 2;

  it("paints the roof core at three pixels on the plate, not on paper", () => {
    expect(roofCore * BETRIEBSMASS).toBeGreaterThanOrEqual(3);
    expect(roofCore * FERN).toBeGreaterThanOrEqual(3);
    expect(roofCore * NAH).toBeGreaterThanOrEqual(3);
  });

  it("leaves the roof frame two pixels of casing on each side of the core", () => {
    // One pixel of casing does not carry its edge: measured, the gold then sits
    // directly on the facade at 2,1:1 and the frame is decoration.
    expect(rand * BETRIEBSMASS).toBeGreaterThanOrEqual(2);
    expect(roofCasing).toBeGreaterThan(roofCore);
  });

  it("paints the foot band after the view has squashed it", () => {
    expect(footCore * BETRIEBSMASS * SQUASH).toBeGreaterThanOrEqual(3);
    expect(footCore * FERN * SQUASH).toBeGreaterThanOrEqual(3);
    expect(randFuß * BETRIEBSMASS * SQUASH).toBeGreaterThanOrEqual(2);
    // The band must not swallow the plot it lies on.
    expect(footCasing).toBeLessThan(1.2);
  });
});

describe("the geometry", () => {
  const geo = () => selectionContourGeometry(4, 3, 12)!;

  it("draws sixteen quads and nothing else", () => {
    const { pos } = attrs(geo());
    // 4 parts × 4 faces × 2 triangles × 3 vertices, eighteen floats a quad.
    expect(pos.length / 18).toBe(16);
    for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]), `vertex ${i}`).toBe(true);
  });

  it("colours every vertex with one of the two inks and no other", () => {
    const { col } = attrs(geo());
    const gold = new THREE.Color(BUILDING_SELECTION);
    const casing = new THREE.Color(ENV.arcCasing);
    const same = (a: THREE.Color, b: THREE.Color): boolean =>
      Math.abs(a.r - b.r) < 1e-6 && Math.abs(a.g - b.g) < 1e-6 && Math.abs(a.b - b.b) < 1e-6;
    let cores = 0;
    let casings = 0;
    for (let i = 0; i < col.length; i += 3) {
      const c = new THREE.Color(col[i]!, col[i + 1]!, col[i + 2]!);
      if (same(c, gold)) cores++;
      else if (same(c, casing)) casings++;
      else expect.fail(`a third colour at vertex ${i / 3}`);
    }
    // Half the band is frame, half is core — a contour with no core is a shadow.
    expect(cores).toBe(casings);
    expect(cores).toBe(48);
  });

  it("puts one band at the roof line and one on the plaza", () => {
    const { pos } = attrs(geo());
    const ys: number[] = [];
    for (let i = 1; i < pos.length; i += 3) ys.push(pos[i]!);
    const roof = ys.filter((y) => y > 6);
    const foot = ys.filter((y) => y <= 6);
    expect(roof.length).toBe(48);
    expect(foot.length).toBe(48);
    // The roof band reaches the roof and stops there; the foot band floats just
    // above the ground so it cannot be buried by the plaza's own relief.
    expect(Math.max(...roof)).toBe(12);
    expect(Math.min(...foot)).toBeCloseTo(SELECTION_CONTOUR.footY, 5);
    expect(Math.max(...foot)).toBeCloseTo(SELECTION_CONTOUR.footY + 0.01, 5);
  });

  it("stands proud of the facade it marks, core in front of its casing", () => {
    const { pos } = attrs(geo());
    const radii = new Set<number>();
    for (let i = 0; i < pos.length; i += 9) {
      const x = Math.abs(pos[i]!);
      radii.add(Number(x.toFixed(4)));
    }
    const { gap, coreAhead, footCasing, footCore } = SELECTION_CONTOUR;
    const hx = 4 / 2 + gap;
    const footPad = (footCasing - footCore) / 2;
    // Wall: casing at half + gap, core one `coreAhead` further out. Ground: the
    // casing band starts where the wall band is and reaches `footCasing` out,
    // with the gold centred in it — a core that touches its frame on one side
    // still reads, one that overflows it leaves a stray dark line behind.
    expect([...radii].sort((a, b) => a - b)).toEqual(
      [
        hx,
        hx + coreAhead,
        hx + footCasing - footCore - footPad,
        hx + footCasing - footPad,
        hx + footCasing,
      ]
        .map((v) => Number(v.toFixed(4)))
        .sort((a, b) => a - b),
    );
    // Both margins the framing needs: the gold stands clear of the inner edge
    // of its frame and of the outer one, by the same distance.
    expect(footPad).toBeGreaterThanOrEqual(0.2);
    expect(hx + footCasing - (hx + footCasing - footPad)).toBeCloseTo(footPad, 6);
  });

  it("tiles the ground annulus without overlaps or holes", () => {
    const w = 4;
    const d = 3;
    const { pos } = attrs(selectionContourGeometry(w, d, 12)!);
    const { footCasing: casing, footCore: core, gap } = SELECTION_CONTOUR;
    const pad = (casing - core) / 2;
    // Sum of the rectangle areas the geometry actually carries.
    let sum = 0;
    for (let i = 0; i < pos.length; i += 9) {
      if (pos[i + 1]! > 6) continue;
      sum += Math.abs(pos[i + 3]! - pos[i]!) * Math.abs(pos[i + 5]! - pos[i + 2]!);
    }
    // The exact area of the two annuli it should be: four rectangles each,
    // tiling outer minus inner. Equal sums mean no rectangle was drawn twice —
    // transparent ink doubled at a corner reads as a dark notch.
    const area = (hx: number, hz: number, width: number): number => 4 * width * (hx + hz - width);
    const hx = w / 2 + gap;
    const hz = d / 2 + gap;
    expect(sum).toBeCloseTo(
      area(hx + casing, hz + casing, casing) + area(hx + casing - pad, hz + casing - pad, core),
      4,
    );
  });

  it("refuses a footprint that cannot carry it", () => {
    expect(selectionContourGeometry(0, 3, 12)).toBeNull();
    expect(selectionContourGeometry(4, -1, 12)).toBeNull();
    expect(selectionContourGeometry(NaN, 3, 12)).toBeNull();
    expect(selectionContourGeometry(4, 3, Infinity)).toBeNull();
  });
});

describe("the wiring keeps it a selection marker and nothing else", () => {
  it("draws the contour for the selected building only", () => {
    expect(BUILDING).toContain("{selected && contourGeo && (");
    expect(BUILDING).toContain("selected ? selectionContourGeometry(w, d, roofY) : null");
  });

  it("costs one mesh, which is what the ring cost", () => {
    // The circular ring is gone from the selection; the contour takes its
    // place. `findingFocus` still has its own ring — a different state, and one
    // that never shows while a building is selected.
    const start = BUILDING.indexOf("{selected && contourGeo && (");
    const end = BUILDING.indexOf("Finding-focus glow", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = BUILDING.slice(start, end);
    expect(block).not.toContain("ringGeometry");
    expect(block.match(/<mesh[\s>]/g) ?? []).toHaveLength(2);
    expect(BUILDING.match(/geometry=\{contourGeo\}/g) ?? []).toHaveLength(1);
    expect(BUILDING.match(/<instancedMesh/g) ?? []).toHaveLength(3);
  });

  it("releases the geometry it built per selection", () => {
    expect(BUILDING).toContain("contourGeo?.dispose()");
  });

  it("does not spin, pulse or otherwise move on its own", () => {
    // The ring rotated `t * 0.6` — invisible on a circle, and a loop the
    // reduced-motion guard would have had to cover. A band does not spin.
    expect(BUILDING).not.toContain("ringRef");
    expect(BUILDING).not.toContain("contourRef");
  });
});
