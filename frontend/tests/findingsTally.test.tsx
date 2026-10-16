// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FindingsPanel } from "../src/components/FindingsPanel";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile, CityFinding, Severity } from "../src/city/types";

/**
 * The panel used to show three numbers that could never be added up: the list
 * counted findings on files the city draws, the priority chips counted the
 * scan, and the rule chips showed the eight most frequent of them. A reader
 * cannot tell those apart, so the panel now states the difference.
 */

function finding(rule: string, severity: Severity = "P2"): CityFinding {
  return { type: rule, ruleId: rule, severity, line: 3, message: `${rule} fired` };
}

function file(path: string, findings: CityFinding[]): CityFile {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 40,
    cyclomaticComplexity: 3,
    threatLevel: findings.length > 0 ? "medium" : "safe",
    findings,
  };
}

function city(files: CityFile[], bySeverity: Record<Severity, number>): CityData {
  const tree: CityDir = {
    name: "root",
    path: "",
    fileCount: files.length,
    linesOfCode: files.length * 40,
    codeLines: files.length * 40,
    dataLines: 0,
    languages: { TypeScript: files.length * 40 },
    dataLanguages: {},
    findingsBySeverity: bySeverity,
    threatScore: 10,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
  return {
    repo: { owner: "o", name: "r", branch: "main" },
    totalFiles: files.length,
    renderedFiles: files.length,
    totalLines: files.length * 40,
    codeLines: files.length * 40,
    dataLines: 0,
    findingsBySeverity: bySeverity,
    languages: { TypeScript: files.length * 40 },
    dataLanguages: {},
    tree,
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
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function show(component: ReactElement, data: CityData, extra = {}): Promise<string> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: data,
      buildPhase: "built",
      analysisId: "scan-1",
      showFindings: true,
      ...extra,
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(component));
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("the findings tally", () => {
  it("names the findings the list cannot show", async () => {
    // three drawn findings, a scan that reported five
    const data = city(
      [file("a.ts", [finding("rule_a"), finding("rule_b")]), file("b.ts", [finding("rule_c")])],
      { P0: 1, P1: 1, P2: 3 },
    );
    const text = await show(<FindingsPanel />, data);
    expect(text).toContain("3 findings in 2 files");
    expect(text).toContain("2 more sit on files this view does not draw");
  });

  it("stays quiet when the list and the scan agree", async () => {
    const data = city([file("a.ts", [finding("rule_a"), finding("rule_b")])], {
      P0: 0,
      P1: 0,
      P2: 2,
    });
    const text = await show(<FindingsPanel />, data);
    expect(text).toContain("2 findings in 1 file");
    expect(text).not.toContain("does not draw");
  });

  it("does not compare across a severity filter, where the totals are not comparable", async () => {
    const data = city([file("a.ts", [finding("rule_a", "P0")])], { P0: 1, P1: 4, P2: 0 });
    const text = await show(<FindingsPanel />, data, { threatFilter: "P0" });
    expect(text).not.toContain("does not draw");
  });

  it("says how many rules the chip row left out, and shows them on demand", async () => {
    const rules = Array.from({ length: 10 }, (_, i) => `rule_${i}`);
    const data = city(
      [
        file(
          "a.ts",
          rules.map((r) => finding(r)),
        ),
      ],
      { P0: 0, P1: 0, P2: 10 },
    );
    const text = await show(<FindingsPanel />, data);
    // Scoped to the chip row: the list below names every rule anyway.
    const chipRow = () =>
      [...container.querySelectorAll('[role="group"]')].find(
        (g) => g.getAttribute("aria-label") === "Filter findings by rule",
      )?.textContent ?? "";
    expect(chipRow()).toContain("rule_0");
    expect(chipRow()).not.toContain("rule_9");
    expect(text).toContain("+2 rules");

    const toggle = [...container.querySelectorAll("button")].find((b) =>
      /^\+2 rules$/.test((b.textContent ?? "").trim()),
    );
    await act(async () => toggle!.click());
    expect(chipRow()).toContain("rule_9");
    expect(container.textContent).toContain("fewer rules");
  });
});

/**
 * V2 (S-P4): the project tally. It must be right in both languages, count
 * verdicts against the CURRENT scan, and carry orphaned verdicts along
 * honestly — labelled apart, never folded into the judged count (a verdict
 * whose finding is gone must not claim that finding is decided).
 */
describe("the project tally (Beurteilt X / Y)", () => {
  const three = () =>
    city(
      [file("a.ts", [finding("rule_a"), finding("rule_b")]), file("b.ts", [finding("rule_c")])],
      { P0: 0, P1: 0, P2: 3 },
    );
  const tally = () => container.querySelector<HTMLElement>("[data-judged-tally]");

  it("stays out until the first verdict exists", async () => {
    await show(<FindingsPanel />, three());
    expect(tally()).toBeNull();
  });

  it("reads 1 / 3 after the first verdict — in English", async () => {
    await show(<FindingsPanel />, three(), { reviews: { "a.ts#0": "reviewed" } });
    expect(tally()?.textContent).toContain("Reviewed 1 / 3");
  });

  it("reads 1 / 3 after the first verdict — in German", async () => {
    await show(<FindingsPanel />, three(), {
      reviews: { "a.ts#0": "reviewed" },
      prefs: { ...useStore.getInitialState().prefs, lang: "de" },
    });
    expect(tally()?.textContent).toContain("Beurteilt 1 / 3");
  });

  it("counts the full round in both languages", async () => {
    const reviews = { "a.ts#0": "reviewed", "a.ts#1": "to-fix", "b.ts#0": "false-positive" };
    await show(<FindingsPanel />, three(), { reviews });
    expect(tally()?.textContent).toContain("Reviewed 3 / 3");
    await act(async () => root.unmount());
    container.remove();
    await show(<FindingsPanel />, three(), {
      reviews,
      prefs: { ...useStore.getInitialState().prefs, lang: "de" },
    });
    expect(tally()?.textContent).toContain("Beurteilt 3 / 3");
  });

  it("counts orphaned verdicts along, labelled apart, never as judged findings", async () => {
    // one verdict matches (a.ts#0), one is stranded in the project bucket —
    // the tally must read 1 / 3, and name the stranded one in the same line
    await show(<FindingsPanel />, three(), {
      reviews: { "a.ts#0": "reviewed" },
      orphanedReviews: 1,
    });
    expect(tally()?.textContent).toContain("Reviewed 1 / 3 · 1 orphaned");
    expect(container.textContent).toContain("Recorded verdicts with no matching finding here: 1");

    await act(async () => root.unmount());
    container.remove();
    await show(<FindingsPanel />, three(), {
      reviews: { "a.ts#0": "reviewed" },
      orphanedReviews: 2,
      prefs: { ...useStore.getInitialState().prefs, lang: "de" },
    });
    expect(tally()?.textContent).toContain("Beurteilt 1 / 3 · 2 verwaist");
    expect(container.textContent).toContain(
      "Gespeicherte Bewertungen ohne passenden Fund in dieser Stadt: 2",
    );
  });
});
