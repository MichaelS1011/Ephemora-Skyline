// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanSummary } from "../src/components/ScanSummary";
import { HudOverlay } from "../src/components/HudOverlay";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, DroppedFiles } from "../src/city/types";

/**
 * The arithmetic of the first drive, without a drive.
 *
 * `scripts/first-drive.mjs` proves the sentence on the screen once a folder has
 * been carried through a browser, a backend and two scanners. That is the right
 * proof for a release and the wrong one for a Tuesday: it needs a machine with
 * free ports, and nobody runs it before every merge. What can live without a
 * browser is the claim under the numbers — that the two counts the screen prints
 * are the folder, and that the one number it prints for "not read" is the sum of
 * both records that lost the paths.
 *
 * The payload below is the drive's own: a folder of 13 paths, 8 of them read, 5
 * not. Four of the five left at the scanner and one at the reader, which is the
 * half nobody sees in the browser and the half a refactor can drop without the
 * screen noticing. It is the same shape `fahrt-drop-account.test.ts` checks on
 * the server side; here it is checked as the sentence a person reads.
 */

/** the folder the drive wrote, counted on the disk by that script */
const PATHS_IN_FOLDER = 13;

/** the id the run's city carries; the card announces a scan, not a render */
const DRIVE_SCAN_ID = "fahrt-drive-1";

function dir(path = ""): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: 8,
    linesOfCode: 44,
    languages: { TypeScript: 22, SQL: 7, JSON: 8, Shell: 7 },
    findingsBySeverity: { P0: 2, P1: 1, P2: 0 },
    threatScore: 4,
    topFindings: [],
    children: [],
    detailFiles: [],
    districtFiles: [],
    remainingFiles: 0,
  };
}

