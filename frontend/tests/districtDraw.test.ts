import { describe, expect, it } from "vitest";
import { districtDraw, explainDistrictDraw } from "../src/city/layout";
import type { CityDir, CityFile } from "../src/city/types";

/**
 * A district of 92 files that draws 6 buildings is not broken — the layout
 * draws one plaza building per file sitting in the folder itself and one plot
 * per sub-district, and a plot carries only a handful of representative towers.
 * The panel has to say that; a wrong reason is worse than none, so these tests
 * pin the wording to what the layout actually does.
 */

function file(path: string, overrides: Partial<CityFile> = {}): CityFile {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 50,
    cyclomaticComplexity: 3,
    threatLevel: "safe",
    findings: [],
    ...overrides,
  };
}

function dir(overrides: Partial<CityDir> & { path: string }): CityDir {
  const files = overrides.detailFiles ?? [];
  return {
    name: overrides.path.split("/").pop() ?? "",
    fileCount: files.length,
    linesOfCode: files.reduce((s, f) => s + f.linesOfCode, 0),
    languages: { TypeScript: files.reduce((s, f) => s + f.linesOfCode, 0) },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    remainingFiles: 0,
    districtFiles: [],
    ...overrides,
    detailFiles: files,
  };
}

const LIMITS = { skylineTowers: 6, buildingsPerDirectory: 35 };

/** `frontend` as measured on this repo: 92 files, 6 of them sitting in it. */
function frontendLike(): CityDir {
  const src = dir({
    path: "frontend/src",
    fileCount: 60,
    detailFiles: Array.from({ length: 5 }, (_, i) => file(`frontend/src/f${i}.ts`)),
    districtFiles: Array.from({ length: 6 }, (_, i) => file(`frontend/src/t${i}.ts`)),
  });
  const tests = dir({
    path: "frontend/tests",
    fileCount: 26,
    detailFiles: Array.from({ length: 6 }, (_, i) => file(`frontend/tests/t${i}.ts`)),
    districtFiles: Array.from({ length: 6 }, (_, i) => file(`frontend/tests/t${i}.ts`)),
  });
  return dir({
    path: "frontend",
    fileCount: 92,
    detailFiles: Array.from({ length: 6 }, (_, i) => file(`frontend/f${i}.ts`)),
    districtFiles: Array.from({ length: 6 }, (_, i) => file(`frontend/f${i}.ts`)),
    children: [src, tests],
  });
}

describe("districtDraw", () => {
  it("splits the subtree into files here and files below", () => {
    const draw = districtDraw(frontendLike(), LIMITS);
    expect(draw.totalFiles).toBe(92);
    expect(draw.filesHere).toBe(6);
    expect(draw.drawnHere).toBe(6);
    expect(draw.folded).toBe(0);
    expect(draw.plots).toBe(2);
    expect(draw.filesBelow).toBe(86);
    expect(draw.towers).toBe(12);
  });

  it("counts the files a full folder leaves to the podium", () => {
    const capped = dir({
      path: "app",
      fileCount: 60,
      detailFiles: Array.from({ length: 35 }, (_, i) => file(`app/f${i}.ts`)),
      remainingFiles: 25,
    });
    const draw = districtDraw(capped, LIMITS);
    expect(draw.filesHere).toBe(60);
    expect(draw.drawnHere).toBe(35);
    expect(draw.folded).toBe(25);
    expect(draw.plots).toBe(0);
  });

  it("sees a folder whose files all live in sub-folders as such", () => {
    const nested = dir({
      path: "backend/src",
      fileCount: 31,
      detailFiles: [],
      children: [
        dir({
          path: "backend/src/services",
          fileCount: 19,
          detailFiles: [file("backend/src/services/a.ts")],
          districtFiles: Array.from({ length: 6 }, (_, i) =>
            file(`backend/src/services/t${String(i)}.ts`),
          ),
        }),
        dir({
          path: "backend/src/server",
          fileCount: 12,
          detailFiles: [file("backend/src/server/a.ts")],
          districtFiles: Array.from({ length: 6 }, (_, i) =>
            file(`backend/src/server/t${String(i)}.ts`),
          ),
        }),
      ],
    });
    const draw = districtDraw(nested, LIMITS);
    expect(draw.filesHere).toBe(0);
    expect(draw.drawnHere).toBe(0);
    expect(draw.folded).toBe(0);
    expect(draw.plots).toBe(2);
    expect(draw.filesBelow).toBe(31);
  });

  it("falls back to detail files when a payload carries no skyline", () => {
    const legacy = dir({
      path: "app",
      fileCount: 4,
      detailFiles: Array.from({ length: 4 }, (_, i) => file(`app/f${i}.ts`)),
      children: [
        dir({
          path: "app/web",
          fileCount: 4,
          detailFiles: Array.from({ length: 4 }, (_, i) => file(`app/web/f${i}.ts`)),
        }),
      ],
    });
    const draw = districtDraw(legacy, LIMITS);
    expect(draw.filesBelow).toBe(4);
    expect(draw.towers).toBe(4);
  });
});

describe("explainDistrictDraw", () => {
  it("explains a district that shows six buildings for ninety-two files", () => {
    const lines = explainDistrictDraw(frontendLike(), LIMITS, "en");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("86 files live in 2 sub-districts");
    expect(lines[0]).toContain("6");
  });

  it("explains the podium when a folder outgrows its plots", () => {
    const capped = dir({
      path: "app",
      fileCount: 60,
      detailFiles: Array.from({ length: 35 }, (_, i) => file(`app/f${i}.ts`)),
      remainingFiles: 25,
    });
    const lines = explainDistrictDraw(capped, LIMITS, "en");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("35 of 60 files here stand as buildings");
    expect(lines[0]).toContain("podium");
  });

  it("says nothing when every file in view is drawn", () => {
    const open = dir({
      path: "app",
      fileCount: 3,
      detailFiles: [file("app/a.ts"), file("app/b.ts"), file("app/c.ts")],
    });
    expect(explainDistrictDraw(open, LIMITS, "en")).toEqual([]);
  });

  it("derives the skyline number from the payload when the city ships no limits", () => {
    const lines = explainDistrictDraw(frontendLike(), undefined, "en");
    expect(lines[0]).toContain("each plot shows up to 6 of its most at-risk files");
  });

  it("says the same thing in German when German is the display language", () => {
    const lines = explainDistrictDraw(frontendLike(), LIMITS, "de");
    expect(lines[0]).toContain("86 Dateien liegen in 2 Unterbezirken");
    expect(lines[0]).toContain("bis zu 6 seiner riskantesten Dateien");
    const one = explainDistrictDraw(
      dir({
        path: "app",
        fileCount: 60,
        detailFiles: Array.from({ length: 35 }, (_, i) => file(`app/f${i}.ts`)),
        remainingFiles: 25,
      }),
      LIMITS,
      "de",
    );
    expect(one[0]).toContain("35 von 60 Dateien hier stehen als Gebäude");
  });
});
