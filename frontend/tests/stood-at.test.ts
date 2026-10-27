/**
 * The decision "did this file stand at date D?" as a pure function.
 *
 * The only honest question the payload can answer is `firstCommitAt <= D`.
 * Everything else is four states, and the two "nothing to say" states must
 * never collapse into "not yet" — a file the scan could not date is not a
 * file that did not exist. The geometry lane (HeatCells time channel) and the
 * census sentence (HeatmapToggle) both read this one decision, so a wrong
 * state here would print as a wrong tower there.
 */
import { describe, expect, it } from "vitest";

import {
  stoodAt,
  timeCensus,
  timeRange,
  STOOD,
  NOT_YET,
  NO_HISTORY,
  UNKNOWN_PAYLOAD,
} from "../src/city/stoodAt";
import type { CityData, CityFile } from "../src/city/types";

const D = Date.parse("2026-01-01T00:00:00Z");

const file = (over: Partial<CityFile> = {}): CityFile => ({
  id: "a.ts",
  name: "a.ts",
  path: "a.ts",
  language: "TypeScript",
  linesOfCode: 10,
  cyclomaticComplexity: 1,
  threatLevel: "safe",
  findings: [],
  ...over,
});

const CHURNED = { churn: true };

describe("stoodAt — the four states", () => {
  it("stands on the earliest commit of its path", () => {
    expect(stoodAt(file({ firstCommitAt: D - 1 }), D, CHURNED)).toBe(STOOD);
  });
  it("stands exactly at the boundary: firstCommitAt === D counts as stood", () => {
    expect(stoodAt(file({ firstCommitAt: D }), D, CHURNED)).toBe(STOOD);
  });
  it("has not yet stood when its first commit is after D", () => {
    expect(stoodAt(file({ firstCommitAt: D + 1 }), D, CHURNED)).toBe(NOT_YET);
  });
  it("says no-history, never not-yet, when the payload dates files but not this one", () => {
    expect(stoodAt(file({ firstCommitAt: undefined }), D, CHURNED)).toBe(NO_HISTORY);
  });
  it("says no-history when the date is there but not a number", () => {
    expect(stoodAt(file({ firstCommitAt: Number.NaN as unknown as number }), D, CHURNED)).toBe(
      NO_HISTORY,
    );
  });
  it("says unknown-payload when the scan ran with churn off — the dates were never collected", () => {
    expect(stoodAt(file({ firstCommitAt: undefined }), D, { churn: false })).toBe(UNKNOWN_PAYLOAD);
    expect(stoodAt(file({ firstCommitAt: D - 1 }), D, { churn: false })).toBe(UNKNOWN_PAYLOAD);
  });
  it("says unknown-payload when the meta block is absent (a payload predating the flag)", () => {
    expect(stoodAt(file({ firstCommitAt: D - 1 }), D, undefined)).toBe(UNKNOWN_PAYLOAD);
  });
  it("says unknown-payload when there is no date to ask about", () => {
    expect(stoodAt(file({ firstCommitAt: D - 1 }), undefined, CHURNED)).toBe(UNKNOWN_PAYLOAD);
    expect(stoodAt(file({ firstCommitAt: D - 1 }), Number.NaN, CHURNED)).toBe(UNKNOWN_PAYLOAD);
  });
});

describe("timeRange — the slider's rails", () => {
  const city = (over: Partial<CityData>): CityData =>
    ({
      repo: { owner: "local", name: "x", branch: "main" },
      totalFiles: 0,
      renderedFiles: 0,
      totalLines: 0,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      languages: {},
      tree: {
        name: "",
        path: "",
        fileCount: 0,
        linesOfCode: 0,
        languages: {},
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
        topFindings: [],
        children: [],
        detailFiles: [],
        remainingFiles: 0,
        districtFiles: [],
      },
      fileConnections: [],
      dirConnections: [],
      meta: {
        churn: true,
        deadCode: false,
        duplicates: false,
        cycles: false,
        coverage: false,
        blame: false,
      },
      ...over,
    }) as CityData;

  it("runs from the oldest firstCommitAt to the scan moment", () => {
    const c = city({
      createdAt: "2026-01-01T00:00:00Z",
      tree: { ...city({}).tree, detailFiles: [file({ firstCommitAt: D - 1000 })] },
    });
    const r = timeRange(c);
    expect(r).not.toBeNull();
    expect(r!.min).toBe(D - 1000);
    expect(r!.max).toBe(D);
  });
  it("refuses to range a payload without a scan moment — old payloads have no createdAt", () => {
    expect(timeRange(city({ createdAt: undefined }))).toBeNull();
  });
  it("refuses to range a payload whose churn is off", () => {
    expect(
      timeRange(
        city({ createdAt: "2026-01-01T00:00:00Z", meta: { ...city({}).meta, churn: false } }),
      ),
    ).toBeNull();
  });
  it("is not poisoned by a file without a date", () => {
    const c = city({
      createdAt: "2026-01-01T00:00:00Z",
      tree: {
        ...city({}).tree,
        detailFiles: [file({ firstCommitAt: D - 1000 }), file({ firstCommitAt: undefined })],
      },
    });
    expect(timeRange(c)!.min).toBe(D - 1000);
  });
});

describe("timeCensus — the number the field claims", () => {
  const files = [
    file({ id: "1", firstCommitAt: D - 10 }),
    file({ id: "2", firstCommitAt: D + 10 }),
    file({ id: "3", firstCommitAt: undefined }),
  ];
  it("counts stood, not-yet and no-history apart — a sum of two would hide the third", () => {
    const c = timeCensus(files, D, CHURNED);
    expect(c).toEqual({ files: 3, stood: 1, notYet: 1, noHistory: 1, unknown: 0 });
  });
  it("falls to the unknown count when the payload cannot answer at all", () => {
    const c = timeCensus(files, D, { churn: false });
    expect(c).toEqual({ files: 3, stood: 0, notYet: 0, noHistory: 0, unknown: 3 });
  });
  it("counts nothing invented for an empty field", () => {
    const c = timeCensus([], D, CHURNED);
    expect(c.stood).toBe(0);
    expect(c.files).toBe(0);
  });
});
