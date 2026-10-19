// @vitest-environment jsdom
/**
 * The arrival budget.
 *
 * Measured on 2026-10-18 in the running app, at the moment a scan finishes:
 * 13 chrome regions on screen, ~36 % of the window, 250 words of prose. The
 * complaint was not the count on its own but that everything arrives at once
 * and nothing outranks anything else. So this file holds two numbers, a word
 * budget and one rule:
 *
 *   • at most 5 regions paint at the arrival instant, and they are exactly the
 *     four standing workspace surfaces plus the scan announcement;
 *   • once the announcement has folded itself away, at most 4 surfaces stand;
 *   • the chrome text stays under two thirds of the measured 256 words;
 *   • the severity census — Critical / High / Medium — is said by ONE surface.
 *
 * WHY THIS FILE MOUNTS `App` AND NOT A LIST OF COMPONENTS. A census over a
 * hand-assembled HUD is a copy of the product: it can be green while the real
 * screen shows something else, and the regions App itself renders — the `[?]`
 * shortcuts button, the breadcrumbs — would not be in it at all. Only the
 * canvas is stubbed; the chrome is the app's own decision.
 *
 * THE FIXTURE CARRIES FINDINGS OF ALL THREE GRADES. A guard written against a
 * zero-finding city cannot go red on a duplicated severity census: there is
 * nothing to duplicate. That mistake cost a `not.toMatch(/Critical:/)` that
 * passed while testing nothing.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The world is not what this file measures. A stubbed canvas keeps App's own
// in-city branch on screen; the scene boundaries log their fallback, which
// beforeEach filters out of the console census.
vi.mock("@react-three/fiber", async () => {
  const { createElement: h } = await import("react");
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) =>
      h("div", { "data-canvas": "true" }, children),
    useFrame: () => {},
    useThree: () => ({
      camera: { position: { set() {} }, rotation: {} },
      gl: { domElement: null },
    }),
  };
});
vi.mock("@react-three/postprocessing", () => ({
  EffectComposer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Bloom: () => null,
  ToneMapping: () => null,
}));
vi.mock("postprocessing", () => ({ ToneMappingMode: { ACES_FILMIC: 1 } }));
// The scene graph is the world, not the chrome. CityTree, District, RoadSystem
// and CameraRig all reach for @react-three/drei, which needs a real renderer,
// and a throw inside the boundary would make this file measure React's error
// report instead of the app's own surfaces.
vi.mock("../src/components/CityScene", () => ({ CityScene: () => null }));

import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import App from "../src/App";

/** One finding of each grade, in a district the reader can drill into. */
const ARRIVAL_CITY = city({
  tree: dir({
    path: "",
    name: "",
    detailFiles: [
      file("scripts/deploy.sh", "Shell", [
        finding({ severity: "P2", type: "SET_X", message: "The shell traces its commands" }),
      ]),
    ],
    children: [
      dir({
        path: "src",
        detailFiles: [
          file("src/api/routes.ts", "TypeScript", [
            finding({ severity: "P0", message: "Hardcoded secret detected (generic-api-key)" }),
          ]),
          file("src/api/server.ts", "TypeScript", [
            finding({ severity: "P1", type: "SQL_INJECTION", message: "Unparameterised SQL" }),
          ]),
        ],
      }),
    ],
  }),
  analysisId: "arrival-scan-1",
  dropped: {
    pathTooLong: 0,
    unsafePath: 0,
    tooLarge: 0,
    unreadable: 0,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 5,
  },
});

/** Every chrome region the in-city screen can hold, by the class the component
 *  writes itself. A region with two shapes — the announcement's card and strip,
 *  the project card and its reopen chip — lists both. */
const REGIONS: Record<string, string[]> = {
  header: [".workspace-header"],
  legend: [".city-legend"],
  modes: [".workspace-modes"],
  search: [".workspace-search", ".search-control"],
  fileCard: [".panel-info"],
  findingsList: ["#findings-panel"],
  announcement: [".start-summary", ".start-summary-strip"],
  tour: [".security-tour"],
  dock: [".action-dock"],
  projectCard: [".panel-context-card", ".context-reopen"],
  minimap: [".city-minimap"],
  primer: [".city-coach"],
  heat: [".workspace-heatmap"],
  shortcuts: [".workspace-shortcuts"],
  crumbs: [".workspace-breadcrumbs"],
  shareNudge: [".share-hint"],
  studio: [".panel-share-studio"],
};

