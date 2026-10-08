// @vitest-environment jsdom
// The focus pulse, its auto-expand and its scroll-into-view all keyed off one
// comparison in the panel — and that comparison matched the POSITIONAL focus
// key (`${fileId}#${index}`, what triage, search and the findings list write)
// against the FINGERPRINT verdict key (`fp:…`, what a re-scan reads back). On
// any payload whose findings carry a fingerprint — every city the mapper builds
// — no row ever lit up. Measured on the running app: 8 queue steps, zero
// `.finding-focused` nodes, and the verdict control was out of reach because the
// panel never expanded the row. These tests pin both halves: the lit row, and
// the verdict surviving the next scan of the same folder.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InfoPanel } from "../src/components/InfoPanel";
import { useStore } from "../src/stores/useStore";
import { findingKey, projectKey } from "../src/reviews";
import type { CityData, CityFile, CityFinding } from "../src/city/types";

function finding(type: string, line: number, fingerprint: string): CityFinding {
  return {
    type,
    ruleId: type,
    severity: line === 3 ? "P0" : "P2",
    line,
    message: `${type} at line ${line}`,
    code: "x",
    fingerprint,
  } as CityFinding;
}

function file(id: string, path: string, findings: CityFinding[]): CityFile {
  return {
    id: `file:${id}`,
    name: id,
    path,
    language: "TypeScript",
    linesOfCode: 40,
    cyclomaticComplexity: 4,
    threatLevel: "critical",
    findings,
  };
}

/** Two scans of the same folder: same paths, same fingerprints, new objects. */
function city(): CityData {
  return {
    repo: { owner: "local", name: "plain", branch: "main" },
    analysisId: "scan-a",
    languages: { TypeScript: 80 },
    totalFiles: 2,
    renderedFiles: 2,
    threatScore: 2,
    findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: {
      name: "plain",
      path: "",
      fileCount: 2,
      linesOfCode: 80,
      findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
      children: [],
      detailFiles: [
        file("a.ts", "a.ts", [
          finding("EVAL_USAGE", 3, "aaaa1111"),
          finding("DEBUG_LOG", 9, "aaaa2222"),
        ]),
        file("b.ts", "b.ts", [finding("HARDCODED_SECRET", 12, "bbbb3333")]),
      ],
      remainingFiles: 0,
      districtFiles: [],
    },
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function render(): Promise<void> {
  await act(async () => root.render(<InfoPanel />));
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has neither of these, and the panel uses both: the narrow-screen
  // focus move and the focused row's scrollIntoView.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {} })),
  );
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  useStore.setState({ ...useStore.getInitialState() }, true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("the finding the queue points at lights up", () => {
  it("marks the row triage opened on, even though it is keyed by fingerprint", async () => {
    useStore.getState().setCityData(city());
    useStore.getState().setAnalysisId("scan-a");
    useStore.getState().startTriage();
    await render();
    const focused = container.querySelector(".finding-focused");
    expect(focused, "no row carries the triage focus").toBeTruthy();
    expect(focused!.textContent).toContain("EVAL_USAGE at line 3");
    expect(
      container.querySelectorAll(
        '[aria-label="Verdict for this finding"], div[role="group"] button[aria-pressed]',
      ).length,
      "the verdict control has to be reachable on the focused row",
    ).toBeGreaterThan(0);
  });

  it("keeps the focus on the row the findings list picked", async () => {
    useStore.getState().setCityData(city());
    await render();
    await act(async () => useStore.getState().setFocusedFindingKey(findingKey("file:b.ts", 0)));
    await act(async () => useStore.getState().navigateToFile("file:b.ts"));
    const focused = container.querySelector(".finding-focused");
    expect(focused?.textContent).toContain("HARDCODED_SECRET at line 12");
  });
});

describe("a verdict outlives the scan it was given in", () => {
  it("stores it under the fingerprint and reads it back on the next scan", async () => {
    useStore.getState().setCityData(city());
    useStore.getState().startTriage();
    await render();
    const toFix = Array.from(container.querySelectorAll(".finding-focused button")).find((b) =>
      (b.textContent || "").includes("To fix"),
    );
    expect(toFix, "no verdict control on the focused row").toBeTruthy();
    await act(async () => (toFix as HTMLButtonElement).click());

    const bucket = projectKey({ owner: "local", name: "plain" });
    const stored = Object.keys(localStorage).find((k) => k.startsWith("codecity-reviews:"))!;
    expect(JSON.parse(localStorage.getItem(stored)!)).toEqual({ "fp:aaaa1111": "to-fix" });
    expect(stored.replace("codecity-reviews:", "").startsWith("p-")).toBe(true);
    void bucket;

    // The same folder scanned again: new payload objects, same fingerprints.
    // A fresh city clears the selection, so the panel needs its building back.
    await act(async () => {
      useStore.getState().setCityData(city());
      useStore.getState().navigateToFile("file:a.ts");
    });
    await render();
    expect(useStore.getState().reviews["fp:aaaa1111"]).toBe("to-fix");
    const pressed = Array.from(
      container.querySelectorAll('div[role="group"] button[aria-pressed="true"]'),
    ).map((b) => (b.textContent || "").trim());
    expect(pressed).toContain("To fix");
  });
});
