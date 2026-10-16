// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoPanel } from "../src/components/InfoPanel";
import { ContextCard } from "../src/components/ContextCard";
import { t } from "../src/i18n";
import { fileCoverage, mergeEngineGaps } from "../src/city/provenance";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile, CityFinding, ScanProvenance } from "../src/city/types";

/**
 * S2 — "checked and clean" and "nobody looked at this" must be distinguishable
 * at the place the user reads the verdict. Measured in the first-touch panel:
 *  - R3-02: `config/aws.ts` (credential-shaped strings, known-example key)
 *    showed a bare "✓ No findings in this file" — nothing said WHICH engines
 *    looked (ui-aws-card-text.txt).
 *  - R3-13 (positive, must not regress): the offline card names the missing
 *    scanner — "⊘ 1 scanner did not cover this file — no finding is not clean"
 *    · semgrep (ui-offline-handlers-text.txt).
 *  - A file whose format no scanner opens has to say so in the SAME slot,
 *    not stay silent.
 * The coverage line is derived from data already in the result:
 * `scanProvenance` (which engines ran) × the engine/language table ×
 * `unverifiedBy` (which applicable engines did not).
 */

function finding(over: Partial<CityFinding> = {}): CityFinding {
  return {
    type: "CONSOLE_USAGE",
    severity: "P2",
    line: 32,
    message: "Console output — review logged values (informational)",
    provenance: "regex",
    ruleId: "regex:CONSOLE_USAGE",
    category: "hygiene",
    ...over,
  } as CityFinding;
}

function file(
  path: string,
  language: string,
  findings: CityFinding[],
  unverifiedBy?: string[],
): CityFile {
  return {
    id: `f-${path}`,
    name: path.split("/").pop() ?? path,
    path,
    language,
    linesOfCode: 30,
    cyclomaticComplexity: 2,
    threatLevel: findings.length > 0 ? "medium" : "safe",
    findings,
    unverifiedBy,
  };
}

