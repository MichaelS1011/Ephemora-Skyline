import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { crownBaseY, roofFor, ROOF_SHAPES, type RoofShape } from "../src/city/roofShape";
import { WORLD_FOV_DEG, WORLD_OVERVIEW_ELEVATION } from "../src/city/worldFraming";
import { farLodExitDistance, OVERVIEW_FACTOR } from "../src/city/layout";
import { buildingFootprint } from "../src/city/mapping";

/**
 * The roof used to be derived from the height — the same number the body already
 * showed, drawn a second time, which is why every tower read as the same object.
 * Here the silhouette carries the one fact the body cannot: what was found in
 * this file. Four shapes, ordered by how much attention the file deserves, so a
 * reader scanning the skyline from above sees the risk distribution before
 * opening a single card.
 */
const finding = (severity: "P0" | "P1" | "P2") => ({ severity }) as never;

describe("the roof reads what a file holds", () => {
  it("keeps a clean file's roofline flat", () => {
    expect(roofFor([])).toBe("flat");
  });

  it("gives a file with only medium findings a setback penthouse", () => {
    expect(roofFor([finding("P2"), finding("P2")])).toBe("penthouse");
  });

  it("steps the terrace up when a high finding lives here", () => {
    expect(roofFor([finding("P2"), finding("P1")])).toBe("terrace");
  });

  it("raises the mast for a critical finding, whatever else is inside", () => {
    expect(roofFor([finding("P0")])).toBe("mast");
    expect(roofFor([finding("P1"), finding("P0"), finding("P2")])).toBe("mast");
  });

  it("ignores history-only findings — they name a commit, not this line", () => {
    expect(roofFor([{ severity: "P0", historyCommit: "abc123" } as never])).toBe("flat");
    expect(roofFor([{ severity: "P0", provenance: "gitleaks-history" } as never])).toBe("flat");
  });

  it("offers no more than four silhouettes", () => {
    // Clarity: a reader has to tell the shapes apart from orbit height.
    expect(ROOF_SHAPES).toEqual<RoofShape[]>(["flat", "penthouse", "terrace", "mast"]);
  });

  it("is monotonic in attention: the order of shapes matches the order of severity", () => {
    const rank = (s: RoofShape) => ROOF_SHAPES.indexOf(s);
    expect(rank(roofFor([finding("P2")]))).toBeLessThan(rank(roofFor([finding("P1")])));
    expect(rank(roofFor([finding("P1")]))).toBeLessThan(rank(roofFor([finding("P0")])));
  });
});

/**
 * The crown's height, measured from the body that is actually drawn.
 *
 * The first version of the crown sat inside the legacy-body branch only, so the
 * moment a tower opened into its voxel stack — exactly when a reader gets close
 * enough to care — the crown disappeared. Both bodies span `h`, but the legacy
 * one caps at `bodyH` and grows a tower above it, while the stack fills to `h`.
 */
describe("the crown sits on whichever body is drawn", () => {
  it("caps the legacy body above its slab", () => {
    expect(crownBaseY({ voxelBody: false, bodyH: 12, stepped: false, h: 12 })).toBeCloseTo(
      12.67,
      2,
    );
    expect(crownBaseY({ voxelBody: false, bodyH: 12.24, stepped: true, h: 17 })).toBeCloseTo(
      12.66,
      2,
    );
  });

  it("rides the top of a voxel stack instead of vanishing", () => {
    const y = crownBaseY({ voxelBody: true, bodyH: 12.24, stepped: true, h: 17 });
    expect(y).toBeCloseTo(17.12, 2);
    // the defect this case exists for: the stack's own height, not the plinth's
    expect(y).toBeGreaterThan(17);
  });

  it("never buries the crown inside the body it crowns", () => {
    for (const g of [
      { voxelBody: true, bodyH: 4, stepped: false, h: 4 },
      { voxelBody: true, bodyH: 3, stepped: true, h: 9 },
      { voxelBody: false, bodyH: 9, stepped: false, h: 9 },
    ]) {
      expect(crownBaseY(g)).toBeGreaterThanOrEqual(g.h);
    }
  });
});

/**
 * The four crowns have to be tellable apart at the distance a district is read
 * as a whole — and the crown is a district-tier signal: past `farLodExitDistance`
 * the renderer swaps the buildings for the heat grid, so no crown survives there.
 *
 * The number the inventory quoted (penthouse↔terrace ≈ 1.7 px, mast ≈ 2.9 px) is
 * not a fixed property of the shapes: a crown feature's size on screen is a
 * function of the building's own footprint (which is DATA, `buildingFootprint`),
 * the camera range, and the overview elevation that squashes every ground-plane
 * width. So this guard does not measure a screenshot — it projects the geometry
 * the component actually emits, through the camera the app actually mounts
 * (`worldFraming`'s fov and elevation, `layout`'s overview factor), at the
 * SMALLEST footprint a crowned file can have (the pessimistic end).
 *
 * It reads the real scale factors out of Building.tsx so the test and the render
 * cannot drift, exactly the way the crownBaseY and reveal guards do.
 */
