import { describe, it, expect } from "vitest";
import {
  liftHexForDusk,
  THREAT_COLOR,
  UNCHECKED_COLOR,
  ENV,
  severityColor,
} from "../src/city/palette";
import { landmarkFileId } from "../src/city/layout";
import type { CityData, CityFile } from "../src/city/types";

// ── WCAG relative luminance / contrast, so the assertions are the same
// numbers the browser probe reported for task #30.
function lin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("#30 far-view heat-cell legibility lift", () => {
  const ground = "#3a372d"; // Legacy dusk helper remains available.
  const safe = THREAT_COLOR.safe;
  const unchecked = UNCHECKED_COLOR;

  it("raises the calm `safe` tile off the dusk ground (was 1.76:1)", () => {
    expect(contrast(safe, ground)).toBeLessThan(2); // measured before-state
    expect(contrast(liftHexForDusk(safe), ground)).toBeGreaterThanOrEqual(2.5);
  });

  it("raises the `unchecked` tile off the ground too", () => {
    expect(contrast(liftHexForDusk(unchecked), ground)).toBeGreaterThan(
      contrast(unchecked, ground),
    );
  });

  it("never lets `unchecked` lose its separation from `safe`", () => {
    const ls = relLum(liftHexForDusk(safe));
    const lu = relLum(liftHexForDusk(unchecked));
    // ordering kept: unchecked stays lighter than safe
    expect(lu).toBeGreaterThan(ls);
    // and the pair is still told apart (>= 1.3:1 luminance ratio)
    expect(contrast(liftHexForDusk(unchecked), liftHexForDusk(safe))).toBeGreaterThanOrEqual(1.3);
  });

  it("is monotonic — the lift never darkens a tile or reorders the ramp", () => {
    for (const sev of ["P0", "P1", "P2"] as const) {
      const hex = severityColor(sev, false);
      expect(relLum(liftHexForDusk(hex))).toBeGreaterThanOrEqual(relLum(hex) - 1e-6);
    }
    // hot ends stay hotter than the calm safe end after lifting
    expect(relLum(liftHexForDusk(severityColor("P1", false)))).toBeGreaterThan(
      relLum(liftHexForDusk(safe)),
    );
  });

  it("is deterministic for the same input", () => {
    expect(liftHexForDusk(safe)).toBe(liftHexForDusk(safe));
  });
});

describe("#16c landmark resolves to the riskiest file (cached)", () => {
  function city(): CityData {
    const p0: CityFile = {
      id: "f1",
      name: "auth.ts",
      path: "src/auth.ts",
      language: "TypeScript",
      linesOfCode: 500,
      cyclomaticComplexity: 12,
      threatLevel: "critical",
      findings: [{ type: "CMD_INJECTION", severity: "P0", line: 42, message: "x" }],
    };
    const safe: CityFile = {
      id: "f2",
      name: "util.ts",
      path: "src/util.ts",
      language: "TypeScript",
      linesOfCode: 100,
      cyclomaticComplexity: 3,
      threatLevel: "safe",
      findings: [],
    };
    return {
      repo: { owner: "acme", name: "app", branch: "main" },
      totalFiles: 2,
      renderedFiles: 2,
      totalLines: 600,
      findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
      languages: { TypeScript: 600 },
      tree: {
        name: "",
        path: "",
        fileCount: 2,
        linesOfCode: 600,
        languages: { TypeScript: 600 },
        findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
        threatScore: 10,
        topFindings: p0.findings,
        children: [],
        detailFiles: [p0, safe],
        remainingFiles: 0,
        districtFiles: [p0, safe],
      },
      fileConnections: [],
      dirConnections: [],
      meta: {
        churn: false,
        deadCode: false,
        duplicates: false,
        cycles: false,
        coverage: false,
        blame: false,
      },
    };
  }

  it("names the P0 file and stays stable across calls (WeakMap cache)", () => {
    const c = city();
    const first = landmarkFileId(c);
    const second = landmarkFileId(c);
    expect(first).toBe("f1");
    expect(second).toBe(first);
  });
});

// Daylight cells use the unmodified semantic colors.
it("keeps calm and unchecked cells readable on daylight ground", () => {
  expect(contrast(THREAT_COLOR.safe, ENV.ground)).toBeGreaterThanOrEqual(2.5);
  expect(contrast(UNCHECKED_COLOR, ENV.ground)).toBeGreaterThanOrEqual(2.5);
});
