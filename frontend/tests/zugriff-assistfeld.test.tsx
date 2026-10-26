// @vitest-environment jsdom
/**
 * ZUGRIFF — the assist field.
 *
 * The three ways this city can be made easier to take (color-safe palette,
 * quieter effects, language) used to sit as three loose rows in an
 * eighteen-item overflow list, said their state only through a coloured
 * glyph, and nothing on first run ever asked the machine whether it had
 * already requested calm. Measured before this round (source census,
 * `components/ActionBar.tsx`, non-triage menu): 18 rows, the palette the 14th,
 * effects the 13th, language the 15th — 15 keystrokes from the ••• button to
 * the palette (Enter + 13×ArrowDown + Enter), 2 visible state words in the
 * whole set (zero: `aria-checked` carries a boolean, the ◉/○ glyph carries a
 * shape, neither is a word), and `systemAdoption` did not exist.
 *
 * Asserted by condition, never by copying a sentence out of the dictionary
 * into this file:
 * - ONE place: each option exists exactly once in the open menu, inside the
 *   group whose accessible name is the dictionary's own word for Access;
 * - each option switches on its own, and the row's visible text carries its
 *   state as a WORD that agrees with `aria-checked` — after every inline
 *   style is stripped, so no colour can be the carrier;
 * - the Z binding opens that section with the caret inside it, refuses to
 *   fire in a field someone writes into or behind a modal, and is listed in
 *   the registry plan against the file that handles it (the plan-vs-handler
 *   equality itself is pinned by `keyboardRegistry.test.ts`);
 * - the system's request is taken up on the genuine first run only: a saved
 *   file outranks it, corrupt bytes outrank it (and keep their bytes), and
 *   adoption never writes to storage on its own; the taken-up keys are named
 *   as words above the very switches they moved, in EN and DE.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { useStore } from "../src/stores/useStore";
import { DICT, t, type DictKey, type Lang } from "../src/i18n";
import { ROWS } from "../src/interaction/shortcuts";
import { loadPrefs, preservedUnreadablePrefs, savePrefs, systemAdoption } from "../src/prefs";
import type { CityData } from "../src/city/types";

const KEY = "codecity-prefs";
const CORRUPT = '{"lang":"de","colorblind":tru';

const srcFile = (rel: string): string =>
  readFileSync(path.resolve(import.meta.dirname, "../src", rel), "utf-8");

const city = (): CityData =>
  ({
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 30 },
    totalFiles: 1,
    renderedFiles: 1,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: { name: "probe", path: "", children: [], detailFiles: [], districtFiles: [] },
  }) as unknown as CityData;

/** `matchMedia` that answers exactly the two signals the app may ask. */
function stubSystem({
  motion = false,
  contrast = false,
}: {
  motion?: boolean;
  contrast?: boolean;
}): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches:
          (motion && query.includes("prefers-reduced-motion")) ||
          (contrast && query.includes("prefers-contrast")),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

let host: HTMLDivElement;
let root: Root | null = null;

async function mountCity(lang: Lang): Promise<void> {
  const initial = useStore.getInitialState();
  // The store is built from `loadPrefs()` in the real app; mirroring that here
  // keeps row and note telling the same story as the shipped initialization.
  useStore.setState(
    {
      ...initial,
      prefs: { ...loadPrefs(), lang },
      cityData: city(),
      analysisId: "scan-1",
      buildPhase: "built",
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(ActionBar));
  });
}

function openMenu(): void {
  const more = host.querySelector<HTMLButtonElement>("#city-more-button");
  expect(more, "the dock has no ••• control").toBeTruthy();
  act(() => more!.click());
}

const menuButtons = (): HTMLButtonElement[] => [
  ...host.querySelectorAll<HTMLButtonElement>("#city-more-menu button"),
];

/** The row whose own text contains this label — the way a reader finds it. */
function rowFor(label: string): HTMLButtonElement {
  const row = menuButtons().find((b) => (b.textContent ?? "").includes(label));
  expect(row, `no menu row named "${label}"`).toBeTruthy();
  return row!;
}

/** A Z press where a reader's caret sits: on the given element, bubbling. */
const pressZ = (target: HTMLElement = document.body): void => {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true }),
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  const live = root;
  if (live) act(() => live.unmount());
  root = null;
  host?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Close an open menu by its control — the button, not an untyped Element. */
const clickMore = (): void => {
  const more = host.querySelector<HTMLButtonElement>("#city-more-button");
  act(() => more!.click());
};