/** The four surfaces allowed to stand, plus the timed announcement. */
const STANDING = ["header", "modes", "dock", "projectCard"];
const AT_ARRIVAL = [...STANDING, "announcement"];

/** Census of the running app on 2026-10-18; the budget is two thirds of it. */
const MEASURED_WORDS = 256;
const WORD_BUDGET = Math.round((MEASURED_WORDS * 2) / 3);

let host: HTMLDivElement | undefined;
let root: Root | undefined;
const consoleErrors: string[] = [];

function arrive(): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(App)));
}

const painted = (): string[] =>
  Object.entries(REGIONS)
    .filter(([, selectors]) => selectors.some((s) => host!.querySelector(s)))
    .map(([name]) => name);

/** Which regions say something — a region that renders an empty box says nothing. */
function speakingRegions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, selectors] of Object.entries(REGIONS)) {
    const el = selectors.map((s) => host!.querySelector(s)).find(Boolean);
    if (!el) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text !== "") out[name] = text;
  }
  return out;
}

/**
 * A grade census: the word in the same breath as its count. Three spellings
 * have to be caught, because the surfaces put the shape glyph and the count on
 * different sides of the word — the header "▲1Critical", the project card
 * "▲Critical 1", a chip "Critical: 1". `\b` cannot be used next to a digit
 * (a digit is a word character, so "1Critical" and "Critical1" have no
 * boundary there; with it the census read an empty list while three surfaces
 * were speaking grades). Case is kept, so prose about "a critical finding" is
 * not counted as a census.
 */
const GRADE_CENSUS = /\d[^\d\n]{0,3}(Critical|High|Medium)|(Critical|High|Medium)[^\d\n]{0,3}\d/;

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function openMore(): void {
  const more = host!.querySelector<HTMLButtonElement>("#city-more-button");
  if (!more) throw new Error("the dock has no ••• More control to open");
  act(() => more.click());
}

/** Click the control whose own name carries the words — a glyph without a name
 *  is not a control a stranger can find. */
function clickByName(name: RegExp): boolean {
  const el = [...host!.querySelectorAll("button")].find((b) =>
    name.test(`${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`),
  );
  if (!el) return false;
  act(() => el.click());
  return true;
}

beforeEach(() => {
  localStorage.clear();
  consoleErrors.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  // jsdom has no matchMedia. Without it the camera rig throws inside the
  // canvas, React's boundary report lands in console.error, and the census
  // below would measure the test surface instead of the chrome.
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    consoleErrors.push(
      a
        .map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x)))
        .join(" ")
        .slice(0, 160),
    );
  });
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: ARRIVAL_CITY,
      analysisId: "arrival-scan-1",
      buildPhase: "built",
    },
    true,
  );
});

/** The store is one object: a case that wants one field back fills it from the
 *  initial state instead of replacing the whole store, which would leave the
 *  app without its `prefs`. */
function intoDistrict(path: string[], lang: "en" | "de" = "en"): void {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: ARRIVAL_CITY,
      analysisId: "arrival-scan-1",
      buildPhase: "built",
      focusPath: path,
    },
    true,
  );
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the moment a city arrives", () => {
  it("paints five regions at most, and they are the standing four plus the announcement", () => {
    arrive();
    expect(painted().sort(), `on screen: ${painted().join(", ")}`).toEqual([...AT_ARRIVAL].sort());
  });

  it("leaves four surfaces standing once the announcement has folded away", () => {
    arrive();
    act(() => vi.advanceTimersByTime(10_000));
    const standing = painted().filter((r) => r !== "announcement");
    expect(standing.length, `standing: ${standing.join(", ")}`).toBeLessThanOrEqual(4);
    expect(standing.sort()).toEqual([...STANDING].sort());
  });

  it("says the severity census in one place, not three", () => {
    arrive();
    const speakers = Object.entries(speakingRegions())
      .filter(([, text]) => GRADE_CENSUS.test(text))
      .map(([name]) => name);
    expect(
      speakers,
      `regions naming a grade: ${speakers.join(", ")} || header says: ${
        speakingRegions().header ?? "-"
      }`,
    ).toEqual(["header"]);
  });

  it("holds the chrome to two thirds of the measured words", () => {
    arrive();
    const count = words(host!.textContent ?? "");
    expect(count, `${count} words on screen, budget ${WORD_BUDGET}`).toBeLessThanOrEqual(
      WORD_BUDGET,
    );
  });

  it("shows no breadcrumb while the reader stands at the root", () => {
    arrive();
    expect(
      host!.querySelector(".workspace-breadcrumbs"),
      "the root crumb repeats the project the header already names",
    ).toBeNull();
  });

  it("puts no card on the screen by itself after the arrival", () => {
    arrive();
    act(() => vi.advanceTimersByTime(20_000));
    expect(
      host!.querySelector(".share-hint"),
      "a nudge that arrives unasked is the clutter this budget is about",
    ).toBeNull();
  });

  it("keeps the console clean while the chrome is built", () => {
    arrive();
    expect(consoleErrors).toEqual([]);
  });
});

