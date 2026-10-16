import { describe, it, expect } from "vitest";
import {
  describeGitignoreSkips,
  isUncheckedClean,
  missingEnginesForProject,
  fileCoverage,
  scanVerdict,
} from "../src/city/provenance";
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

describe("describeGitignoreSkips", () => {
  it("counts in the grammatical number the scan found", () => {
    expect(describeGitignoreSkips({ files: 3, directories: 1 }, "en")).toBe("3 files and 1 folder");
    expect(describeGitignoreSkips({ files: 1, directories: 1 }, "en")).toBe("1 file and 1 folder");
    expect(describeGitignoreSkips({ files: 49, directories: 3 }, "en")).toBe(
      "49 files and 3 folders",
    );
  });

  it("counts in German when German is the display language", () => {
    expect(describeGitignoreSkips({ files: 49, directories: 3 }, "de")).toBe(
      "49 Dateien und 3 Ordner",
    );
    expect(describeGitignoreSkips({ files: 1, directories: 1 }, "de")).toBe("1 Datei und 1 Ordner");
    expect(describeGitignoreSkips({ files: 7, directories: 0 }, "de")).toBe("7 Dateien");
  });

  it("names only what was actually kept out", () => {
    expect(describeGitignoreSkips({ files: 0, directories: 2 }, "en")).toBe("2 folders");
    expect(describeGitignoreSkips({ files: 7, directories: 0 }, "en")).toBe("7 files");
    expect(describeGitignoreSkips({ files: 0, directories: 0 }, "en")).toBe("");
  });

  it("stays silent for a result scanned before the counter existed", () => {
    expect(describeGitignoreSkips(undefined, "en")).toBe("");
  });
});

describe("isUncheckedClean", () => {
  it("refuses to call an unread file clean", () => {
    expect(isUncheckedClean({ findings: [], unverifiedBy: ["semgrep"] })).toBe(true);
    expect(isUncheckedClean({ findings: [], unverifiedBy: [] })).toBe(false);
    expect(isUncheckedClean({ findings: [] })).toBe(false);
  });

  it("says nothing about depth for a file that has findings", () => {
    expect(
      isUncheckedClean({ findings: [{ severity: "P0" }], unverifiedBy: ["semgrep", "ruff"] }),
    ).toBe(false);
  });
});

/**
 * `dependencies` is one boolean for two different engines. When osv-scanner
 * answered the CVE question the audit phase reports "executed", and the card
 * used to name `npm audit` anyway — an engine that never ran. Measured on a
 * local scan with osv-scanner installed: the package-lock card credited
 * `npm audit` while npm audit had been skipped by design.
 */
describe("the dependency row names the engine that actually answered", () => {
  /** How often each of the two dependency engines is named on the card. */
  const names = (cov: { examined: string[] }): { npmAudit: number; osv: number } => ({
    npmAudit: cov.examined.filter((n) => n === "npm audit").length,
    osv: cov.examined.filter((n) => n === "osv-scanner").length,
  });

  it("credits osv-scanner when osv answered the CVE question", () => {
    const p: ScanProvenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      dependencyRunner: "osv",
      osv: true,
    };
    // a JS project with a lockfile: nothing is missing, and nothing is invented
    expect(scanVerdict(p, 0, JS, ["package.json", "package-lock.json"])).toEqual({
      kind: "clear",
    });
    // …and the card that credits the same answer names the program, not the row
    const examined = fileCoverage({ path: "package-lock.json", language: "JSON" }, p)!.examined;
    expect(examined.filter((n) => n === "osv-scanner")).toHaveLength(1);
    expect(examined).not.toContain("npm audit");
  });

  it("still names npm audit when npm audit is the engine that ran", () => {
    const p: ScanProvenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      dependencyRunner: "npm-audit",
      osv: false,
    };
    // osv-scanner was never installed, so the project IS shallower than a full
    // CVE scan — saying `clear` here would be the same invention from the other side
    expect(scanVerdict(p, 0, JS, ["package-lock.json"])).toEqual({
      kind: "shallow",
      missing: ["osv-scanner"],
    });
    expect(names(fileCoverage({ path: "package-lock.json", language: "JSON" }, p)!).npmAudit).toBe(
      1,
    );
    expect(names(fileCoverage({ path: "package-lock.json", language: "JSON" }, p)!).osv).toBe(0);
  });

  it("credits the lockfile card with the engine that read it, once", () => {
    const viaOsv: ScanProvenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      dependencyRunner: "osv",
      osv: true,
    };
    const cov = fileCoverage({ path: "package-lock.json", language: "JSON" }, viaOsv);
    expect(cov, "a lockfile with a finished CVE audit is covered ground").toBeTruthy();
    expect(
      names(cov!).npmAudit,
      `npm audit never ran here — osv-scanner answered the CVE question, and the card ` +
        `credits ${JSON.stringify(cov!.examined)}`,
    ).toBe(0);
    expect(names(cov!).osv, `card credits ${JSON.stringify(cov!.examined)}`).toBe(1);
  });

  it("falls back to npm audit for a payload written before the runner existed", () => {
    // no `dependencyRunner` key at all — a city JSON saved before this field
    const p = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      osv: true,
    } as ScanProvenance;
    const cov = fileCoverage({ path: "package-lock.json", language: "JSON" }, p)!;
    expect(names(cov).npmAudit).toBe(1);
  });

  it("does not credit npm audit when nothing dependency-related ran", () => {
    const p: ScanProvenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: false,
      dependencyRunner: null,
      osv: false,
    };
    expect(missingEnginesForProject(p, JS, ["package-lock.json"])).toEqual([
      "npm audit",
      "osv-scanner",
    ]);
  });

  it("names pip-audit when pip-audit answered, not the wrapper that called it", () => {
    const p: ScanProvenance = {
      regex: true,
      gitleaks: true,
      semgrep: true,
      dependencies: true,
      dependencyRunner: "pip-audit",
      osv: true,
    };
    const cov = fileCoverage({ path: "requirements.txt", language: "Text" }, p)!;
    expect(cov.examined).not.toContain("osv-scanner");
    expect(cov.examined).toContain("pip-audit");
  });
});