describe("EIN Ort für alle Zugangsoptionen", () => {
  it("sits as one named group, and every option appears exactly once", async () => {
    await mountCity("de");
    openMenu();
    const group = host.querySelector("#access-group");
    expect(group, "no access group in the menu").toBeTruthy();
    expect(group!.getAttribute("role")).toBe("group");
    expect((group!.getAttribute("aria-label") ?? "").trim()).toBe(
      t("de", "actions.access" as DictKey),
    );
    for (const label of [
      "actions.reduceEffects",
      "actions.colorblindPalette",
      "actions.language",
    ]) {
      const hits = menuButtons().filter((b) =>
        (b.textContent ?? "").includes(t("de", label as DictKey)),
      );
      expect(
        hits.length,
        `"${label}" speaks in ${hits.length} places — one home was promised`,
      ).toBe(1);
      expect(group!.contains(hits[0]!), `"${label}" lives outside the access group`).toBe(true);
    }
  });

  it("switchs each option on its own, without touching the others", async () => {
    await mountCity("en");
    openMenu();
    act(() => rowFor(t("en", "actions.colorblindPalette" as DictKey)).click());
    expect(useStore.getState().prefs.colorblind).toBe(true);
    expect(useStore.getState().prefs.gfxLite).toBe(false);
    expect(useStore.getState().prefs.lang).toBe("en");
    act(() => rowFor(t("en", "actions.reduceEffects" as DictKey)).click());
    expect(useStore.getState().prefs.gfxLite).toBe(true);
    expect(useStore.getState().prefs.colorblind).toBe(true);
    act(() => rowFor(t("en", "actions.language" as DictKey)).click());
    expect(useStore.getState().prefs.lang).toBe("de");
    expect(useStore.getState().prefs.gfxLite).toBe(true);
    expect(useStore.getState().prefs.colorblind).toBe(true);
  });

  it("says every state as a WORD in the DOM — after every colour was stripped", async () => {
    await mountCity("de");
    openMenu();
    for (const b of menuButtons()) b.removeAttribute("style");
    const effects = rowFor(t("de", "actions.reduceEffects" as DictKey));
    const palette = rowFor(t("de", "actions.colorblindPalette" as DictKey));
    const off = t("de", "actions.stateOff" as DictKey);
    const on = t("de", "actions.stateOn" as DictKey);
    expect(effects.textContent ?? "", "the state word is not text").toContain(off);
    expect(palette.getAttribute("aria-checked")).toBe("false");
    act(() => palette.click());
    expect(rowFor(t("de", "actions.colorblindPalette" as DictKey)).textContent ?? "").toContain(on);
    expect(
      rowFor(t("de", "actions.colorblindPalette" as DictKey)).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      DICT["actions.stateOn" as DictKey].de !== DICT["actions.stateOn" as DictKey].en,
      "state words must be translated, not code",
    ).toBe(true);
  });

  it("names the current language as a word on its row, in both languages", async () => {
    for (const lang of ["en", "de"] as const) {
      useStore.setState(useStore.getInitialState(), true);
      localStorage.clear();
      await mountCity(lang);
      openMenu();
      const row = rowFor(t(lang, "actions.language" as DictKey));
      expect(row.textContent ?? "", `${lang}: the language row hides its state`).toContain(
        t(lang, (lang === "de" ? "access.langGerman" : "access.langEnglish") as DictKey),
      );
      clickMore(); // close
      const live = root;
      if (live) act(() => live.unmount());
      root = null;
      host?.remove();
    }
  });
});

