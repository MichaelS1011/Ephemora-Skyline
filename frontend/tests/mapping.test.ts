import { describe, it, expect } from "vitest";
import {
  cyclomaticFactor,
  astDepthProxyFactor,
  locFactor,
  syntheticComplexity,
  buildingHeight,
  buildingFootprint,
  blockFootprint,
  erosionState,
  materialState,
  COMPLEXITY_WEIGHTS,
  NORM_REFERENCE,
} from "../src/city/mapping";
import { allSubtreeFiles } from "../src/components/HeatCells";
import { complexityColor } from "../src/city/palette";
import type { CityFile } from "../src/city/types";

function file(overrides: Partial<CityFile> = {}): CityFile {
  return {
    id: "f1",
    name: "a.ts",
    path: "src/a.ts",
    language: "TypeScript",
    linesOfCode: 100,
    cyclomaticComplexity: 5,
    threatLevel: "safe",
    findings: [],
    ...overrides,
  };
}

describe("synthetic complexity", () => {
  it("is a weighted blend of the three factors", () => {
    const f = file({ cyclomaticComplexity: 10, importCount: 6, linesOfCode: 500 });
    const expected =
      COMPLEXITY_WEIGHTS.cyclomatic * (10 / NORM_REFERENCE.cyclomatic) +
      COMPLEXITY_WEIGHTS.depthProxy * (6 / NORM_REFERENCE.imports) +
      COMPLEXITY_WEIGHTS.loc * (Math.sqrt(500) / Math.sqrt(NORM_REFERENCE.loc));
    expect(syntheticComplexity(f)).toBeCloseTo(expected, 8);
  });

  it("saturates at 1 for monster files", () => {
    const f = file({
      cyclomaticComplexity: 100,
      importCount: 50,
      linesOfCode: 50_000,
    });
    expect(syntheticComplexity(f)).toBe(1);
  });

  it("stays near zero for trivial files", () => {
    const f = file({ cyclomaticComplexity: 1, linesOfCode: 10, importCount: 0 });
    expect(syntheticComplexity(f)).toBeLessThan(0.1);
  });
});

describe("shape scales", () => {
  it("clamps height to the world range", () => {
    expect(
      buildingHeight(file({ cyclomaticComplexity: 1, linesOfCode: 1, importCount: 0 })),
    ).toBeGreaterThanOrEqual(2.2);
    expect(
      buildingHeight(file({ cyclomaticComplexity: 99, linesOfCode: 99_000, importCount: 99 })),
    ).toBe(34);
  });

  it("saturates, so a written-in-a-hurry file cannot punch a hole in the sky", () => {
    // The question the drive asked with its 1,204-line giant: does a file
    // typed out to 5,000 or 100,000 lines shoot its tower up? The rail answers
    // once — beyond the reference every wall stands at the same height, and the
    // card, not the geometry, is what tells the beginner the shape is wrong.
    const h = (n: number) =>
      buildingHeight(file({ cyclomaticComplexity: n, linesOfCode: n, importCount: 0 }));
    expect(h(5_000)).toBeCloseTo(h(20_000), 6);
    expect(h(5_000)).toBeCloseTo(h(100_000), 6);
    expect(h(5_000)).toBeLessThanOrEqual(34);
    expect(h(5_000)).toBeGreaterThan(h(60));
    // the height the README quotes, measured here rather than retyped
    expect(h(5_000)).toBeCloseTo(25.27, 1);
  });

  it("maps taller buildings for more complex files", () => {
    const simple = buildingHeight(
      file({ cyclomaticComplexity: 2, linesOfCode: 50, importCount: 1 }),
    );
    const complex = buildingHeight(
      file({ cyclomaticComplexity: 20, linesOfCode: 900, importCount: 10 }),
    );
    expect(complex).toBeGreaterThan(simple * 2);
  });

  it("drives footprint from API surface when present", () => {
    const noExports = buildingFootprint(file({ exportedSymbols: 0 }));
    const bigApi = buildingFootprint(file({ exportedSymbols: 24 }));
    expect(bigApi).toBeGreaterThan(noExports * 2);
    expect(buildingFootprint(file({ exportedSymbols: 100 }))).toBe(6.5); // clamped
  });

  it("falls back to the legacy LOC scale without the dimension", () => {
    expect(buildingFootprint(file())).toBeCloseTo(2.1 + Math.sqrt(100) * 0.12, 8);
  });

  it("keeps block footprint size-driven", () => {
    expect(blockFootprint(1_000_000)).toBe(20);
  });
});