describe("what the budget hides", () => {
  const deferred: [string, RegExp, string][] = [
    ["the colour and height key", /Colour and height key|Farb- und Höhenschlüssel/, ".city-legend"],
    ["the city map", /City map|Stadtkarte/, ".city-minimap"],
    ["the heat channels", /Heat channels|Heatmap-Kanäle/, ".workspace-heatmap"],
    ["the first-look primer", /First look|Erster Blick/, ".city-coach"],
  ];

  for (const [label, name, selector] of deferred) {
    it(`gives ${label} back on request, by name`, () => {
      arrive();
      expect(host!.querySelector(selector), `${selector} must not stand at arrival`).toBeNull();
      openMore();
      expect(clickByName(name), `the control for ${label} carries its name`).toBe(true);
      expect(host!.querySelector(selector), `${label} came back`).not.toBeNull();
    });
  }

  it("gives the keyboard shortcut list back on request", () => {
    arrive();
    expect(host!.querySelector(".workspace-shortcuts")).toBeNull();
    openMore();
    expect(clickByName(/Keyboard shortcuts|Tastenkürzel/)).toBe(true);
    expect(host!.querySelector("#keyboard-hints-overlay [role=dialog]")).not.toBeNull();
  });

  it("opens the search from a control that says search", () => {
    arrive();
    expect(host!.querySelector(".search-control")).toBeNull();
    expect(clickByName(/Search the city|Stadt durchsuchen/)).toBe(true);
    expect(host!.querySelector(".search-control")).not.toBeNull();
  });

  it("names every deferred control in both languages", () => {
    for (const lang of ["en", "de"] as const) {
      intoDistrict([], lang);
      arrive();
      openMore();
      const named = [...host!.querySelectorAll("#city-more-menu button")].map(
        (b) => `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`,
      );
      const wanted =
        lang === "en"
          ? [
              "Colour and height key",
              "City map",
              "Heat channels",
              "First look",
              "Keyboard shortcuts",
            ]
          : [
              "Farb- und Höhenschlüssel",
              "Stadtkarte",
              "Heatmap-Kanäle",
              "Erster Blick",
              "Tastenkürzel",
            ];
      for (const label of wanted) {
        expect(
          named.some((s) => s.includes(label)),
          `${lang}: "${label}" must be readable on the control itself, found: ${named.join(" | ")}`,
        ).toBe(true);
      }
      act(() => root?.unmount());
      host?.remove();
      host = undefined;
      root = undefined;
    }
  });

  it("reaches the deferred controls from the keyboard", () => {
    arrive();
    const more = host!.querySelector<HTMLButtonElement>("#city-more-button")!;
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    act(() => {
      more.focus();
      more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    const menu = host!.querySelector("#city-more-menu");
    expect(menu, "ArrowDown opens the menu the shortcuts live in").not.toBeNull();
    expect(
      document.activeElement?.closest("#city-more-menu"),
      "and puts the first item under the caret",
    ).not.toBeNull();
  });
});

describe("what the reader still gets without asking", () => {
  it("keeps the arithmetic of the scan on the announcement", () => {
    arrive();
    const summary = host!.querySelector(".start-summary")!;
    const text = (summary.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("3 files analyzed");
    expect(text).toContain("5 files in a format the scanners do not read");
  });

  it("keeps a district's own grade split where the header cannot speak for it", () => {
    intoDistrict(["src"]);
    arrive();
    const card = host!.querySelector(".panel-context-card");
    expect(card, "the card is the only place a district's grades are written").not.toBeNull();
    expect(GRADE_CENSUS.test((card!.textContent ?? "").replace(/\s+/g, " "))).toBe(true);
  });
});
