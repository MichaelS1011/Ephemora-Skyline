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
import censusJson from "./fixtures/arrival-census.json";

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
  announcement: [".start-summary", ".start-summary-strip", ".start-summary-strip-slot"],
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
  liveBand: [".live-band"],
  buildBar: [".build-bar"],
  moreMenu: ["#city-more-menu"],
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

  it("gives the figure's vitrine back on request, from inside the city", () => {
    // §04.11 — restyling a resident the reader already named. The card keeps its
    // one verb, so the way to the jacket is this menu, and the panel is the same
    // component the start page opens — not a second, smaller one.
    arrive();
    expect(host!.querySelector(".ephe-preview-panel")).toBeNull();
    openMore();
    expect(clickByName(/Look|Aussehen/), "the control says what it brings back").toBe(true);
    expect(host!.querySelector(".ephe-preview-panel")).not.toBeNull();
    expect(host!.querySelectorAll(".ephe-variant")).toHaveLength(3);
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
              "Look",
            ]
          : [
              "Farb- und Höhenschlüssel",
              "Stadtkarte",
              "Heatmap-Kanäle",
              "Erster Blick",
              "Tastenkürzel",
              "Aussehen",
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

  it("lets a resident offer the tour, on the card the scan already owns", () => {
    arrive();
    // the wave is armed after the arrival camera has had time to stand still
    act(() => vi.advanceTimersByTime(1500));
    // one greet per scan, fired by the card itself — not a second prompt
    expect(useStore.getState().residentGreet).toBe(1);
    const summary = host!.querySelector(".start-summary")!;
    const text = (summary.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("A resident");
    expect(text).toContain("Shall I walk you to the findings?");
    expect(clickByName(/Show findings/), "the card offers the guided verb").toBe(true);
    expect(useStore.getState().tourActive, "the verb starts the existing tour").toBe(true);
  });

  it("calls a sampled city a preview, and never a complete scan", () => {
    const previewCity = {
      ...ARRIVAL_CITY,
      totalFiles: 2_000,
      dropped: { ...ARRIVAL_CITY.dropped!, preview: 46_000 },
    };
    act(() => useStore.setState({ cityData: previewCity }));
    arrive();
    const summary = host!.querySelector(".start-summary")!;
    const text = (summary.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Preview");
    expect(text).toContain("2,000 of 48,000");
    expect(text).not.toContain("Scan complete");
    expect(text).toContain("left out of the preview sample");
  });

  it("keeps a district's own grade split where the header cannot speak for it", () => {
    intoDistrict(["src"]);
    arrive();
    const card = host!.querySelector(".panel-context-card");
    expect(card, "the card is the only place a district's grades are written").not.toBeNull();
    expect(GRADE_CENSUS.test((card!.textContent ?? "").replace(/\s+/g, " "))).toBe(true);
  });
});

describe("the resident's offer outlives the card it arrived on", () => {
  /** The announcement folds itself after its nine-second dwell. */
  const fold = (): void => {
    act(() => vi.advanceTimersByTime(9500));
  };
  const verbs = (): Element[] => [
    ...host!.querySelectorAll(".start-summary-guide-go, .start-summary-strip-guide"),
  ];

  it("hands the verb to the strip when the card folds, and never says it twice", () => {
    arrive();
    expect(verbs()).toHaveLength(1);
    expect(host!.querySelector(".start-summary-guide-go"), "the card speaks first").toBeTruthy();
    fold();
    expect(host!.querySelector(".start-summary"), "the card folded away").toBeNull();
    expect(host!.querySelector(".start-summary-strip")).toBeTruthy();
    expect(verbs()).toHaveLength(1);
    expect(verbs()[0]!.className).toBe("start-summary-strip-guide");
  });

  it("starts the tour from the strip, then stops offering", () => {
    arrive();
    fold();
    act(() => host!.querySelector<HTMLButtonElement>(".start-summary-strip-guide")!.click());
    expect(useStore.getState().tourActive, "the verb is the same guided tour").toBe(true);
    expect(useStore.getState().residentOffer).toBe("taken");
    expect(verbs(), "an answered offer is not repeated").toHaveLength(0);
  });

  it("never asks a second time after the card was closed", () => {
    arrive();
    act(() => host!.querySelector<HTMLButtonElement>(".start-summary-close")!.click());
    expect(useStore.getState().residentOffer, "closing the card is an answer").toBe("closed");
    fold();
    expect(
      host!.querySelector(".start-summary-strip"),
      "the strip stays, the offer does not",
    ).toBeTruthy();
    expect(verbs()).toHaveLength(0);
  });

  it("keeps the folded strip inside the word budget it held before", () => {
    arrive();
    fold();
    const strip = speakingRegions().announcement ?? "";
    expect(strip, "the strip is what stands after the fold").not.toBe("");
    expect(words(strip), `the folded line reads: ${strip}`).toBeLessThanOrEqual(24);
  });
});

describe("city only", () => {
  it("steps every instrument back, and Escape brings it all back", () => {
    arrive();
    openMore();
    expect(clickByName(/City only|Nur die Stadt/)).toBe(true);
    expect(
      host!.querySelector(".app-shell")!.classList.contains("is-city-only"),
      "the shell carries the mode so CSS can fold every surface at once",
    ).toBe(true);
    expect(
      host!.querySelector(".city-only-exit"),
      "the header and dock are gone; the exit has to stand on its own",
    ).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(host!.querySelector(".app-shell")!.classList.contains("is-city-only")).toBe(false);
    expect(host!.querySelector(".city-only-exit")).toBeNull();
  });

  it("resets when the city is left", () => {
    arrive();
    act(() => useStore.getState().setCityOnly(true));
    expect(useStore.getState().cityOnly).toBe(true);
    act(() => useStore.getState().resetToLanding());
    expect(useStore.getState().cityOnly).toBe(false);
  });
});

describe("a called resident", () => {
  it("offers one guided verb, and Escape gives the city back", () => {
    arrive();
    act(() => useStore.getState().selectResident(0));
    const card = host!.querySelector(".resident-card");
    expect(card, "the card only exists while a resident is called").not.toBeNull();
    const primary = [...card!.querySelectorAll("button")].find((b) =>
      /Show me the risk|Zeig mir das Risiko/.test(b.textContent ?? ""),
    );
    expect(primary, "one verb, named on the button").toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(useStore.getState().selectedResident).toBeNull();
    expect(host!.querySelector(".resident-card")).toBeNull();
  });

  it("names the door the resident belongs to, when the click carried one", () => {
    arrive();
    // EA-01: the card is the first surface that shows the address. A click in
    // the city hands over `plot:<file id>#<seat>`; the card reads it back as
    // the file the payload names, never as the raw id.
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/routes.ts#0"));
    const card = host!.querySelector(".resident-card");
    expect(card).not.toBeNull();
    const text = (card!.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Lives at · routes.ts");
    expect(text).not.toContain("f-src");
  });

  it("says nothing about a home it was not told", () => {
    arrive();
    act(() => useStore.getState().selectResident(0));
    const card = host!.querySelector(".resident-card");
    expect(card).not.toBeNull();
    // A keyboard call picks the nearest body and has no identity to hand over
    // yet; the line stays absent rather than guessing from the seat number.
    expect(card!.textContent ?? "").not.toContain("Lives at");
  });

  /** Type into the claim field the way a reader does — React needs the native
   *  setter, not a `value` assignment, or the change never reaches the store. */
  function type(card: Element, value: string): void {
    const input = card.querySelector<HTMLInputElement>("#ephe-name")!;
    expect(input, "the card offers a name field").toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("lets the reader name the resident, and keeps the name with the resident", () => {
    arrive();
    const A = "plot:f-src/api/routes.ts#0";
    const B = "plot:f-src/api/server.ts#0";
    act(() => useStore.getState().selectResident(0, A, "explorer"));
    const card = host!.querySelector(".resident-card")!;
    expect(card.textContent ?? "").not.toContain("Atlas");
    type(card, "Atlas");
    expect(useStore.getState().residentNames[A]).toBe("Atlas");
    expect(card.textContent ?? "").toContain("Atlas");

    // A second figure is a second resident: the title falls back to the plain
    // sentence rather than carrying the first one's name over.
    act(() => useStore.getState().selectResident(1, B, null));
    expect(host!.querySelector(".resident-card")!.textContent ?? "").not.toContain("Atlas");
    act(() => useStore.getState().selectResident(0, A, "explorer"));
    expect(host!.querySelector(".resident-card")!.textContent ?? "").toContain("Atlas");
  });

  it("says which role the figure carries, and says none when it carries none", () => {
    arrive();
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/routes.ts#0", "explorer"));
    let text = host!.querySelector(".resident-card")!.textContent ?? "";
    expect(text).toContain("Role · Explorer");
    act(() => useStore.getState().selectResident(1, "plot:f-src/api/server.ts#0", null));
    text = host!.querySelector(".resident-card")!.textContent ?? "";
    expect(text).toContain("Role · no role");
  });

  it("shows only this figure's errand as its task", () => {
    arrive();
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/routes.ts#0", "explorer"));
    act(() =>
      useStore.getState().startGuide({
        role: "maintenance",
        targetFileId: "f-src/api/server.ts",
        x: 1,
        z: 1,
        claim: {
          path: "src/api/server.ts",
          name: "server.ts",
          cyclomatic: 8,
          decisions: 7,
          heightSharePercent: 9,
          saturatesAt: 40,
          saturated: false,
        },
      }),
    );
    // Somebody else is on the errand; this one is standing there with nothing
    // to do, and the card must not lend the other's task to it.
    expect(host!.querySelector(".resident-card")!.textContent ?? "").toContain(
      "Task · nothing to do",
    );
    act(() => useStore.getState().selectResident(1, "plot:f-src/api/server.ts#0", "maintenance"));
    expect(host!.querySelector(".resident-card")!.textContent ?? "").toContain(
      "Task · walking to server.ts",
    );
  });

  it("still offers exactly one verb", () => {
    arrive();
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/routes.ts#0", "explorer"));
    const card = host!.querySelector(".resident-card")!;
    // Close and the guided verb — a name field must not arrive as a third
    // button, because the card's one promise is one thing to do.
    expect(card.querySelectorAll("button").length).toBe(2);
    expect(card.querySelectorAll("input").length).toBe(1);
  });

  it("takes the durability promise back when storage refuses the name", () => {
    arrive();
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/server.ts#0", null));
    const card = host!.querySelector(".resident-card")!;
    expect(card.textContent ?? "").not.toContain("would not store");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    type(card, "Atlas");
    spy.mockRestore();
    // The field keeps what was typed and the card says the rest out loud: the
    // hint promises the project, and this browser said no.
    const text = host!.querySelector(".resident-card")!.textContent ?? "";
    expect(text).toContain("Atlas");
    expect(text).toContain("would not store it");
  });

  it("does not call a second resident while the reader types a name", () => {
    arrive();
    act(() => useStore.getState().selectResident(0, "plot:f-src/api/routes.ts#0", "explorer"));
    const input = host!.querySelector<HTMLInputElement>("#ephe-name")!;
    const before = useStore.getState().residentCall;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    });
    expect(useStore.getState().residentCall).toBe(before);
  });

  it("asks the canvas for a resident on C", () => {
    arrive();
    const before = useStore.getState().residentCall;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    });
    expect(useStore.getState().residentCall).toBe(before + 1);
  });
});