const BUILDING_SRC = readFileSync(
  resolve(import.meta.dirname, "../src/components/Building.tsx"),
  "utf-8",
);

/** `w * <frac>` inside a named crown branch's first boxGeometry, plus its height. */
function crownBox(
  roofType: "penthouse" | "terrace",
  which: "first" | "second" = "first",
): { widthFrac: number; height: number } {
  const block = BUILDING_SRC.slice(BUILDING_SRC.indexOf(`roofType === "${roofType}"`));
  const matches = [...block.matchAll(/<boxGeometry args=\{\[w \* ([\d.]+), ([\d.]+),/g)];
  const hit = which === "first" ? matches[0] : matches[1];
  expect(hit, `no ${roofType} ${which} box found`).toBeDefined();
  return { widthFrac: Number(hit![1]), height: Number(hit![2]) };
}

function mastScale(): { diameter: number; height: number } {
  const block = BUILDING_SRC.slice(BUILDING_SRC.indexOf('roofType === "mast"'));
  const hit = /scale=\{\[([\d.]+), ([\d.]+),/.exec(block);
  expect(hit, "no mast cylinder scale found").toBeDefined();
  return { diameter: Number(hit![1]), height: Number(hit![2]) };
}

// The tier boundary the crown is meant to be read at: the level's own overview
// distance (OVERVIEW_FACTOR × bounds) seen under the overview elevation — the
// same pair `fitWorldOverview` and the drill-in reveal agree on for bounds 100.
const BOUNDS = 100;
const RANGE = OVERVIEW_FACTOR * BOUNDS; // 160
const TAN_HALF = Math.tan(((WORLD_FOV_DEG / 2) * Math.PI) / 180);
const VIEW_H = 1000; // the shared readability convention (1600×1000)
/** Screen px per world unit for a feature perpendicular to the view. */
const PPU = VIEW_H / (2 * RANGE * TAN_HALF);
/** A ground-plane width seen from the overview elevation loses sin(elevation). */
const SQUASH = Math.sin(WORLD_OVERVIEW_ELEVATION);
/** The smallest footprint a crowned file can stand on — pessimistic, not a mode. */
const W_MIN = buildingFootprint({ exportedSymbols: 0 } as never);

const MIN_PX = 3; // the readability floor the shapes must clear, worst case

describe("the four crowns are tellable apart at the district tier boundary", () => {
  it("is measuring at a distance the buildings are still drawn (not tiled)", () => {
    // If the boundary sat past the heat grid, the guard would prove a crown
    // legible where the renderer mounts none.
    expect(RANGE).toBeLessThan(farLodExitDistance(BOUNDS));
  });

  it("gives the mast a body — a <3 px line is a speck, not a spike", () => {
    const mast = mastScale();
    // A vertical cylinder is seen side-on: its width is not foreshortened.
    expect(mast.diameter * PPU).toBeGreaterThanOrEqual(MIN_PX);
  });

  it("separates the penthouse outline from the terrace plate by ≥ 3 px, worst axis", () => {
    const penthouse = crownBox("penthouse");
    const terracePlate = crownBox("terrace", "first");
    const gapUnits = (terracePlate.widthFrac - penthouse.widthFrac) * W_MIN;
    // The gap lives in the ground plane, so the pessimistic axis squashes it.
    expect(gapUnits).toBeGreaterThan(0);
    expect(gapUnits * PPU * SQUASH).toBeGreaterThanOrEqual(MIN_PX);
  });

  it("lifts the penthouse clear off a flat roofline", () => {
    const penthouse = crownBox("penthouse");
    expect(penthouse.height * PPU * Math.cos(WORLD_OVERVIEW_ELEVATION)).toBeGreaterThanOrEqual(
      MIN_PX,
    );
  });

  it("carries the massing without falsifying the body", () => {
    // The cut is horizontal only: no crown may overhang its footprint (that
    // would say the file has a wider API surface than it does)…
    for (const frac of [
      crownBox("penthouse").widthFrac,
      crownBox("terrace", "first").widthFrac,
      crownBox("terrace", "second").widthFrac,
    ]) {
      expect(frac).toBeLessThanOrEqual(1);
    }
    // …and the crown's own heights stay put, so nothing here moves the tower's
    // measured top. Height tells complexity; the crown must not touch it.
    expect(crownBox("penthouse").height).toBe(1.35);
    expect(crownBox("terrace", "first").height).toBe(0.78);
    expect(crownBox("terrace", "second").height).toBe(0.78);
    expect(mastScale().height).toBe(2.6);
  });
});
