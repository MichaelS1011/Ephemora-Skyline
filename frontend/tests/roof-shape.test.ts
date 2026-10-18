import { describe, expect, it } from "vitest";
import { crownBaseY, roofFor, ROOF_SHAPES, type RoofShape } from "../src/city/roofShape";

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
