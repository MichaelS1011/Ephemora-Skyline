// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanSummary } from "../src/components/ScanSummary";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, DroppedFiles } from "../src/city/types";

/**
 * One file, one sentence (R1-23, R2-13, R3-10).
 *
 * Three panel lanes independently read `1 files were not read` and
 * `1 files analyzed` on a one-file scan — the summary line the README holds
 * up as the honesty showcase cannot count to one. The singular branches
 * existed in the same i18n layer for every other drop row; this test wires
 * and pins the two that missed it, in EN and DE.
 */
const DRIVE_SCAN_ID = "plural-branch-1";

function dir(path = ""): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: 1,
    linesOfCode: 3,
    languages: { TypeScript: 3 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [],
    districtFiles: [],
    remainingFiles: 0,
  };
}

function city(overrides: Partial<CityData> = {}): CityData {
  return {
    repo: { owner: "local", name: "one", branch: "local" },
    analysisId: DRIVE_SCAN_ID,
    totalFiles: 1,
    renderedFiles: 1,
    totalLines: 3,
    languages: { TypeScript: 3 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: dir(),
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
    ...overrides,
  };
}

/** exactly one path left unread, at the scanner */
const ONE_DROP: DroppedFiles = {
  pathTooLong: 0,
  unsafePath: 0,
  tooLarge: 0,
  unreadable: 0,
  excluded: 0,
  gitIgnored: 0,
  gitBudget: 0,
  unsupportedFormat: 1,
};

let host: HTMLDivElement;
let root: Root;

function render(node: ReactElement): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}

const seen = (): string => (host.textContent ?? "").replace(/\s+/g, " ");
const strip = (): string => {
  const el = host.querySelector(".start-summary-strip");
  return (el?.textContent ?? "").replace(/\s+/g, " ");
};

function useCity(c: CityData, lang: "en" | "de" = "en"): void {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: c,
      analysisId: c.analysisId ?? DRIVE_SCAN_ID,
      buildPhase: "built",
    },
    true,
  );
}

/** the card closes itself after a dwell; the strip is the shape that stays */
function collapse(): void {
  const close = host.querySelector(".start-summary-close") as HTMLElement;
  act(() => close.click());
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the one-file scan counts to one", () => {
  it("English card: 1 file analyzed, the one-file drop row — never the plural", () => {
    useCity(city({ dropped: ONE_DROP }));
    render(<ScanSummary />);
    const card = seen();
    expect(card).toContain("1 file analyzed");
    expect(card).not.toContain("1 files analyzed");
    // the drop row beside it already branched; the fix must not break it
    expect(card).toContain("1 file in a format the scanners do not read");
    expect(card).not.toContain("1 files were not read");
  });

  it("English strip: the same line the witness read verbatim", () => {
    useCity(city({ dropped: ONE_DROP }));
    render(<ScanSummary />);
    collapse();
    const line = strip();
    expect(line).toContain("1 file analyzed");
    expect(line).toContain("1 file was not read");
    expect(line).not.toContain("1 files");
  });

  it("German card and strip branch too", () => {
    useCity(city({ dropped: ONE_DROP }), "de");
    render(<ScanSummary />);
    const card = seen();
    expect(card).toContain("1 Datei analysiert");
    expect(card).not.toContain("1 Dateien analysiert");
    collapse();
    const line = strip();
    expect(line).toContain("1 Datei analysiert");
    expect(line).toContain("1 Datei wurde nicht gelesen");
  });

  it("two files still wear the plural — nothing here trades one bug for another", () => {
    useCity(
      city({
        totalFiles: 2,
        dropped: { ...ONE_DROP, unsupportedFormat: 2 },
      }),
    );
    render(<ScanSummary />);
    collapse();
    const line = strip();
    expect(line).toContain("2 files analyzed");
    expect(line).toContain("2 files were not read");
  });
});