function city(overrides: Partial<CityData> = {}): CityData {
  return {
    repo: { owner: "local", name: "target", branch: "local" },
    analysisId: DRIVE_SCAN_ID,
    totalFiles: 8,
    renderedFiles: 8,
    totalLines: 44,
    languages: { TypeScript: 22, SQL: 7, JSON: 8, Shell: 7 },
    findingsBySeverity: { P0: 2, P1: 1, P2: 0 },
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

/** the merged record the drive's folder produces: 4 at the scanner, 1 at the reader */
const DRIVE_DROPS: DroppedFiles = {
  pathTooLong: 0,
  unsafePath: 0,
  tooLarge: 0,
  unreadable: 0,
  excluded: 0,
  gitIgnored: 0,
  gitBudget: 0,
  unsupportedFormat: 5,
};

const unreadSum = (d: DroppedFiles) =>
  Object.values(d).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

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

const numberBefore = (text: string, words: string): number | null => {
  const m = new RegExp(`([\\d.,]+)\\s${words}`).exec(text);
  return m ? Number((m[1] ?? "0").replace(/[^\d]/g, "")) : null;
};

/**
 * The grade census lives on the header, not on the announcement.
 *
 * The card used to repeat ▲/◆/● with their counts right under "Scan complete"
 * — one more surface stating numbers the header above already stated and the
 * project card stated again. `tests/arrival-budget.test.tsx` now pins that
 * exactly one surface says them, so the arithmetic the drive reads is tied to
 * the header's chips instead.
 */
const headerChips = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const el of [...host.querySelectorAll(".workspace-severities button[data-severity]")]) {
    const label = el.querySelector(".severity-label")?.textContent?.trim();
    const count = (el.textContent ?? "").match(/(\d[\d.,]*)/);
    if (!label || !count) continue;
    out[label] = Number((count[1] ?? "0").replace(/[^\d]/g, ""));
  }
  return out;
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // the card counts down at itself on a timer; held still, so a tick cannot
  // land outside act() and turn a green run into a warning about the test
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** the card closes itself after a dwell; the strip is the shape that stays */
function collapse(): void {
  const close = host.querySelector(".start-summary-close") as HTMLElement;
  act(() => close.click());
}

describe("the sentence the first drive reads", () => {
  it("carries both counts and the reason, in the English run's own words", () => {
    useCity(city({ dropped: DRIVE_DROPS }));
    render(<ScanSummary />);
    const card = seen();
    expect(card).toContain("Scan complete");
    expect(card).toContain("8 files analyzed");
    expect(card).toContain("5 files in a format the scanners do not read");
    // the grades are the header's to state; on a payload that HAS them, the
    // card staying quiet is the claim (a zero-finding fixture cannot fail this)
    expect(card, "the announcement no longer repeats the grade census").not.toMatch(
      /(Critical|High|Medium)\s*:?\s*\d|\d\s*(Critical|High|Medium)/,
    );
    expect(card).not.toMatch(/too large or unreadable/);
  });

  it("labels a live delta as live even when it carries findings", () => {
    useCity(
      city({
        scanProvenance: {
          regex: true,
          gitleaks: true,
          semgrep: true,
          live: {
            at: "2026-10-20T10:00:00.000Z",
            fullScanAt: "2026-10-20T09:00:00.000Z",
            changed: 1,
            added: 0,
            removed: 0,
            refreshed: 1,
            stale: ["semgrep"],
          },
        },
      }),
      "de",
    );
    render(<ScanSummary />);
    expect(seen()).toContain("Live — nur eingebaute Regeln · 3 Funde");
    expect(seen()).not.toContain("Scan complete");
  });

  /**
   * The strip is where the three numbers sit in one line, which is where the
   * arithmetic either closes or does not. Checked by parsing what was rendered,
   * not by re-reading the payload the render was handed — and the grade split
   * is read off the header, which is the surface that now owns it.
   */
  it("adds up on the one line that outlives the card", () => {
    useCity(city({ dropped: DRIVE_DROPS }));
    render(
      <>
        <ScanSummary />
        <HudOverlay apiStatus="live" />
      </>,
    );

    const chips = headerChips();
    expect(chips).toEqual({ Critical: 2, High: 1 });
    expect(Object.keys(chips).sort(), "no medium was planted, so no chip may carry one").toEqual([
      "Critical",
      "High",
    ]);
    const chipSum = Object.values(chips).reduce((a, b) => a + b, 0);

    collapse();
    const line = strip();
    const analyzed = numberBefore(line, "files analyzed");
    const unread = numberBefore(line, "files were not read");
    const findings = numberBefore(line, "findings to review");

    expect(analyzed).toBe(8);
    expect(unread).toBe(5);
    expect(findings).toBe(3);
    expect((analyzed ?? 0) + (unread ?? 0)).toBe(PATHS_IN_FOLDER);
    expect(chipSum).toBe(findings);
  });

  /**
   * Not a tautology: the folder's paths only add up because the two records
   * that lost paths were summed. Hand the card the scanner's half alone — what
   * a merge that forgets the reader looks like — and the same sentence, with the
   * same confidence, no longer accounts for the folder.
   */
  it("stops being the folder when one record goes missing", () => {
    const scannerOnly: DroppedFiles = { ...DRIVE_DROPS, unsupportedFormat: 4 };
    useCity(city({ dropped: scannerOnly }));
    render(<ScanSummary />);
    collapse();
    const line = strip();
    const analyzed = numberBefore(line, "files analyzed") ?? 0;
    const unread = numberBefore(line, "files were not read") ?? 0;

    expect(unread).toBe(4);
    expect(analyzed + unread, "a path the reader declined is nobody's count now").not.toBe(
      PATHS_IN_FOLDER,
    );
    expect(analyzed + unread).toBe(PATHS_IN_FOLDER - 1);
  });

  /**
   * The German surface carries the same three numbers; the run in the browser
   * was English, so the words are different and the arithmetic must not be.
   */
  it("says the same folder in German", () => {
    useCity(city({ dropped: DRIVE_DROPS }), "de");
    render(<ScanSummary />);
    const card = seen();
    expect(card).toContain("Scan abgeschlossen");
    expect(card).toContain("8 Dateien analysiert");
    expect(card).toContain("5 Dateien in einem Format, das die Scanner nicht lesen");
    collapse();
    const line = strip();
    expect(line).toContain("3 Funde zur Prüfung");
    expect(numberBefore(line, "Dateien wurden nicht gelesen")).toBe(5);
    expect((numberBefore(line, "Dateien analysiert") ?? 0) + 5).toBe(PATHS_IN_FOLDER);
  });

  /**
   * A folder that was read completely must not grow a drop line to look busy —
   * the same card, the same code, no counts to report.
   */
  it("says nothing about unread paths when the folder had none", () => {
    const none: DroppedFiles = {
      pathTooLong: 0,
      unsafePath: 0,
      tooLarge: 0,
      unreadable: 0,
      excluded: 0,
      gitIgnored: 0,
      gitBudget: 0,
      unsupportedFormat: 0,
    };
    expect(unreadSum(none)).toBe(0);
    useCity(city({ dropped: none }));
    render(<ScanSummary />);
    expect(host.querySelector(".start-summary-drops")).toBeNull();
    collapse();
    expect(strip(), "the strip must not claim a loss it did not count").not.toContain(
      "were not read",
    );
    expect(strip()).toContain("8 files analyzed");
  });

  /**
   * Measured on this repository's own folder: 1,470 of its 3,266 .git files did
   * not fit the 15 MB history budget. They are not oversized and the row must
   * not say they are — and it must not talk about churn on a scan where churn
   * never ran, which is exactly what this repository's scan reported.
   */
  it("names the history budget as its own reason, and ties it to churn only when churn ran", () => {
    const drops: DroppedFiles = { ...DRIVE_DROPS, unsupportedFormat: 0, gitBudget: 1470 };
    useCity(city({ dropped: drops, scanProvenance: { churn: false } as never }));
    render(<ScanSummary />);
    expect(seen()).toContain("1,470 .git files went past the 15 MB history budget");
    expect(seen()).not.toContain("churn rests");
    expect(seen()).not.toMatch(/too large or unreadable/);
    collapse();
    expect(strip()).toContain("1,470");
    act(() => root.unmount());

    useCity(city({ dropped: drops, scanProvenance: { churn: true } as never }));
    render(<ScanSummary />);
    expect(seen()).toContain("churn rests on the history that arrived");
  });
});
