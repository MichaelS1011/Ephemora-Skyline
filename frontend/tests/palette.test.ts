import { describe, it, expect } from "vitest";
import { severityColor, complexityColor, churnColor, SEVERITY_COLOR } from "../src/city/palette";

const SEVERITIES = ["P0", "P1", "P2"] as const;

describe("severityColor", () => {
  it("pins the default (non-CVD) hexes exactly", () => {
    expect(severityColor("P0", false)).toBe("#ff2e4d");
    expect(severityColor("P1", false)).toBe("#ff7a1a");
    expect(severityColor("P2", false)).toBe("#ffd23f");
  });

  it("pins the colorblind (Okabe-Ito) hexes exactly", () => {
    expect(severityColor("P0", true)).toBe("#d55e00");
    expect(severityColor("P1", true)).toBe("#0072b2");
    expect(severityColor("P2", true)).toBe("#e69f00");
  });

  it("keeps the legacy severity constants untouched (existing callersites)", () => {
    expect(SEVERITY_COLOR.P0).toBe("#ff2e4d");
    expect(SEVERITY_COLOR.P1).toBe("#ff7a1a");
    expect(SEVERITY_COLOR.P2).toBe("#ffd23f");
  });

  it("gives pairwise-distinct colors per severity in BOTH modes", () => {
    for (const colorblind of [false, true]) {
      const [p0, p1, p2] = SEVERITIES.map((s) => severityColor(s, colorblind));
      expect(p0).not.toBe(p1);
      expect(p0).not.toBe(p2);
      expect(p1).not.toBe(p2);
    }
  });

  it("is deterministic — same input, same output, no hidden state", () => {
    for (const colorblind of [false, true]) {
      for (const sev of SEVERITIES) {
        const first = severityColor(sev, colorblind);
        // Interleave calls in both directions: output must not depend on
        // call order or on prior invocations (no memoisation surprises).
        for (let i = 0; i < 5; i++) {
          expect(severityColor(sev, colorblind)).toBe(first);
          expect(severityColor(sev, !colorblind)).not.toBe(first);
        }
      }
    }
  });
});

describe("colorblind heat ramps", () => {
  it("keeps the default ramp endpoints bit-identical (no visual diff)", () => {
    expect(complexityColor(0)).toBe("#3dd6c4");
    expect(complexityColor(1)).toBe("#ff2ea6");
    expect(churnColor(0)).toBe("#29d398");
    expect(churnColor(1)).toBe("#ff7a1a");
    // Explicit false matches the omitted-argument call
    expect(complexityColor(0, false)).toBe(complexityColor(0));
    expect(churnColor(1, false)).toBe(churnColor(1));
  });

  it("swaps to Okabe-Ito-based endpoints in colorblind mode (no red/green pair)", () => {
    expect(complexityColor(0, true)).toBe("#0072b2");
    expect(complexityColor(0.5, true)).toBe("#e69f00");
    expect(complexityColor(1, true)).toBe("#753300");
    expect(churnColor(0, true)).toBe("#0072b2");
    expect(churnColor(1, true)).toBe("#d55e00");
  });

  it("is deterministic for the ramps in both modes", () => {
    for (const colorblind of [false, true]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(complexityColor(t, colorblind)).toBe(complexityColor(t, colorblind));
        expect(churnColor(t, colorblind)).toBe(churnColor(t, colorblind));
      }
    }
  });
});
