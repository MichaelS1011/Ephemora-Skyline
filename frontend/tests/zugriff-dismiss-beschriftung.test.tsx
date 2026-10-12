// @vitest-environment jsdom
/**
 * ZUGRIFF-05, Punkt 2 — the ✕ on the summary line promised to close a
 * "scan summary" while the line it sits on was the demo notice: sample
 * findings, no scan, nothing of the kind the label named.
 *
 * One row of DOM carries several honest states (a real scan, the demo, and the
 * notices that nothing was checked), so the control has to name the state it is
 * in. Asserted by condition, never by copying a string out of `i18n.ts`:
 * - every state's label resolves back to a dictionary key — so nothing is
 *   hardcoded in the component, in either language;
 * - the demo state's key is not the key any scan state uses, and the scan
 *   states agree on one key among themselves;
 * - the two keys each carry a German and an English value, and the same key
 *   answers both languages — so the German branch keeps no English sentence;
 * - the label follows the `demo` prop on a mounted card, so it is derived from
 *   the state and not decided once at mount; it follows that and nothing else,
 *   not the numbers sitting on the card;
 * - and the demo card still does the work the label promises: it goes away
 *   when told to, and stays away when the same city is handed over again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScanSummary } from "../src/components/ScanSummary";
import { useStore } from "../src/stores/useStore";
import { DICT, type Lang } from "../src/i18n";
import type { CityData, CityDir, CityFile } from "../src/city/types";

interface State {
  name: string;
  demo: boolean;
  city: CityData;
}

const file: CityFile = {
  id: "f-1",
  name: "a.ts",
  path: "src/a.ts",
  language: "TypeScript",
  linesOfCode: 40,
  cyclomaticComplexity: 2,
  threatLevel: "safe",
  findings: [],
};

const full = {
  regex: true,
  gitleaks: true,
  semgrep: true,
  dependencies: true,
  osv: true,
  ruff: true,
};
const thin = {
  regex: true,
  gitleaks: false,
  semgrep: false,
  dependencies: false,
  osv: false,
  ruff: false,
};

function city(overrides: Partial<CityData> = {}): CityData {
  const tree = {
    name: "probe",
    path: "",
    fileCount: 1,
    linesOfCode: 40,
    languages: { TypeScript: 40 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: [file],
    remainingFiles: 0,
    districtFiles: [],
  } as unknown as CityDir;
  return {
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 40 },
    totalFiles: 1,
    renderedFiles: 1,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree,
    ...overrides,
  } as unknown as CityData;
}

/** The states one summary row carries. Only the first ever scanned nothing. */
const STATES: State[] = [
  { name: "demo", demo: true, city: city() },
  {
    name: "scan · findings",
    demo: false,
    city: city({ findingsBySeverity: { P0: 1, P1: 0, P2: 0 } }),
  },
  { name: "scan · clear sweep", demo: false, city: city({ scanProvenance: full }) },
  { name: "scan · scanners missing", demo: false, city: city({ scanProvenance: thin }) },
  { name: "scan · depth unknown", demo: false, city: city({ scanProvenance: undefined }) },
];

const SCAN_STATES = STATES.slice(1);

let host: HTMLDivElement;
let root: Root | null = null;