/**
 * The harvest census (B1, 2026-10-29) and this guard name the same surfaces.
 *
 * The first-journey counter drifted from the DOM: its city-view list still
 * named classes nothing renders (.context-card, .mode-bar, .info-panel), so
 * s5/s6 reported "action-dock, 5 words" while the project panel stood on the
 * screen carrying 138 of the 180 arrival words. The complete census is in
 * `tests/fixtures/arrival-census.json`; these tests keep the two lists from
 * drifting apart again — in BOTH directions: a surface the census names must
 * be one this guard can see, and the arrival instant the census counted must
 * be exactly the standing four plus the announcement this guard allows.
 */

/** Surfaces the census looks for that are not standing chrome: the key echo
 *  (an aria-live status, always mounted, empty until a key has something to
 *  say) and the waypoint pill (no class of its own — found via its aria). */
const CENSUS_EXTRAS: Record<string, string> = {
  ".key-echo": "KeyEcho.tsx renders it unconditionally as role=status",
  "waypoint-pill": "HudOverlay matches it by aria-label, not by a class",
};

describe("the harvest census and this guard name the same surfaces", () => {
  type Census = {
    viewports: Record<string, { steps: Record<string, { surfaces: Record<string, unknown> }> }>;
    meta: { surfacesAbsentEverywhere: string[] };
  };
  const census = censusJson as unknown as Census;

  const regionFor = (surface: string): string | null => {
    for (const [name, selectors] of Object.entries(REGIONS)) {
      if (selectors.includes(surface)) return name;
    }
    return null;
  };

  const censusCitySurfaces = (): string[] => {
    const names = new Set<string>();
    for (const vp of Object.values(census.viewports)) {
      for (const step of Object.values(vp.steps)) {
        for (const surface of Object.keys(step.surfaces)) {
          if (!surface.startsWith(".landing")) names.add(surface);
        }
      }
    }
    return [...names].sort();
  };

  it("every city surface the census counted is one this guard can see", () => {
    const unseen: string[] = [];
    for (const surface of censusCitySurfaces()) {
      if (!regionFor(surface) && !CENSUS_EXTRAS[surface]) unseen.push(surface);
    }
    expect(
      unseen,
      "the counter names a surface the chrome guard has never heard of — add it to REGIONS or to CENSUS_EXTRAS, never to one list alone",
    ).toEqual([]);
  });

  it("every surface the census says it looked for without finding is a real selector", () => {
    const unknown: string[] = [];
    for (const surface of census.meta.surfacesAbsentEverywhere) {
      if (!regionFor(surface) && !CENSUS_EXTRAS[surface]) unknown.push(surface);
    }
    expect(unknown, "an absent-surface entry that matches nothing is a typo, not a proof").toEqual(
      [],
    );
  });

  it("the arrival instant the census counted is the standing four plus the announcement", () => {
    for (const [vp, data] of Object.entries(census.viewports)) {
      const step = data.steps["s5-karte-offen"];
      expect(step, `${vp}: the card-open step is in the census`).toBeDefined();
      const regions = new Set(
        Object.keys(step!.surfaces)
          .map((s) => regionFor(s))
          .filter(Boolean) as string[],
      );
      expect([...regions].sort(), `${vp}: the arrival instant's surfaces`).toEqual(
        [...AT_ARRIVAL].sort(),
      );
    }
  });

  it("the strip state is the same standing set — the strip is the announcement, not a fifth surface", () => {
    for (const [vp, data] of Object.entries(census.viewports)) {
      const step = data.steps["s6-streifen-steht"];
      expect(step, `${vp}: the strip step is in the census`).toBeDefined();
      const regions = new Set(
        Object.keys(step!.surfaces)
          .map((s) => regionFor(s))
          .filter(Boolean) as string[],
      );
      expect([...regions].sort(), `${vp}: the strip state's surfaces`).toEqual(
        [...AT_ARRIVAL].sort(),
      );
    }
  });

  it("the census's heaviest surface is the project card, and the guard keeps it on screen", () => {
    // The number that started this round: 138 of 180 arrival words stood on a
    // surface the counter could not see. The ratchet is the guard's own word
    // budget above; what is pinned here is the ownership of the number.
    const step = census.viewports["1440x900"]!.steps["s5-karte-offen"]!;
    const heaviest = Object.entries(step.surfaces).sort(
      (a, b) => (b[1] as { words: number }).words - (a[1] as { words: number }).words,
    )[0]![0];
    expect(heaviest).toBe(".panel-context-card");
    expect(regionFor(heaviest)).toBe("projectCard");
    expect(STANDING).toContain("projectCard");
  });
});

