// @vitest-environment jsdom
// KANTE-24 — the dock's states, read off the rendered controls.
//
// `kante24-zustaendstraeger.test.ts` holds the source shape and
// `glas-chrome.test.ts` holds the number. This file is the behaviour in between:
// mounted in jsdom, the control that is blocked has to be struck *and* say it to
// a reading system, the control that is merely busy has to say it in words, and
// no control on the bar may still be drawn at a dimmed opacity — because 0,4 on
// this field is 2,90:1, and that is the fall this lane was cut to close.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { DICT, type DictKey } from "../src/i18n";
import type { CityData, CityFile } from "../src/city/types";

/** The English label the dock renders — read from the dictionary rather than
 *  typed here, so a copy change moves the guard instead of breaking it. */
const word = (key: DictKey): string => DICT[key].en;

const fileWith = (count: number): CityFile => ({
  id: "file:a.ts",
  name: "a.ts",
  path: "a.ts",
  language: "TypeScript",
  linesOfCode: 12,
  cyclomaticComplexity: 3,
  threatLevel: "critical",
  findings: Array.from({ length: count }, (_, i) => ({
    type: "EVAL_USAGE",
    ruleId: "EVAL_USAGE",
    severity: "P0" as const,
    line: i + 1,
    message: `m${i}`,
  })),
});

const cityOf = (findings: number): CityData =>
  ({
    repo: { owner: "local", name: "plain", branch: "main" },
    analysisId: "scan-77",
    languages: { TypeScript: 12 },
    totalFiles: 1,
    renderedFiles: 1,
    threatScore: 1,
    findingsBySeverity: { P0: findings, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: {
      name: "plain",
      path: "",
      fileCount: 1,
      linesOfCode: 12,
      findingsBySeverity: { P0: findings, P1: 0, P2: 0 },
      children: [],
      detailFiles: findings > 0 ? [fileWith(findings)] : [],
      remainingFiles: 0,
      districtFiles: [],
    },
  }) as unknown as CityData;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const host = (): HTMLDivElement => {
  expect(container, "das Dock ist nicht gemountet").toBeDefined();
  return container as HTMLDivElement;
};

const button = (needle: string): HTMLButtonElement => {
  const found = Array.from(host().querySelectorAll("button")).find((e) =>
    (e.textContent ?? "").includes(needle),
  );
  if (!found) throw new Error(`kein Knopf mit "${needle}"`);
  return found as HTMLButtonElement;
};

const strike = (el: HTMLElement): string => el.style.textDecoration;

async function mount(overrides: Record<string, unknown>, openMenu = false): Promise<void> {
  // One dock at a time: a layer that leaks its root would let the next layer
  // sweep buttons the reader never sees.
  if (root) {
    await act(async () => root?.unmount());
    container?.remove();
  }
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: cityOf(2),
      buildPhase: "built",
      analysisId: "scan-77",
      ...overrides,
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<ActionBar />));
  if (openMenu) await act(async () => button("More").click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Das Dock zeigt seine Zustände ohne Deckkraft", () => {
  it("zeichnet kein Bedienelement in keiner Sperrlage mit Deckkraft", async () => {
    // Every blocked shape the bar can be in, swept: a single mount would leave
    // the stepper or the blocked menu items unrendered and the sweep green over
    // the dim it was written to catch (measured that way on the first run).
    const lagen: Array<[string, Record<string, unknown>, boolean]> = [
      [
        "Triage-Zähler, beide Schritte leer",
        { triageActive: true, triageCursor: 0, triageTotal: 2 },
        false,
      ],
      ["Menü ohne Scan", { analysisId: null }, true],
      ["leere Stadt", { cityData: cityOf(0) }, true],
      ["laufender Testlauf", { testRun: { status: "running", stage: "" } }, true],
      ["Tour läuft", { tourActive: true }, true],
    ];
    for (const [name, overrides, open] of lagen) {
      await mount(overrides, open);
      const gedimmt = Array.from(host().querySelectorAll("button, span"))
        .map((el) => el as HTMLElement)
        .filter((el) => el.style.opacity !== "" && el.style.opacity !== "1")
        .map((el) => `${(el.textContent ?? "").trim().slice(0, 24)} → ${el.style.opacity}`);
      expect(gedimmt, `${name}: Deckkraft trägt wieder einen Zustand`).toEqual([]);
    }
  });

  it("streicht den leeren Schritt und lässt den gangbaren unangetastet", async () => {
    await mount({ triageActive: true, triageCursor: 0, triageTotal: 2 });
    const prev = button(word("actions.prev"));
    const next = button(word("actions.next"));
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(strike(prev)).toBe("line-through");
    expect(next.getAttribute("aria-disabled")).toBe("false");
    expect(strike(next)).toBe("");
    // The state is said twice, in different senses: the mark for the eye, the
    // attribute for a reading system, and neither of them is a tone.
    expect(prev.getAttribute("title")).toBe(word("actions.triageNoneBehind"));
  });

  it("streicht beide Exporte, wenn die Stadt keinen Scan hat", async () => {
    await mount({ analysisId: null, cityData: cityOf(2) }, true);
    for (const label of ["Export SARIF", "Export findings (NDJSON)"]) {
      const el = button(label);
      expect(el.getAttribute("aria-disabled")).toBe("true");
      expect(strike(el)).toBe("line-through");
      expect(el.getAttribute("title")).toBe(word("actions.exportNoScanTitle"));
      expect(el.style.opacity).toBe("");
    }
    // The ink is the menu's own cream, unchanged by the state.
    expect(host().querySelector("#city-more-menu")?.getAttribute("style")).toMatch(
      /color:\s*rgb\(242,\s*239,\s*232\)/,
    );
  });

  it("lässt die Exporte unangetastet, wenn ein Scan da ist", async () => {
    await mount({}, true);
    for (const label of ["Export SARIF", "Export findings (NDJSON)"]) {
      const el = button(label);
      expect(el.getAttribute("aria-disabled")).toBe("false");
      expect(strike(el)).toBe("");
    }
  });

  it("sagt einen laufenden Testlauf in Worten statt in einer Markung", async () => {
    await mount({ testRun: { status: "running", stage: "installing" } }, true);
    const el = button(word("actions.testsRunning"));
    expect(el.disabled).toBe(true);
    expect(strike(el)).toBe("");
    expect(el.style.opacity).toBe("");
  });

  it("streicht den Testlauf, wenn es nichts abzuarbeiten gibt", async () => {
    await mount({ analysisId: null }, true);
    const el = button(word("actions.runTests"));
    expect(el.disabled).toBe(true);
    expect(strike(el)).toBe("line-through");
    expect(el.getAttribute("title")).toBe(word("actions.runTestsNoScanTitle"));
  });

  it("streicht eine leere Stadt, aber nicht eine laufende Tour", async () => {
    await mount({ cityData: cityOf(0), tourActive: false });
    expect(strike(button(word("actions.tour")))).toBe("line-through");
    expect(button(word("actions.triage")).getAttribute("style")).toMatch(/line-through/);
    await mount({ tourActive: true });
    const tour = button(word("actions.tourActive"));
    expect(tour.disabled).toBe(true);
    expect(strike(tour), "eine Tour, die läuft, ist nicht gesperrt").toBe("");
    expect(tour.style.color).toBe("rgb(255, 242, 233)");
  });
});
