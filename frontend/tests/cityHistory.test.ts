import { describe, expect, it } from "vitest";
import { buildCityHistory, diffCities, signed } from "../src/city/cityHistory";
import type { RecentCity } from "../src/recentCities";
import { city } from "./helpers/cityFixture";

const entry = (id: string, folder: string, openedAt: number): RecentCity => ({
  id,
  folder,
  openedAt,
  findings: 1,
  files: 10,
});

describe("city history", () => {
  it("keeps only the current folder, marks the current scan and de-dupes ids", () => {
    const history = buildCityHistory(
      [
        entry("new", "shop", 3),
        entry("other", "other", 2),
        entry("old", "shop", 1),
        entry("new", "shop", 0),
      ],
      "new",
    );

    expect(history.map((e) => e.id)).toEqual(["new", "old"]);
    expect(history[0]?.isCurrent).toBe(true);
    expect(history[1]?.isCurrent).toBe(false);
  });

  it("returns no eras when the current scan is not in the local index", () => {
    expect(buildCityHistory([entry("old", "shop", 1)], "missing")).toEqual([]);
    expect(buildCityHistory([entry("old", "shop", 1)], null)).toEqual([]);
  });

  it("diffs the fields both payloads carry", () => {
    const before = city({
      totalFiles: 10,
      totalLines: 900,
      renderedFiles: 8,
      findingsBySeverity: { P0: 1, P1: 2, P2: 3 },
    });
    const after = city({
      totalFiles: 12,
      totalLines: 1000,
      renderedFiles: 9,
      findingsBySeverity: { P0: 0, P1: 2, P2: 5 },
    });

    expect(diffCities(after, before)).toEqual({
      files: 2,
      lines: 100,
      renderedFiles: 1,
      P0: -1,
      P1: 0,
      P2: 2,
    });
  });

  it("prints signed deltas without a plus on zero", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-2)).toBe("-2");
    expect(signed(0)).toBe("0");
  });
});
