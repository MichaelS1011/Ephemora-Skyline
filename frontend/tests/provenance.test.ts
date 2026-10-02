import { describe, it, expect } from "vitest";
import { scanVerdict } from "../src/city/provenance";
import type { ScanProvenance } from "../src/city/types";

/** Every engine ran — the baseline a claim of "clear" is earned against. */
const ALL: ScanProvenance = {
  regex: true,
  gitleaks: true,
  semgrep: true,
  dependencies: true,
  ruff: true,
  osv: true,
};
const JS = { TypeScript: 900, JavaScript: 100 };
const PY = { Python: 400 };

describe("scanVerdict", () => {
  it("lets a finding speak for itself", () => {
    expect(scanVerdict(ALL, 1, JS)).toEqual({ kind: "findings" });
  });

  it("calls a result clear only when every engine that could have run did", () => {
    expect(scanVerdict(ALL, 0, JS)).toEqual({ kind: "clear" });
  });

  it("names the engines that stayed away", () => {
    const p: ScanProvenance = { ...ALL, gitleaks: false, semgrep: false };
    expect(scanVerdict(p, 0, JS)).toEqual({ kind: "shallow", missing: ["gitleaks", "semgrep"] });
  });

  it("asks for a dependency audit only of a project that has dependencies", () => {
    // A Python repo has no package.json: npm audit not running is not a gap.
    expect(scanVerdict({ ...ALL, dependencies: false }, 0, PY)).toEqual({ kind: "clear" });
    expect(scanVerdict({ ...ALL, dependencies: false }, 0, JS)).toEqual({
      kind: "shallow",
      missing: ["npm audit"],
    });
  });

  it("holds a Python repo to the Python engines", () => {
    expect(scanVerdict({ ...ALL, ruff: false }, 0, PY)).toEqual({
      kind: "shallow",
      missing: ["ruff"],
    });
    expect(scanVerdict({ ...ALL, osv: false }, 0, PY)).toEqual({
      kind: "shallow",
      missing: ["osv-scanner"],
    });
    // the same gaps in a JS-only repo ask for nothing
    expect(scanVerdict({ ...ALL, ruff: false, osv: false }, 0, JS)).toEqual({ kind: "clear" });
  });

  it("reads an absent optional flag as not run", () => {
    // scanDependencies threw, so the key never made it into the summary
    expect(scanVerdict({ regex: true, gitleaks: true, semgrep: true }, 0, JS)).toEqual({
      kind: "shallow",
      missing: ["npm audit"],
    });
  });

  it("withholds the verdict when the result carries no provenance at all", () => {
    expect(scanVerdict(undefined, 0, JS)).toEqual({ kind: "unknown" });
    expect(scanVerdict(undefined, 3, JS)).toEqual({ kind: "findings" });
  });

  it("says nothing about depth for a repo with no recognised language", () => {
    expect(scanVerdict({ regex: true, gitleaks: true, semgrep: true }, 0, {})).toEqual({
      kind: "clear",
    });
  });
});
