// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoPanel } from "../src/components/InfoPanel";
import { t, type Lang } from "../src/i18n";
import { verdictBasis } from "../src/city/provenance";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile, CityFinding, Severity } from "../src/city/types";

/**
 * S2 · R3-03: `src/subtle.js` holds six severe classes no active rule looks
 * for (IDOR, SSRF, race, Math.random token, CORS wildcard, prototype
 * pollution) and earns a bare MEDIUM chip whose only basis is one P2
 * `regex:CONSOLE_USAGE` hygiene note — "Console output — review logged values
 * (informational)". The risk word implies a security judgement the rules never
 * made. The chip must carry its basis when that basis is a review-level note
 * rather than a security rule: "MEDIUM · from 1 review-level note (console
 * output), no security rule matched". This presents provenance; it does not
 * change the underlying computation.
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

function file(path: string, findings: CityFinding[]): CityFile {
  const worst = (["P0", "P1", "P2"] as const).find((s) => findings.some((f) => f.severity === s));
  return {
    id: `f-${path}`,
    name: path.split("/").pop() ?? path,
    path,
    language: "JavaScript",
    linesOfCode: 34,
    cyclomaticComplexity: 5,
    threatLevel: worst === "P2" ? "medium" : "high",
    findings,
  };
}

function city(files: CityFile[]): CityData {
  const count = (sev: Severity) =>
    files.reduce((s, f) => s + f.findings.filter((q) => q.severity === sev).length, 0);
  const tree: CityDir = {
    name: "",
    path: "",
    fileCount: files.length,
    linesOfCode: 100,
    codeLines: 100,
    dataLines: 0,
    languages: { JavaScript: 100 },
    dataLanguages: {},
    findingsBySeverity: { P0: count("P0"), P1: count("P1"), P2: count("P2") },
    threatScore: 3,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
  return {
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { JavaScript: 100 },
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
    scanProvenance: { regex: true, gitleaks: true, semgrep: true },
    tree,
  } as unknown as CityData;
}

let container: HTMLDivElement;
let root: Root;

async function show(el: ReactElement, data: CityData, lang: Lang = "en"): Promise<void> {
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

const basisEn = (lang: Lang, count: number, notes: string) =>
  t(lang, count === 1 ? "panel.chipBasisOne" : "panel.chipBasisMany", {
    word: t(lang, "hud.sevMedium"),
    count,
    notes,
  });

describe("a threat word names the note it stands on (R3-03)", () => {
  it("derives the basis from the finding data, not a new verdict rule", () => {
    const subtle = file("src/subtle.js", [finding()]);
    const basis = verdictBasis(subtle);
    expect(basis, "a file of only hygiene notes must show its basis").not.toBeNull();
    expect(basis!.count).toBe(1);
    expect(basis!.notes).toEqual(["console output"]);
  });

  it("puts the basis on the MEDIUM chip of the card", async () => {
    const subtle = file("src/subtle.js", [finding()]);
    await show(createElement(InfoPanel), city([subtle]));
    await select(subtle);
    expect(text()).toContain(basisEn("en", 1, "console output"));
    // the full sentence the panel has to produce, in the reader's words:
    expect(text()).toContain("no security rule matched");
  });

  it("says it in German too", async () => {
    const subtle = file("src/subtle.js", [finding()]);
    await show(createElement(InfoPanel), city([subtle]), "de");
    await select(subtle);
    expect(text()).toContain(basisEn("de", 1, "console output"));
    expect(text()).not.toContain("no security rule matched");
  });

  it("counts the notes and lists the kinds when there are several", () => {
    const many = file("src/many.js", [
      finding(),
      finding({
        type: "LOOSE_EQUALITY",
        ruleId: "regex:LOOSE_EQUALITY",
        message: "Loose equality — use === instead",
        line: 9,
      }),
    ]);
    const basis = verdictBasis(many)!;
    expect(basis.count).toBe(2);
    expect(basis.notes).toEqual(["console output", "loose equality"]);
  });
});

describe("the basis only speaks when the whole chip stands on notes", () => {
  it("stays off the chip when a security rule matched as well", async () => {
    const mixed = file("src/mixed.js", [
      finding(),
      finding({
        type: "SQL_INJECTION",
        severity: "P1",
        provenance: "semgrep",
        ruleId: "javascript.lang.security.sql",
        category: "injection",
        message: "Raw SQL query detected",
        line: 5,
      }),
    ]);
    expect(verdictBasis(mixed)).toBeNull();
    await show(createElement(InfoPanel), city([mixed]));
    await select(mixed);
    expect(text()).not.toContain("no security rule matched");
    expect(text()).toContain(t("en", "hud.sevHigh"));
  });

  it("leaves the no-findings and unverified chips exactly as they were", async () => {
    const clean = file("src/clean.js", []);
    expect(verdictBasis(clean)).toBeNull();
    await show(createElement(InfoPanel), city([clean]));
    await select(clean);
    expect(text()).toContain(t("en", "panel.statusNoFindings"));
    expect(text()).not.toContain("no security rule matched");
  });
});
