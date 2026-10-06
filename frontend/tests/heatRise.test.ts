import { describe, it, expect } from "vitest";
import { heatCellRise, CELL_RISE } from "../src/components/HeatCells";
import { findingBarHeightForCount } from "../src/city/mapping";

/**
 * The far-zoom heat grid used to be ONE flat plate: every file 0.55 units high,
 * so in the Totalen — the view a reader uses to decide where to look — the only
 * thing separating a P0 district from a clean one was the tile's hue. Height now
 * carries the same quantity the colour carries, which is why these are asserted
 * as a law per channel rather than as a look.
 */

const threat = (findingCount: number) => heatCellRise("threat", { findingCount, value: 0 });
const byValue = (channel: "complexity" | "churn", value: number) =>
  heatCellRise(channel, { findingCount: 0, value });

describe("the heat-cell rise law", () => {
  it("keeps a clean file flat and an alarm taller", () => {
    expect(threat(0)).toBe(CELL_RISE.BASE);
    expect(threat(1)).toBeGreaterThan(CELL_RISE.BASE);
  });

  it("uses the SAME height rule as the building bars", () => {
    for (const n of [1, 2, 5, 6, 9, 25]) {
      expect(threat(n), `${n} findings`).toBeCloseTo(
        Math.max(CELL_RISE.BASE, findingBarHeightForCount(n)),
        10,
      );
    }
  });

  it("is monotone in the finding count", () => {
    let previous = 0;
    for (let n = 0; n <= 30; n++) {
      const h = threat(n);
      expect(h, `${n} findings`).toBeGreaterThanOrEqual(previous);
      if (n > 0) expect(h, `${n} findings`).toBeGreaterThan(previous);
      previous = h;
    }
  });

  it("is monotone in the channel value for complexity and churn", () => {
    for (const channel of ["complexity", "churn"] as const) {
      let previous = 0;
      for (let v = 0; v <= 1.0001; v += 0.05) {
        const h = byValue(channel, v);
        expect(h, `${channel} at ${v.toFixed(2)}`).toBeGreaterThanOrEqual(previous);
        previous = h;
      }
      expect(byValue(channel, 1)).toBeGreaterThan(byValue(channel, 0));
    }
  });

  it("clamps an out-of-range value instead of growing without bound", () => {
    expect(byValue("churn", 5)).toBe(byValue("churn", 1));
    expect(byValue("complexity", -3)).toBe(CELL_RISE.BASE);
  });

  it("rises far enough to be a silhouette, not a rounding error", () => {
    // 6 findings — the point where the cap starts folding — must clear the
    // ground plate by a margin a camera 200 units out can still resolve
    expect(threat(6)).toBeGreaterThanOrEqual(5);
    expect(CELL_RISE.BASE + CELL_RISE.VALUE_UNITS).toBeGreaterThanOrEqual(3.5);
  });
});
