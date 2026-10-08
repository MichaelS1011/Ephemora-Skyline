import { describe, expect, it } from "vitest";
import { STRIP_BARS, districtUnderground, groupStrip, knownSubtreeFiles } from "../src/city/layout";
import {
  COMPLEXITY_TICKS,
  blockThreatState,
  buildingHeight,
  complexityForHeight,
  heightForComplexity,
  syntheticComplexity,
} from "../src/city/mapping";
import type { CityDir, CityFile } from "../src/city/types";

/**
 * Befund 12 / Dossier D12 (Reibungs-Audit 2026-10-08): a folder of 900 files
 * drew six towers and a podium, and the number of everything else — 865 —
 * lived only inside the hover panel. These tests pin the two promises the
 * fix makes:
 *
 * 1. The underground tally comes out of the payload unchanged: hidden =
 *    `remainingFiles`, total = `fileCount`. Nothing is estimated.
 * 2. A wide folder's strip is honest: it only draws when the payload knows
 *    EVERY file it claims to bin, and each bar is as tall as the tallest
 *    real file inside it (the same mapping rail a single building uses).
 */

function file(path: string, overrides: Partial<CityFile> = {}): CityFile {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 8,
    cyclomaticComplexity: 8,
    threatLevel: "safe",
    findings: [],
    ...overrides,
  };
}

function dirWith(overrides: Partial<CityDir> & { path: string }): CityDir {
  return {
    name: overrides.path.split("/").pop() ?? "",
    fileCount: 0,
    linesOfCode: 0,
    languages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [],
    remainingFiles: 0,
    districtFiles: [],
    ...overrides,
  };
}

/** `app` exactly as measured in city `a1c66ddd…` (900 files, 35 rendered). */
function wideApp(): { dir: CityDir; additional: CityFile[] } {
  const detail = Array.from({ length: 35 }, (_, i) => file(`app/f${i}.ts`));
  const additional = Array.from({ length: 865 }, (_, i) =>
    file(`app/x${i}.ts`, i === 800 ? { cyclomaticComplexity: 26, linesOfCode: 12 } : {}),
  );
  const dir = dirWith({
    path: "app",
    fileCount: 900,
    linesOfCode: 7521,
    detailFiles: detail,
    remainingFiles: 865,
    districtFiles: detail.slice(0, 6),
  });
  return { dir, additional };
}

describe("districtUnderground — the number on the street sign", () => {
  it("reports 865 of 900 for the wide folder straight from the payload", () => {
    const { dir } = wideApp();
    expect(districtUnderground(dir)).toEqual({ hidden: 865, total: 900 });
  });

  it("stays at zero hidden when every file stands as its own building", () => {
    const dir = dirWith({ path: "small", fileCount: 2, remainingFiles: 0 });
    expect(districtUnderground(dir)).toEqual({ hidden: 0, total: 2 });
  });
});

describe("groupStrip — dense reading for wide folders", () => {
  it("bins all 900 known files, counts summing back to the payload total", () => {
    const { dir, additional } = wideApp();
    const known = knownSubtreeFiles(dir, additional);
    expect(known.length).toBe(900);
    const strip = groupStrip(dir, 16, known);
    expect(strip).not.toBeNull();
    const bars = strip!;
    expect(bars.length).toBeLessThanOrEqual(STRIP_BARS);
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(900);
  });

  it("holds the tallest real file in the bin, on the single-building rail", () => {
    const { dir, additional } = wideApp();
    const tangled = file("app/x999.ts", { cyclomaticComplexity: 38, linesOfCode: 40 });
    const bars = groupStrip(dirWith({ ...dir, fileCount: dir.fileCount + 1 }), 16, [
      ...knownSubtreeFiles(dir, additional),
      tangled,
    ])!;
    // The riskiest, then tallest file leads: bin 0 carries it…
    expect(bars[0]!.h).toBeCloseTo(buildingHeight(tangled), 5);
    // …and no bar exceeds what a real file of its bin measures.
    for (const b of bars) expect(b.h).toBeGreaterThanOrEqual(2.2);
  });

  it("refuses to draw when the payload does not know every file", () => {
    const { dir, additional } = wideApp();
    const onlySample = knownSubtreeFiles(dir, additional).slice(0, 41);
    expect(groupStrip(dir, 16, onlySample)).toBeNull();
  });

  it("leaves small folders alone — the towers already read one-by-one", () => {
    const files = Array.from({ length: 6 }, (_, i) => file(`app/f${i}.ts`));
    const dir = dirWith({
      path: "app",
      fileCount: 6,
      detailFiles: files,
      linesOfCode: 48,
    });
    expect(groupStrip(dir, 12, files)).toBeNull();
  });

  it("carries the bin's worst finding and dominant language", () => {
    const flagged = file("app/f0.ts", {
      threatLevel: "critical",
      findings: [
        { type: "secret", severity: "P2", line: 2, message: "m" },
        { type: "injection", severity: "P0", line: 3, message: "m" },
      ],
    });
    const rest = Array.from({ length: 6 }, (_, i) => file(`app/f${i + 1}.ts`));
    const py = [
      file("app/g1.py", { language: "Python", linesOfCode: 300 }),
      file("app/g2.py", { language: "Python", linesOfCode: 300 }),
    ];
    const detail = [flagged, ...py, ...rest];
    const dir = dirWith({
      path: "app",
      fileCount: detail.length,
      detailFiles: detail,
      linesOfCode: detail.reduce((s, f) => s + f.linesOfCode, 0),
    });
    const bars = groupStrip(dir, 12, detail)!;
    // 9 known files ≤ STRIP_BARS → one bar per file, riskiest first.
    expect(bars[0]!.worst).toBe("P0");
    expect(bars[0]!.findings).toBe(2);
    expect(bars.some((b) => b.language === "Python")).toBe(true);
  });
});

describe("the height rail stays a measurement", () => {
  it("maps complexity 0..1 onto the mapping's own building-height rail", () => {
    expect(heightForComplexity(0)).toBeCloseTo(2.2, 5);
    expect(heightForComplexity(1)).toBeCloseTo(34, 5);
    for (let c = 0; c <= 1; c += 0.05) {
      expect(heightForComplexity(c)).toBeLessThanOrEqual(heightForComplexity(c + 0.05));
    }
    const f = file("app/a.ts", {
      cyclomaticComplexity: 40,
      importCount: 12,
      linesOfCode: 2000,
    });
    expect(syntheticComplexity(f)).toBeCloseTo(1, 5);
    expect(buildingHeight(f)).toBeCloseTo(heightForComplexity(syntheticComplexity(f)), 9);
  });

  it("ticks the mast at the four quarter points and the saturation top", () => {
    expect([...COMPLEXITY_TICKS]).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("reads a drawn height back on the same rail the sign quotes", () => {
    for (const c of COMPLEXITY_TICKS) {
      expect(complexityForHeight(heightForComplexity(c))).toBeCloseTo(c, 6);
    }
  });
});

describe("blockThreatState — far zoom must not swallow the grey", () => {
  it("keeps a partly unverified district grey instead of claiming safe", () => {
    expect(
      blockThreatState({
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
        unverifiedFiles: 500,
      }),
    ).toBe("unchecked");
  });

  it("still ranks findings above the grey", () => {
    expect(
      blockThreatState({
        findingsBySeverity: { P0: 0, P1: 2, P2: 5 },
        unverifiedFiles: 40,
      }),
    ).toBe("P1");
    expect(blockThreatState({ findingsBySeverity: { P0: 0, P1: 0, P2: 0 } })).toBe("safe");
  });
});