describe("die eine bewusste Taste (Z)", () => {
  it("opens the menu with the caret inside the access section", async () => {
    await mountCity("de");
    expect(host.querySelector("#city-more-menu")).toBeNull();
    pressZ();
    expect(host.querySelector("#access-group"), "Z did not open the access section").toBeTruthy();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused, "Z left the caret outside the section it opened").toBeTruthy();
    expect(
      host.querySelector("#access-group")!.contains(focused!),
      "caret not in #access-group",
    ).toBe(true);
  });

  it("stays out of the way while a field or a dialog owns the keys", async () => {
    await mountCity("en");
    const input = document.createElement("input");
    document.body.append(input);
    pressZ(input);
    expect(host.querySelector("#city-more-menu"), "Z fired into a field being written").toBeNull();
    input.remove();
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    pressZ();
    expect(host.querySelector("#city-more-menu"), "Z fired behind an aria-modal dialog").toBeNull();
    dialog.remove();
    const studio = document.createElement("div");
    studio.className = "panel-share-studio";
    document.body.append(studio);
    pressZ();
    expect(host.querySelector("#city-more-menu"), "Z fired behind the share studio").toBeNull();
    studio.remove();
    // and it does answer once the keys are free again — the refusals above
    // were the guards, not the whole behaviour
    pressZ();
    expect(host.querySelectorAll("#city-more-menu").length).toBe(1);
  });

  it("does nothing outside a city", async () => {
    useStore.setState({ ...useStore.getInitialState(), cityData: null }, true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(ActionBar));
    });
    pressZ();
    expect(host.querySelector("#city-more-menu")).toBeNull();
  });

  it("is listed in the plan beside the file that handles it", () => {
    const row = ROWS.find((r) => r.codes.includes("Z"));
    expect(row, "the Z binding is handled but not listed").toBeTruthy();
    expect(row!.owner).toBe("components/ActionBar.tsx");
    expect(row!.text.en.length).toBeGreaterThan(10);
    expect(row!.text.de.length).toBeGreaterThan(10);
    expect(srcFile("components/ActionBar.tsx")).toMatch(/\.key\b[^\n]*"z"/);
    // the dictionary carries the row's words in both languages too
    expect(DICT[row!.text.key as DictKey].en).toBe(row!.text.en);
    expect(DICT[row!.text.key as DictKey].de).toBe(row!.text.de);
  });
});

describe("Selbst-Erkennung beim ersten Start", () => {
  it("takes the system's request up on a genuine first run — and writes nothing", () => {
    stubSystem({ motion: true, contrast: true });
    const prefs = loadPrefs();
    expect(prefs.gfxLite).toBe(true);
    expect(prefs.colorblind).toBe(true);
    expect(prefs.updateCheck, "a network request is never adopted").toBe(false);
    expect(prefs.lang, "a language is never adopted").toBe("en");
    expect(systemAdoption()).toEqual(["gfxLite", "colorblind"]);
    expect(localStorage.getItem(KEY), "adoption persisted behind the reader's back").toBeNull();
    expect(preservedUnreadablePrefs()).toBeNull();
  });

  it("names what it took up, as words, above the very switches it moved", async () => {
    stubSystem({ motion: true });
    await mountCity("de");
    openMenu();
    const note = host.querySelector(".access-system-note");
    expect(note, "the adoption happened silently").toBeTruthy();
    const text = note!.textContent ?? "";
    expect(text).toContain(t("de", "actions.reduceEffects" as DictKey));
    expect(text).not.toContain(t("de", "actions.colorblindPalette" as DictKey));
    expect(text).toContain(t("de", "access.systemNote" as DictKey).split("{what}")[0]!);
  });

  it("a saved file outranks the system — the reader's decision wins", () => {
    stubSystem({ motion: true, contrast: true });
    savePrefs({ lang: "en", gfxLite: false, colorblind: false, updateCheck: false });
    expect(loadPrefs()).toEqual({
      lang: "en",
      gfxLite: false,
      colorblind: false,
      updateCheck: false,
    });
    expect(systemAdoption()).toEqual([]);
  });

  it("corrupt bytes outrank it too: defaults, quarantine intact, no words", () => {
    stubSystem({ motion: true, contrast: true });
    localStorage.setItem(KEY, CORRUPT);
    expect(loadPrefs()).toEqual({
      lang: "en",
      gfxLite: false,
      colorblind: false,
      updateCheck: false,
    });
    expect(localStorage.getItem(KEY), "the unreadable bytes were overwritten").toBe(CORRUPT);
    expect(preservedUnreadablePrefs()).toBe(CORRUPT);
    expect(systemAdoption(), "adoption spoke over unreadable bytes").toEqual([]);
  });

  it("says nothing when the system asked nothing", () => {
    stubSystem({});
    expect(loadPrefs()).toEqual({
      lang: "en",
      gfxLite: false,
      colorblind: false,
      updateCheck: false,
    });
    expect(systemAdoption()).toEqual([]);
  });

  it("gives the choice back without a restart: the note leaves when the reader decides", async () => {
    stubSystem({ motion: true, contrast: true });
    await mountCity("en");
    openMenu();
    expect(
      host.querySelector(".access-system-note"),
      "no note on the adopted first run",
    ).toBeTruthy();
    act(() => rowFor(t("en", "actions.colorblindPalette" as DictKey)).click());
    // the click saved the set; the explanation retires with the decision it described
    expect(systemAdoption()).toEqual([]);
    clickMore();
    openMenu();
    expect(
      host.querySelector(".access-system-note"),
      "the note outlived the reader's own decision",
    ).toBeNull();
  });
});
