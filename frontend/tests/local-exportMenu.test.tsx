// @vitest-environment jsdom
// The two report exports of the whole scan answered only from inside a file's
// detail panel, so the way out of the city for a report was: click a building
// first. These guards pin the menu entries and the URLs they hand to the local
// backend — a report nobody finds is a report that does not exist.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { DICT, type DictKey } from "../src/i18n";
import type { CityData, CityFile } from "../src/city/types";

const file: CityFile = {
  id: "file:a.ts",
  name: "a.ts",
  path: "a.ts",
  language: "TypeScript",
  linesOfCode: 12,
  cyclomaticComplexity: 3,
  threatLevel: "critical",
  findings: [{ type: "EVAL_USAGE", ruleId: "EVAL_USAGE", severity: "P0", line: 3, message: "m" }],
};

const city = {
  repo: { owner: "local", name: "plain", branch: "main" },
  analysisId: "scan-77",
  languages: { TypeScript: 12 },
  totalFiles: 1,
  renderedFiles: 1,
  threatScore: 1,
  findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
  fileConnections: [],
  dirConnections: [],
  meta: {},
  tree: {
    name: "plain",
    path: "",
    fileCount: 1,
    linesOfCode: 12,
    findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
    children: [],
    detailFiles: [file],
    remainingFiles: 0,
    districtFiles: [],
  },
} as unknown as CityData;

let container: HTMLDivElement;
let root: Root;
let clicked: Array<{ href: string; download: string }>;

const button = (needle: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll("button")).find((e) =>
    (e.textContent ?? "").includes(needle),
  );
  if (!found) throw new Error(`no button with "${needle}"`);
  return found as HTMLButtonElement;
};

async function openMenu(): Promise<void> {
  await act(async () => button("More").click());
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState(
    { ...useStore.getInitialState(), cityData: city, buildPhase: "built", analysisId: "scan-77" },
    true,
  );
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ActionBar />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the city report exports in the action dock", () => {
  it("offers SARIF and NDJSON without selecting a building", async () => {
    await openMenu();
    expect(button("Export SARIF").getAttribute("aria-disabled")).toBe("false");
    expect(button("Export findings (NDJSON)").getAttribute("aria-disabled")).toBe("false");
  });

  it("hands both to the scan the local backend holds", async () => {
    await openMenu();
    await act(async () => button("Export SARIF").click());
    await openMenu();
    await act(async () => button("Export findings (NDJSON)").click());
    expect(clicked.map((c) => `${c.download} <- ${new URL(c.href).pathname}`)).toEqual([
      "ephemora-scan-77.sarif <- /api/result/scan-77/sarif",
      "ephemora-scan-77.ndjson <- /api/result/scan-77/handoff",
    ]);
  });

  it("says which export it started", async () => {
    await openMenu();
    await act(async () => button("Export SARIF").click());
    expect(container.textContent).toContain("ephemora-scan-77.sarif saved to your downloads.");
  });

  it("refuses both when the city has no scan on the server", async () => {
    await act(async () => useStore.setState({ analysisId: null }));
    await openMenu();
    expect(button("Export SARIF").getAttribute("aria-disabled")).toBe("true");
    expect(button("Export findings (NDJSON)").getAttribute("aria-disabled")).toBe("true");
    await act(async () => button("Export SARIF").click());
    expect(clicked).toEqual([]);
  });

  it("names both actions in both languages", () => {
    for (const key of [
      "actions.exportSarif",
      "actions.exportSarifTitle",
      "actions.exportHandoff",
      "actions.exportHandoffTitle",
      "actions.exportNoScanTitle",
      "actions.triageOpenWord",
      "actions.triageNoneAhead",
    ] as DictKey[]) {
      const entry = DICT[key];
      expect(entry, `${key} missing`).toBeTruthy();
      expect(entry.en.trim().length, `${key} has no English`).toBeGreaterThan(0);
      expect(entry.de.trim().length, `${key} has no German`).toBeGreaterThan(0);
      expect(entry.de, `${key} untranslated`).not.toBe(entry.en);
    }
  });
});