/**
 * B2 — five entrances, none first. At the first arrival the dock names ONE
 * handgrip: the security tour, with its one-sentence reason on the surface.
 * The tour is the step that asks nothing of the reader (watch, not judge),
 * and it is the same offer the announcement's resident already makes — the
 * dock points, it does not add a second voice. The other four stay reachable;
 * nothing here opens, moves or removes a surface.
 */
describe("the first arrival names one handgrip", () => {
  const tourButton = (): HTMLElement | null =>
    ([...(host?.querySelectorAll(".action-dock button") ?? [])].find((b) =>
      /Security tour|Security-Tour/.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLElement | undefined) ?? null;

  it("the dock's tour carries the first-step sentence once the card has folded", () => {
    act(() => useStore.setState({ firstRun: true }));
    arrive();
    // the fold arrives the way it does in the app: after the card's own state
    // has settled (the writer effect ran on mount and said "card open")
    act(() => useStore.setState({ arrivalFolded: true }));
    expect(tourButton()?.textContent).toContain("start here");
  });

  it("at the card-open instant the dock proposes nothing — the resident card is the voice", () => {
    act(() => useStore.setState({ firstRun: true, arrivalFolded: false }));
    arrive();
    const text = tourButton()?.textContent ?? "";
    expect(text).not.toContain("start here");
    expect(text).toContain("fly");
  });

  it("the sentence arrives in German when the reader reads German", () => {
    act(() =>
      useStore.setState({
        firstRun: true,
        prefs: { ...useStore.getInitialState().prefs, lang: "de" },
      }),
    );
    arrive();
    act(() => useStore.setState({ arrivalFolded: true }));
    expect(tourButton()?.textContent).toContain("hier entlang");
    expect(tourButton()?.textContent).not.toContain("start here");
  });

  it("once this browser has arrived before, the dock is quiet again", () => {
    act(() => useStore.setState({ firstRun: false, arrivalFolded: true }));
    arrive();
    const text = tourButton()?.textContent ?? "";
    expect(text).not.toContain("start here");
    expect(text).toContain("fly");
  });

  it("a tour with nothing to fly proposes nothing", () => {
    act(() => {
      useStore.setState({
        firstRun: true,
        cityData: city({
          totalFiles: 4,
          findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
          languages: { TypeScript: 300 },
          tree: dir({ path: "", detailFiles: [file("src/app.ts", "TypeScript", [])] }),
        }),
      });
    });
    arrive();
    act(() => useStore.setState({ arrivalFolded: true }));
    const b = tourButton();
    expect(b, "a zero-finding city still offers the tour, struck").not.toBeNull();
    expect(b?.getAttribute("disabled")).not.toBeNull();
    expect(b?.textContent ?? "").not.toContain("start here");
  });
});