describe("git erosion", () => {
  it("reports unknown without churn data", () => {
    expect(erosionState(file())).toBe("unknown");
    expect(
      erosionState(file({ churnScore: 0.9 }), {
        churn: false,
        deadCode: false,
        duplicates: false,
        cycles: false,
        coverage: false,
        blame: false,
      }),
    ).toBe("unknown");
  });

  it("classifies erosion thresholds", () => {
    const meta = {
      churn: true,
      deadCode: true,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: true,
    };
    expect(erosionState(file({ churnScore: 0.9 }), meta)).toBe("eroded");
    expect(erosionState(file({ churnScore: 0.4 }), meta)).toBe("weathered");
    expect(erosionState(file({ churnScore: 0.1 }), meta)).toBe("stable");
    expect(erosionState(file({ churnScore: 0.55 }), meta)).toBe("eroded");
    expect(erosionState(file({ churnScore: 0.35 }), meta)).toBe("weathered");
  });
});

describe("material state", () => {
  it("findings pulse neon (alarm)", () => {
    expect(materialState(file({ threatLevel: "critical" }))).toBe("alarm");
    expect(materialState(file({ threatLevel: "high" }))).toBe("alarm");
  });

  it("dead code is glass", () => {
    expect(materialState(file({ deadCodeCandidate: true }))).toBe("glass");
  });

  it("healthy code is matte graphite", () => {
    expect(materialState(file())).toBe("graphite");
  });

  it("alarm wins over glass", () => {
    expect(materialState(file({ deadCodeCandidate: true, threatLevel: "critical" }))).toBe("alarm");
  });
});

describe("factor helpers", () => {
  it("normalize to 0..1", () => {
    expect(cyclomaticFactor(file({ cyclomaticComplexity: 0 }))).toBe(0);
    expect(cyclomaticFactor(file({ cyclomaticComplexity: 999 }))).toBe(1);
    expect(astDepthProxyFactor(file({ importCount: 999 }))).toBe(1);
    expect(locFactor(file({ linesOfCode: 0 }))).toBeLessThan(0.05); // clamped to 1 LOC
    expect(locFactor(file({ linesOfCode: 99_999 }))).toBe(1);
  });
});

describe("the heat channel reads the measure the skyline reads", () => {
  function dirOf(files: CityFile[]) {
    return {
      name: "d",
      path: "d",
      fileCount: files.length,
      linesOfCode: 0,
      languages: {},
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      threatScore: 0,
      topFindings: [],
      children: [],
      detailFiles: files,
    } as never;
  }

  it("is the mean of the very values a zoomed-in cell colours itself with", () => {
    const a = file({ id: "a", cyclomaticComplexity: 40, importCount: 12, linesOfCode: 4000 });
    const b = file({ id: "b", cyclomaticComplexity: 20, importCount: 6, linesOfCode: 1000 });
    expect(allSubtreeFiles(dirOf([a, b])).avgComplexity).toBe(
      (syntheticComplexity(a) + syntheticComplexity(b)) / 2,
    );
  });

  it("saturates a district exactly where it saturates a file", () => {
    const maxed = file({ cyclomaticComplexity: 999, importCount: 999, linesOfCode: 99_999 });
    expect(syntheticComplexity(maxed)).toBe(1);
    expect(allSubtreeFiles(dirOf([maxed, maxed])).avgComplexity).toBe(1);
  });

  it("no longer pins a median real-world district at the end of the ramp", () => {
    // 33 / 200 LOC / 5 imports is the median district measured over this
    // project's own 93 first-party files. The old `mean(cyclomatic) / 25`
    // clamped that to 1.0 — and every district above the median with it, so
    // half the city wore one indistinguishable magenta.
    const median = file({ cyclomaticComplexity: 33, importCount: 5, linesOfCode: 200 });
    const t = allSubtreeFiles(dirOf([median, median])).avgComplexity;
    expect(t).toBeGreaterThan(0.5); // still reads hot, as a median district should
    expect(t).toBeLessThan(1);
    expect(complexityColor(t)).not.toBe(complexityColor(1));
  });

  it("ignores the finding count, which is the threat channel's business", () => {
    const base = { cyclomaticComplexity: 30, importCount: 8, linesOfCode: 900 };
    const noisy = file({
      ...base,
      threatLevel: "critical",
      findings: [{ type: "CMD_INJECTION", severity: "P0", line: 1, message: "x" }],
    });
    expect(allSubtreeFiles(dirOf([file(base)])).avgComplexity).toBe(
      allSubtreeFiles(dirOf([noisy])).avgComplexity,
    );
  });
});
