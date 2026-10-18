import { describe, expect, it } from "vitest";
import { roofFor, ROOF_SHAPES, type RoofShape } from "../src/city/roofShape";

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