function city(files: CityFile[], provenance: CityData["scanProvenance"]): CityData {
  const all = files.flatMap((f) => f.findings);
  const tree: CityDir = {
    name: "",
    path: "",
    fileCount: files.length,
    linesOfCode: 100,
    codeLines: 100,
    dataLines: 0,
    languages: { TypeScript: 100 },
    dataLanguages: {},
    findingsBySeverity: {
      P0: all.filter((f) => f.severity === "P0").length,
      P1: all.filter((f) => f.severity === "P1").length,
      P2: all.filter((f) => f.severity === "P2").length,
    },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
  return {
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 100 },
    totalFiles: files.length,
    renderedFiles: files.length,
    totalLines: 100,
    codeLines: 100,
    dataLines: 0,
    findingsBySeverity: tree.findingsBySeverity,
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
    unverifiedEngines: [],
    scanProvenance: provenance,
    tree,
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function show(el: ReactElement, data: CityData, lang: "en" | "de" = "en"): Promise<void> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: data,
      buildPhase: "built",
      analysisId: "scan-1",
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(el));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function select(f: CityFile): Promise<void> {
  await act(async () => useStore.getState().setSelectedUnit({ kind: "file", id: f.id }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, addListener: () => {} })),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

const text = () => (container.textContent ?? "").replace(/\s+/g, " ");

describe("the checked-clean card names the engines that looked (R3-02)", () => {
  const provenance = { regex: true, gitleaks: true, semgrep: true };

  it("derives the examined set from the payload, no new backend field", () => {
    const aws = file("config/aws.ts", "TypeScript", []);
    const cov = fileCoverage(aws, provenance);
    expect(cov).not.toBeNull();
    expect(cov!.examined).toEqual(["regex", "gitleaks", "semgrep"]);
    expect(cov!.noSecurityScan).toBe(false);
  });

  it("says which engines examined a clean file, beside the verdict line", async () => {
    const aws = file("config/aws.ts", "TypeScript", []);
    await show(createElement(InfoPanel), city([aws], provenance));
    await select(aws);
    const line = container.querySelector("[data-file-coverage]");
    expect(line, "a checked-clean card states no engines at all").toBeTruthy();
    expect(line!.getAttribute("data-file-coverage")).toBe("examined");
    expect(text()).toContain(
      t("en", "panel.coverageExamined", { engines: "regex, gitleaks, semgrep" }),
    );
    // the existing green line stays — the addition distinguishes, it does not replace
    expect(text()).toContain(t("en", "panel.noFindingsChecked"));
  });

  it("names the engines that ran but do not open the file's format", async () => {
    const css = file("styles/desktop.css", "CSS", []);
    await show(createElement(InfoPanel), city([css], provenance));
    await select(css);
    expect(text()).toContain(t("en", "panel.coverageExamined", { engines: "regex, gitleaks" }));
    expect(text()).toContain(t("en", "panel.coverageBlind", { blind: "semgrep" }));
  });

  it("states coverage for a file that has findings too", async () => {
    const subtle = file("src/subtle.js", "JavaScript", [finding()]);
    await show(createElement(InfoPanel), city([subtle], provenance));
    await select(subtle);
    expect(container.querySelector("[data-file-coverage]")).toBeTruthy();
    expect(text()).toContain(
      t("en", "panel.coverageExamined", { engines: "regex, gitleaks, semgrep" }),
    );
  });
});

describe("a format no scanner opens says so in the same slot", () => {
  it("naming only the engines that ran is not enough when none of them open it", async () => {
    const md = file("docs/notes.md", "Markdown", [], ["gitleaks"]);
    const cov = fileCoverage(md, { regex: true, gitleaks: false, semgrep: true });
    expect(cov!.noSecurityScan).toBe(true);
    expect(cov!.examined).toEqual(["regex"]);
    await show(
      createElement(InfoPanel),
      city([md], { regex: true, gitleaks: false, semgrep: true }),
    );
    await select(md);
    const line = container.querySelector("[data-file-coverage]");
    expect(line, "the unread-format card stays silent").toBeTruthy();
    expect(line!.getAttribute("data-file-coverage")).toBe("no-scanner");
    expect(line!.textContent).toContain(t("en", "panel.coverageNoScanner"));
  });
});

describe("the offline card keeps its named-missing-scanner verdict (R3-13 regression guard)", () => {
  it("does not touch UNVERIFIED, the ⊘ line or the engine list", async () => {
    const handlers = file("api/handlers.js", "JavaScript", [], ["semgrep"]);
    await show(
      createElement(InfoPanel),
      city([handlers], { regex: true, gitleaks: true, semgrep: false }),
    );
    await select(handlers);
    const verdict = container.querySelector('[data-file-verdict="unchecked"]');
    expect(verdict, "the offline card lost its unchecked box").toBeTruthy();
    // the exact R3-13 strings, byte for byte
    expect(text()).toContain("⊘");
    expect(text()).toContain("1 scanner did not cover this file — no finding is not clean");
    expect(verdict!.textContent).toContain("semgrep");
    expect(text()).not.toContain(t("en", "panel.noFindingsChecked"));
  });
});

describe("the class-coverage sentence is once per project, not per file", () => {
  it("names the classes the active rules do not cover in the project overview", async () => {
    const aws = file("config/aws.ts", "TypeScript", []);
    await show(
      createElement(ContextCard),
      city([aws], { regex: true, gitleaks: true, semgrep: true }),
    );
    const note = container.querySelector("[data-context-class-coverage]");
    expect(note, "the project overview says nothing about uncovered classes").toBeTruthy();
    expect(note!.textContent).toContain(t("en", "ctx.classCoverage"));
  });

  it("does not repeat it on the file card", async () => {
    const aws = file("config/aws.ts", "TypeScript", []);
    await show(
      createElement(InfoPanel),
      city([aws], { regex: true, gitleaks: true, semgrep: true }),
    );
    await select(aws);
    expect(container.querySelector("[data-context-class-coverage]")).toBeNull();
    expect(text()).not.toContain(t("en", "ctx.classCoverage"));
  });
});

/**
 * S14 — the dependency engine name, followed from the payload to the card.
 *
 * The cases above (and `provenance.test.ts`) type their provenance by hand.
 * These carry the keys `backend/src/services/analyzer/orchestrator.ts:479-492`
 * really writes into `summary.scanProvenance` — `dependencyRunner` included, and
 * in the third case deliberately ABSENT, as in a city JSON exported before the
 * field existed — enter through the one door a city has (`setCityData`, the only
 * place `mergeEngineGaps` runs), and are read back off the card.
 *
 * The lockfile building is the only one that can answer this: `dependencies` is
 * one boolean for two programs, and the table's `requiresFile` rule makes the
 * manifest the file where the CVE answer lives. Its `unverifiedBy` is absent on
 * arrival — the backend's per-file table (`scan-depth.ts`) names only
 * gitleaks/semgrep/ruff — so every dependency engine that shows up on these
 * cards was named by the frontend, and it has to be the program that looked.
 */

/** How often a name sits in the card's text: a program named twice is a bug. */
function countIn(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The provenance of a JS repo whose batch engines ran; the CVE keys come per case. */
function backendProvenance(over: Partial<ScanProvenance>): ScanProvenance {
  return {
    regex: true,
    gitleaks: true,
    semgrep: true,
    ruff: false,
    churn: false,
    duplicates: false,
    coverage: false,
    ...over,
  };
}

describe("the lockfile card names the engine that actually answered", () => {
  it("credits osv-scanner and never npm audit when osv answered the CVE question", async () => {
    const lock = file("package-lock.json", "JSON", []);
    const data = city(
      [lock],
      backendProvenance({ dependencies: true, dependencyRunner: "osv", osv: true }),
    );
    // the door: `mergeEngineGaps` runs inside setCityData, before any consumer reads
    useStore.getState().setCityData(data);
    await show(createElement(InfoPanel), data);
    await select(lock);

    const line = container.querySelector("[data-file-coverage]");
    expect(line, "the lockfile of a finished CVE audit says nothing about coverage").toBeTruthy();
    expect(line!.getAttribute("data-file-coverage")).not.toBe("no-scanner");
    expect(text()).toContain(
      t("en", "panel.coverageExamined", { engines: "regex, gitleaks, semgrep, osv-scanner" }),
    );
    // TWO table rows resolve to this program (the dependency row through the
    // runner, the osv row by its own label) — the card must still say it once
    expect(countIn(text(), "osv-scanner")).toBe(1);
    expect(
      text(),
      "npm audit was skipped by design here — the card credits it anyway",
    ).not.toContain("npm audit");
    // and nothing on the way in marked this lockfile as unchecked ground
    expect(lock.unverifiedBy ?? []).toEqual([]);
  });

  it("names npm audit once, as the examiner, when npm audit is the engine that ran", async () => {
    const lock = file("package-lock.json", "JSON", []);
    const data = city(
      [lock],
      backendProvenance({ dependencies: true, dependencyRunner: "npm-audit", osv: false }),
    );
    useStore.getState().setCityData(data);
    await show(createElement(InfoPanel), data);
    await select(lock);

    const line = container.querySelector("[data-file-coverage]");
    expect(line).toBeTruthy();
    expect(line!.getAttribute("data-file-coverage")).toBe("examined");
    // the runner's own name, once: no second CVE engine joins the examiners
    expect(line!.textContent).toContain("npm audit");
    expect(line!.textContent, "osv-scanner never ran — it is not an examiner").not.toContain(
      "osv-scanner",
    );
    expect(countIn(text(), "npm audit")).toBe(1);
    expect(lock.unverifiedBy).toEqual(["osv-scanner"]);
    // osv-scanner stays off the naming of WHO LOOKED; it appears once more on the
    // card, in the ⊘ gap line the merger filled — a real gap, not an invention
    expect(countIn(text(), "osv-scanner")).toBe(1);
    expect(container.querySelector('[data-file-verdict="unchecked"]')!.textContent).toContain(
      "osv-scanner",
    );
  });

  it("falls back to npm audit once for a city JSON exported before the runner existed", async () => {
    const lock = file("package-lock.json", "JSON", []);
    // an old export: the `dependencyRunner` key is not in the object at all
    const old = backendProvenance({ dependencies: true, osv: true });
    expect("dependencyRunner" in old).toBe(false);
    const data = city([lock], old);
    useStore.getState().setCityData(data);
    await show(createElement(InfoPanel), data);
    await select(lock);

    const line = container.querySelector("[data-file-coverage]");
    expect(line).toBeTruthy();
    expect(line!.getAttribute("data-file-coverage")).toBe("examined");
    expect(text()).toContain(
      t("en", "panel.coverageExamined", {
        engines: "regex, gitleaks, semgrep, npm audit, osv-scanner",
      }),
    );
    // the fallback names the engine the flag is named for — and the table's
    // second row does not turn that into a second mention of the same program
    expect(countIn(text(), "npm audit")).toBe(1);
    expect(countIn(text(), "osv-scanner")).toBe(1);
    expect(lock.unverifiedBy).toBeUndefined();
  });
});

describe("the arriving payload closes its own lockfile gap, once", () => {
  it("fills the lockfile with the audits that never read it, by their right names", async () => {
    const lock = file("package-lock.json", "JSON", []);
    // what the backend writes when the CVE question went unanswered (scanner.ts:98)
    const data = city(
      [lock],
      backendProvenance({ dependencies: false, dependencyRunner: null, osv: false }),
    );
    expect(lock.unverifiedBy, "the backend names no dependency engine on a file").toBeUndefined();
    useStore.getState().setCityData(data);
    // union, and the door runs once: a second pass finds nothing left to add
    expect(mergeEngineGaps(data)).toBe(0);
    expect(lock.unverifiedBy).toEqual(["npm audit", "osv-scanner"]);

    await show(createElement(InfoPanel), data);
    await select(lock);
    const verdict = container.querySelector('[data-file-verdict="unchecked"]');
    expect(verdict, "the gap the merger filled never reaches the card").toBeTruthy();
    expect(verdict!.textContent).toContain("npm audit");
    expect(verdict!.textContent).toContain("osv-scanner");
    // named once each: the examined line does not repeat the engine that did not run
    expect(countIn(text(), "npm audit")).toBe(1);
    expect(countIn(text(), "osv-scanner")).toBe(1);
  });

  it("leaves the lockfile of a scan where osv answered unmarked", () => {
    const lock = file("package-lock.json", "JSON", []);
    const data = city(
      [lock],
      backendProvenance({ dependencies: true, dependencyRunner: "osv", osv: true }),
    );
    useStore.getState().setCityData(data);
    expect(lock.unverifiedBy, "osv-scanner answered — the lockfile was looked at").toBeUndefined();
    expect(mergeEngineGaps(data)).toBe(0);
  });
});