function mount(state: State, lang: Lang): void {
  const initial = useStore.getInitialState();
  useStore.setState(
    {
      ...initial,
      prefs: { ...initial.prefs, lang },
      cityData: state.city,
      analysisId: "scan-1",
      buildPhase: "built",
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  const fresh = createRoot(host);
  root = fresh;
  act(() => fresh.render(createElement(ScanSummary, { demo: state.demo })));
}

function unmount(): void {
  const live = root;
  if (live) act(() => live.unmount());
  root = null;
  host?.remove();
}

/** The dismiss control's accessible name — the thing a reader is told. */
function dismissName(state: State, lang: Lang): string {
  mount(state, lang);
  const close = host.querySelector<HTMLElement>(".start-summary-close");
  expect(close, `${state.name}: the card has no dismiss control at all`).toBeTruthy();
  const name = close?.getAttribute("aria-label") ?? "";
  expect(name.length, `${state.name}: the dismiss control has no name`).toBeGreaterThan(0);
  unmount();
  return name;
}

/** Which dictionary entries literally *are* this text, in this language. */
function keysNamed(text: string, lang: Lang): string[] {
  return Object.entries(DICT)
    .filter(([, entry]) => entry[lang].trim() === text)
    .map(([key]) => key);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  unmount();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("der Entlassen-Knopf nennt, was er entlässt", () => {
  it("heißt im Demo anders als in jedem Scan-Zustand", () => {
    for (const lang of ["de", "en"] as const) {
      const demo = dismissName(STATES[0]!, lang);
      for (const state of SCAN_STATES) {
        expect(
          dismissName(state, lang),
          `${lang}: the demo notice is dismissed under the scan's own name`,
        ).not.toBe(demo);
      }
    }
  });

  it("nimmt dafür einen anderen Wörterbuch-Schlüssel, nicht ein anderes Wort", () => {
    for (const lang of ["de", "en"] as const) {
      const demoKeys = keysNamed(dismissName(STATES[0]!, lang), lang);
      expect(demoKeys.length, `${lang}: the demo label is not the dictionary's`).toBeGreaterThan(0);
      const scanKeys = new Set(
        SCAN_STATES.flatMap((state) => keysNamed(dismissName(state, lang), lang)),
      );
      expect([...scanKeys], `${lang}: a scan label is not the dictionary's`).not.toHaveLength(0);
      expect(
        demoKeys.filter((k) => scanKeys.has(k)),
        `${lang}: demo and scan share one key — one string with a variable in it is not two names`,
      ).toEqual([]);
      // and the scan family must not fragment into five names for one thing
      expect(scanKeys.size, `${lang}: the scan states disagree on their own name`).toBe(1);
    }
  });

  it("trägt beide Sprachen an denselben Schlüsseln — kein englischer Rest auf dem deutschen Zweig", () => {
    const demoDe = keysNamed(dismissName(STATES[0]!, "de"), "de");
    const demoEn = keysNamed(dismissName(STATES[0]!, "en"), "en");
    const scanDe = keysNamed(dismissName(STATES[1]!, "de"), "de");
    const scanEn = keysNamed(dismissName(STATES[1]!, "en"), "en");
    for (const [label, de, en] of [
      ["demo", demoDe, demoEn],
      ["scan", scanDe, scanEn],
    ] as const) {
      const shared = de.filter((k) => en.includes(k));
      expect(shared.length, `the ${label} label exists in only one language`).toBeGreaterThan(0);
      for (const k of shared) {
        const entry = DICT[k as keyof typeof DICT];
        expect(entry.de.trim(), `${k} has no German`).not.toBe("");
        expect(entry.en.trim(), `${k} has no English`).not.toBe("");
        expect(
          entry.de,
          `${k}: the German value is the English one — nothing was translated`,
        ).not.toBe(entry.en);
      }
    }
  });

  it("folgt dem Zustand, nicht dem ersten Render", () => {
    mount(STATES[1]!, "de");
    const close = host.querySelector<HTMLElement>(".start-summary-close")!;
    const asScan = close.getAttribute("aria-label");
    // The very same mounted card, now told it is the demo.
    act(() => root!.render(createElement(ScanSummary, { demo: true })));
    const asDemo = host
      .querySelector<HTMLElement>(".start-summary-close")!
      .getAttribute("aria-label");
    expect(
      host.querySelector(".start-summary"),
      "the card changed while the name did",
    ).toBeTruthy();
    expect(asDemo, "the label kept the state it was mounted with").not.toBe(asScan);
    // and back again — the name is read from the state on every render
    act(() => root!.render(createElement(ScanSummary, { demo: false })));
    expect(
      host.querySelector<HTMLElement>(".start-summary-close")!.getAttribute("aria-label"),
    ).toBe(asScan);
  });

  it("hängt an dem Zustand, nicht an den Zahlen auf der Karte", () => {
    const demoWithFindings: State = {
      name: "demo · findings",
      demo: true,
      city: city({ findingsBySeverity: { P0: 2, P1: 1, P2: 0 } }),
    };
    expect(dismissName(demoWithFindings, "de"), "the demo label moved with its counts").toBe(
      dismissName(STATES[0]!, "de"),
    );
    expect(dismissName(SCAN_STATES[0]!, "de"), "the scan label moved with its counts").toBe(
      dismissName(SCAN_STATES[2]!, "de"),
    );
  });

  it("entlässt die Demo-Meldung wirklich, und sie kommt nicht wieder", () => {
    mount(STATES[0]!, "de");
    expect(host.querySelector(".start-summary"), "the demo card did not arrive").toBeTruthy();
    const close = host.querySelector<HTMLElement>(".start-summary-close")!;
    act(() => close.click());
    expect(host.querySelector(".start-summary"), "the demo card ignored its own ✕").toBeNull();
    expect(host.querySelector(".start-summary-strip"), "nothing took its place").toBeTruthy();
    act(() => {
      useStore.setState({ cityData: { ...useStore.getState().cityData! } });
    });
    expect(
      host.querySelector(".start-summary"),
      "a dismissed demo notice came back over the panel",
    ).toBeNull();
    expect(host.querySelector(".start-summary-strip"), "the strip went away with it").toBeTruthy();
  });
});
