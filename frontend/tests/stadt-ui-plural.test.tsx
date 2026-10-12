// @vitest-environment jsdom
// A number that shows with a noun has to agree with it. Measured before this
// file: "Bezirk scripts — 1 Funde hier", "1 Unterbezirke", "1 findings in this
// queue still need a verdict", and an English "finding(s)" that dodged the
// question. Three of those singular branches were already in the dictionary
// with no caller; the helper written for the fourth (`plural()`) had none.
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { districtMarked } from "../src/interaction/shortcuts";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile, CityFinding } from "../src/city/types";

const marked = (over: Partial<Parameters<typeof districtMarked>[1]> = {}) =>
  districtMarked("de", { name: "scripts", files: 1, findings: 1, children: 1, ...over });

describe("the district marker agrees with its own numbers", () => {
  it("says one finding and one file where the plot holds one of each", () => {
    expect(marked()).toBe("Bezirk scripts — 1 Fund hier, 1 Datei, Enter geht hinein");
    expect(marked({ findings: 0 })).toBe(
      "Bezirk scripts — 1 Datei, 1 Unterbezirk, Enter geht hinein",
    );
  });

  it("keeps the plural it means at two and three", () => {
    expect(districtMarked("de", { name: "src", files: 2, findings: 3, children: 4 })).toBe(
      "Bezirk src — 3 Funde hier, 2 Dateien, Enter geht hinein",
    );
    expect(districtMarked("de", { name: "src", files: 2, findings: 0, children: 4 })).toBe(
      "Bezirk src — 2 Dateien, 4 Unterbezirke, Enter geht hinein",
    );
  });

  it("answers the audit's own case in English without an (s)", () => {
    expect(districtMarked("en", { name: "frontend", files: 1, findings: 1, children: 0 })).toBe(
      "District frontend — 1 finding here, 1 file, Enter walks in",
    );
    expect(districtMarked("en", { name: "frontend", files: 34, findings: 2, children: 0 })).toBe(
      "District frontend — 2 findings here, 34 files, Enter walks in",
    );
    expect(districtMarked("en", { name: "scripts", files: 5, findings: 0, children: 1 })).toBe(
      "District scripts — 5 files, 1 sub-district, Enter walks in",
    );
  });

  it("groups a large count the way the sentence's language does", () => {
    expect(districtMarked("de", { name: "x", files: 3300, findings: 1, children: 0 })).toContain(
      "1 Fund hier, 3.300 Dateien",
    );
    expect(districtMarked("en", { name: "x", files: 3300, findings: 0, children: 0 })).toContain(
      "3,300 files",
    );
  });
});

/* ── the dock, at the one-finding count it got wrong ──────────────────────── */

const finding = (): CityFinding =>
  ({
    type: "HARDCODED_SECRET",
    severity: "P0",
    line: 2,
    message: "Hardcoded secret detected",
    provenance: "gitleaks",
    ruleId: "generic-api-key",
    category: "secrets",
  }) as CityFinding;

/** `count` files, each with exactly one finding, so the queue holds `count`. */
function oneFindingCity(count: number): CityData {
  const files: CityFile[] = Array.from({ length: count }, (_, i) => ({
    id: `f-${i}`,
    name: `c${i}.js`,
    path: `src/c${i}.js`,
    language: "JavaScript",
    linesOfCode: 3,
    cyclomaticComplexity: 1,
    threatLevel: "critical",
    findings: [finding()],
  }));
  const tree = {
    name: "probe",
    path: "",
    fileCount: count,
    linesOfCode: 3 * count,
    languages: { JavaScript: 3 * count },
    findingsBySeverity: { P0: count, P1: 0, P2: 0 },
    threatScore: 60,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: [],
  } as unknown as CityDir;
  return {
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { JavaScript: 3 * count },
    totalFiles: count,
    renderedFiles: count,
    findingsBySeverity: { P0: count, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree,
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function dock(findings: number, lang: "de" | "en"): Promise<string> {
  container = document.createElement("div");
  document.body.append(container);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: oneFindingCity(findings),
      triageActive: true,
      buildPhase: "built",
      analysisId: "scan-1",
    },
    true,
  );
  root = createRoot(container);
  await act(async () => root.render(createElement(ActionBar)));
  const titles = [...container.querySelectorAll("[title]")].map((e) => e.getAttribute("title"));
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
  return [...titles, ...labels].join(" | ");
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the dock names the queue it holds", () => {
  it("calls one open finding one, in both languages", async () => {
    const de = await dock(1, "de");
    expect(de).toContain("1 Fund in dieser Warteschlange braucht noch ein Urteil");
    expect(de).toContain("Fund 1");
    expect(de).not.toMatch(/1 Funde|brauchen noch/);

    const en = await dock(1, "en");
    expect(en).toContain("1 finding in this queue still needs a verdict");
    expect(en).toContain("Finding 1");
    expect(en).not.toMatch(/1 findings|need a verdict/);
  });

  it("keeps the plural at two", async () => {
    const de = await dock(2, "de");
    expect(de).toContain("2 Funde in dieser Warteschlange brauchen noch ein Urteil");
    expect(de).toContain("Funde 2");
  });
});
