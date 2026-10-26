// @vitest-environment node
/**
 * MASTER-2027 §07.06 — the route a sent resident walks is on the screen.
 *
 * Before this step the plan existed only inside the figure (`Ephe.path`,
 * `Ephe.finalX`): the reader pressed a dossier, a body started moving, and
 * nothing in the picture said where it was going. So these tests hold the four
 * things that make the stripe worth drawing rather than decoration:
 *
 *   1. it is the walk the body actually takes — the same points `planStep`
 *      feeds to `walkToward`, in the same order, and nothing invented between
 *      them;
 *   2. it survives the plate it lands on — the ink clears the project's own
 *      contrast floor on every ground surface it can cross, and its short axis
 *      stays at or above the ≥ 3 px rule at BOTH ends of the resident band;
 *   3. it costs one mesh and no instance budget — the crowd's pinned eleven
 *      `instancedMesh` calls stay eleven;
 *   4. it ends when the walk ends — the wiring ties the line to the errand,
 *      not to the camera or the clock, so it is there under reduced motion too.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as THREE from "three";
import { ROUTE_LINE, planPolyline, stripeGeometry, type RoutePoint } from "../src/city/routeLine";
import { ENV } from "../src/city/palette";
import { FLAT_SURFACE, makeWorldSurface, surfacePoint } from "../src/city/worldSurface";
import { contrast } from "./colourMath";

const p = (x: number, z: number): RoutePoint => ({ x, z });
const pos = (geo: THREE.BufferGeometry): Float32Array =>
  (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
const verts = (geo: THREE.BufferGeometry): Array<[number, number, number]> => {
  const a = pos(geo);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < a.length; i += 3) out.push([a[i]!, a[i + 1]!, a[i + 2]!]);
  return out;
};

const PEDESTRIANS = readFileSync(
  path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
  "utf-8",
);

describe("the plan is the walk", () => {
  it("runs from the figure's own feet through the hops to the door", () => {
    const nodes = [p(0, 0), p(10, 0), p(10, 10), p(20, 10)];
    // A figure standing at (1, 1) with three hops left and a door off-graph.
    const plan = planPolyline(1, 1, [1, 2, 3], nodes, 22, 12);
    expect(plan).toEqual([p(1, 1), p(10, 0), p(10, 10), p(20, 10), p(22, 12)]);
  });

  it("drops the last step when there is none, and an unknown node when it is gone", () => {
    const nodes = [p(0, 0), p(5, 5)];
    expect(planPolyline(0, 0, [1], nodes, null, 0)).toEqual([p(0, 0), p(5, 5)]);
    expect(planPolyline(0, 0, [1, 9], nodes, null, 0)).toEqual([p(0, 0), p(5, 5)]);
  });

  it("keeps a direct step straight, because that is what walkToward does", () => {
    // `routeTo` with a short frontage hop sets no path at all: the figure walks
    // the door in one straight line and the line on the ground must say so.
    expect(planPolyline(0, 0, [], [], 4, 3)).toEqual([p(0, 0), p(4, 3)]);
  });
});

describe("the stripe is geometry the plate can hold", () => {
  it("draws nothing when there is no route to draw", () => {
    expect(stripeGeometry([p(0, 0)], FLAT_SURFACE)).toBeNull();
    expect(stripeGeometry([], FLAT_SURFACE)).toBeNull();
    // A NaN in a plan (an unmapped target) must not become a stretched triangle.
    expect(stripeGeometry([p(0, 0), p(NaN, 4)], FLAT_SURFACE)).toBeNull();
  });

  it("is one flat quad per leg, and a disc at every node", () => {
    const straight = stripeGeometry([p(0, 0), p(6, 0)], FLAT_SURFACE)!;
    expect(verts(straight)).toHaveLength(6);
    const corner = stripeGeometry([p(0, 0), p(6, 0), p(6, 6)], FLAT_SURFACE)!;
    expect(verts(corner)).toHaveLength(6 * 2 + 3 * ROUTE_LINE.joinSections);
    const twoTurns = stripeGeometry([p(0, 0), p(6, 0), p(6, 6), p(6, 12)], FLAT_SURFACE)!;
    expect(verts(twoTurns)).toHaveLength(6 * 3 + 3 * ROUTE_LINE.joinSections * 2);
  });

  it("holds its width across the leg and sits at its own height", () => {
    const geo = stripeGeometry([p(0, 0), p(20, 0)], FLAT_SURFACE)!;
    const vs = verts(geo);
    for (const [, y] of vs) expect(y).toBeCloseTo(ROUTE_LINE.y, 6);
    const zs = vs.map((v) => v[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(ROUTE_LINE.width, 6);
    for (const v of vs) expect(Number.isFinite(v[0]!)).toBe(true);
  });

  it("cuts a long leg into sections instead of bridging the curved land", () => {
    // The same limit the street paint obeys: a 30-unit leg is four sections.
    const geo = stripeGeometry([p(0, 0), p(30, 0)], FLAT_SURFACE)!;
    expect(verts(geo)).toHaveLength(6 * Math.ceil(30 / ROUTE_LINE.maxStep));
    const curved = makeWorldSurface(120, { x: 0, z: 0 });
    const lifted = verts(stripeGeometry([p(0, 0), p(30, 0)], curved)!);
    // A flat quad across a globe would touch the ground at its ends and bridge
    // the middle. Each section corner is put where its own patch of ground is:
    // six positions along the leg, two kerb sides each, every one of them
    // present in the geometry — and no single plane describes them.
    const half = ROUTE_LINE.width / 2;
    const sections = Math.ceil(30 / ROUTE_LINE.maxStep);
    const want: number[] = [];
    for (let s = 0; s <= sections; s++)
      for (const side of [half, -half])
        want.push(
          surfacePoint(curved, (30 * s) / sections, ROUTE_LINE.y, side, new THREE.Vector3()).y,
        );
    const have = lifted.map((v) => v[1]);
    // The geometry stores float32; the expectation is computed in float64.
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
    for (const y of want)
      expect(
        have.some((h) => near(h, y)),
        `a stripe vertex at ${y}`,
      ).toBe(true);
    for (const y of have)
      expect(
        want.some((w) => near(w, y)),
        `a stripe height ${y}`,
      ).toBe(true);
    expect(Math.max(...have) - Math.min(...have)).toBeGreaterThan(0.5);
    expect(lifted[0]![1]).toBeLessThan(ROUTE_LINE.y + 1e-4);
  });
});

describe("the numbers the stripe was built on", () => {
  /** Every ground surface a kerb route can lie on. */
  const GROUND: Array<[string, string]> = [
    ["plot", ENV.plot],
    ["ground", ENV.ground],
    ["curb", ENV.curb],
    ["crosswalk", ENV.crosswalk],
    ["lane dash", ENV.laneDash],
    ["road", ENV.road],
  ];

  it("paints the route in the one ink that clears the floor on every surface", () => {
    for (const [name, surface] of GROUND) {
      expect(contrast(ENV.arcCasing, surface), `route ink against ${name}`).toBeGreaterThanOrEqual(
        2.5,
      );
    }
    // Asphalt is the floor of the frame, and the ink still clears three to one.
    expect(contrast(ENV.arcCasing, ENV.road)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the short axis at three pixels at both ends of the resident band", () => {
    // `ephe-readability.test.ts` measures 19.053 px per world unit across at a
    // 20 px resident and 28.579 px at a 30 px one; a ground feature is seen at
    // the overview's 0.68 rad elevation, so its width lands squashed by
    // sin(0.68). That is the worst axis the stripe can have.
    const squash = Math.sin(0.68);
    const far = ROUTE_LINE.width * 19.053 * squash;
    const near = ROUTE_LINE.width * 28.579 * squash;
    expect(far).toBeGreaterThanOrEqual(3);
    expect(near).toBeGreaterThanOrEqual(3);
    // And it must not swallow the kerb it lies on: the stone is 2 × 0.275 wide.
    expect(ROUTE_LINE.width).toBeLessThan(0.55);
  });

  it("adds no colour to the world", () => {
    // The route is drawn in `ENV.arcCasing`; a new hue here would be a new
    // channel nobody taught, and the palette guards budget every other one.
    const route = readFileSync(new URL("../src/city/routeLine.ts", import.meta.url), "utf-8");
    expect(route.match(/#[0-9a-fA-F]{3,8}/g) ?? []).toEqual([]);
    expect(PEDESTRIANS).toContain("color={ENV.arcCasing}");
  });
});

describe("the wiring", () => {
  it("draws the line at hand-over and forgets it when the errand ends", () => {
    expect(PEDESTRIANS).toContain("setRoutePlan(planPolyline(");
    // Every branch that takes the errand back takes the line with it.
    const forget = PEDESTRIANS.match(/forget\(\);/g) ?? [];
    expect(forget.length).toBeGreaterThanOrEqual(3);
    expect(PEDESTRIANS).toContain("routeOwner.current = null;");
  });

  it("ends the line at the arrival rather than leaving it on the pavement", () => {
    expect(PEDESTRIANS).toMatch(
      /route\.visible = !!bearer && bearer\.mode === "guide" && !bearer\.guideArrived/,
    );
  });

  it("costs the crowd no instance budget", () => {
    // `ephe-readability.test.ts` pins the crowd at eleven instanced meshes; the
    // route is a plain mesh and must not quietly become a twelfth.
    expect(PEDESTRIANS.match(/<instancedMesh/g) ?? []).toHaveLength(11);
    expect(PEDESTRIANS.match(/<mesh\s+ref=\{routeMeshRef\}/g) ?? []).toHaveLength(1);
  });

  it("renders the stripe only while a plan exists", () => {
    expect(PEDESTRIANS).toContain("{routeGeo && (");
    // And builds it once per plan, not once per frame.
    expect(PEDESTRIANS).toMatch(
      /const routeGeo = useMemo\(\s*\(\) => \(routePlan \? stripeGeometry/,
    );
  });
});
