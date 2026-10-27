import { describe, it, expect } from "vitest";
import { heatCellRise, CELL_RISE, TIME_RISE, TIME_INK } from "../src/components/HeatCells";
import { findingBarHeightForCount } from "../src/city/mapping";
import { STOOD, NOT_YET, NO_HISTORY } from "../src/city/stoodAt";

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

  // The time channel's law: the ANSWER rides the silhouette, not the hue.
  // A tower that stood rises; one that had not been committed yet sinks to a
  // foundation stub BELOW the calm plate; a file the churn pass never dated
  // keeps the plate UNTOUCHED — the three heights must never coincide, or the
  // honest "no-history" collapses into the claim "not yet".
  const time = (stood: string, value = 0) =>
    heatCellRise("time", { findingCount: 0, value, stood });
  describe("the time channel's silhouette law", () => {
    it("lifts a stood tower to the top of the band", () => {
      expect(time(STOOD)).toBe(TIME_RISE.STOOD);
      expect(TIME_RISE.STOOD).toBeGreaterThanOrEqual(3.5);
    });
    it("sinks a not-yet site below the calm plate", () => {
      expect(time(NOT_YET)).toBe(TIME_RISE.HOLLOW);
      expect(TIME_RISE.HOLLOW).toBeLessThan(CELL_RISE.BASE);
    });
    it("leaves an undated file on the untouched plate, distinct from both", () => {
      expect(time(NO_HISTORY)).toBe(CELL_RISE.BASE);
      expect(CELL_RISE.BASE).not.toBe(TIME_RISE.STOOD);
      expect(CELL_RISE.BASE).not.toBe(TIME_RISE.HOLLOW);
    });
    it("rises a block with its subtree's stood-share, monotone", () => {
      // stood === undefined is the block case: value is the share
      let previous: number = TIME_RISE.HOLLOW;
      for (let share = 0; share <= 1.0001; share += 0.1) {
        const h = heatCellRise("time", { findingCount: 0, value: share });
        expect(h, `share ${share.toFixed(1)}`).toBeGreaterThanOrEqual(previous);
        previous = h;
      }
      expect(heatCellRise("time", { findingCount: 0, value: 1 })).toBe(TIME_RISE.STOOD);
      // a fully-not-yet block sinks with its files, never posing as calm
      expect(heatCellRise("time", { findingCount: 0, value: 0 })).toBe(TIME_RISE.HOLLOW);
    });
    it("carries the truth in three heights AND three inks, hue never alone", () => {
      const heights = [time(STOOD), time(NOT_YET), time(NO_HISTORY)];
      expect(new Set(heights).size).toBe(3);
      const inks = [TIME_INK.stood, TIME_INK.notYet, TIME_INK.noHistory];
      expect(new Set(inks).size).toBe(3);
    });
  });
});
