import { describe, it, expect } from "vitest";
import {
  FINDING_BAR,
  findingBarSegments,
  findingBarHeight,
  findingBarHeightForCount,
} from "../src/city/mapping";
import type { Severity } from "../src/city/types";

/**
 * A finding used to be a 4 px dot on the roof: measured in the rendered city at
 * 111 units out, every P0 alarm in the frame together covered 2 px, and a file
 * whose worst finding is P2 covered 0 px — it had no signature in the 3D view at
 * all. The bar stack is the mass encoding that replaces it. It has to be a REAL
 * measure, so these tests pin the law, not the look.
 */

const f = (...sev: Severity[]) => sev.map((severity) => ({ severity }) as never);

describe("the finding bar law", () => {
  it("draws nothing for a file with no findings", () => {
    expect(findingBarSegments([])).toEqual([]);
    expect(findingBarHeight([])).toBe(0);
  });

  it("puts one segment per finding, worst at the bottom", () => {
    const segs = findingBarSegments(f("P2", "P0", "P1"));
    expect(segs.map((s) => s.severity)).toEqual(["P0", "P1", "P2"]);
    expect(segs[0]!.y0).toBe(0);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.y0, "the stack is contiguous").toBe(segs[i - 1]!.y1);
    }
  });

  it("is strictly taller for more findings, past the cap too", () => {
    let previous = 0;
    for (let n = 1; n <= 40; n++) {
      const h = findingBarHeightForCount(n);
      expect(h, `${n} findings`).toBeGreaterThan(previous);
      previous = h;
    }
  });

  it("folds the tail into the top segment instead of drawing forty blocks", () => {
    const segs = findingBarSegments(f("P0", "P1", "P2", "P2", "P1", "P0", "P2", "P2", "P2"));
    expect(segs.length).toBe(FINDING_BAR.MAX_SEGMENTS);
    const last = segs[segs.length - 1]!;
    expect(last.count).toBe(1 + (9 - FINDING_BAR.MAX_SEGMENTS));
    expect(last.y1).toBeCloseTo(findingBarHeightForCount(9), 6);
    expect(segs.slice(0, -1).every((s) => s.y1 - s.y0 === FINDING_BAR.SEGMENT_UNITS)).toBe(true);
  });

  it("keeps the height and the count in agreement with the segment list", () => {
    for (const n of [1, 3, 6, 7, 12, 30]) {
      const findings = f(
        ...(Array.from({ length: n }, (_, i) =>
          i % 3 === 0 ? "P0" : i % 3 === 1 ? "P1" : "P2",
        ) as Severity[]),
      );
      expect(findingBarHeight(findings)).toBeCloseTo(findingBarHeightForCount(n), 6);
    }
  });

  it("has a fixed footprint, so height stays the only variable", () => {
    expect(FINDING_BAR.WIDTH).toBe(FINDING_BAR.DEPTH);
    expect(FINDING_BAR.SEGMENT_UNITS).toBeGreaterThan(0);
    // the smallest bar is still a visible object at district zoom (~8 px/unit)
    expect(FINDING_BAR.SEGMENT_UNITS).toBeGreaterThanOrEqual(0.7);
  });

  it("orders by severity rank, and never invents a fourth class", () => {
    const segs = findingBarSegments(f("P1", "P2", "P0"));
    expect(segs.map((s) => s.severity)).toEqual(["P0", "P1", "P2"]);
  });
});
