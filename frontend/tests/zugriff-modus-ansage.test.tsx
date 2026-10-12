// @vitest-environment jsdom
/**
 * ZUGRIFF-05, Punkt 1 — "was man sieht, aber nicht hört".
 *
 * The mode bar picks one of three lenses (STRUCTURE / SECURITY /
 * DEPENDENCIES, setter `setViewMode` in the store). Reported: which one is on
 * rides on colour and a CSS dot, so a reader who cannot see the difference
 * cannot say it either. The product's own rule (see
 * `tests/farbsichere-alarme.test.ts`) is that colour is never the only carrier.
 *
 * Deliberately condition-based, never a word comparison:
 * - the marked control is *behaviourally* the current one — pressing it leaves
 *   the store where it was, while pressing any unmarked control moves the store
 *   and takes the mark with it;
 * - the mark survives having every inline style stripped off the buttons, which
 *   is what "not carried by colour" means in a DOM;
 * - the state is spoken through a description channel (a screen reader reads it
 *   after the name) while the *name* stays the plain visible label, so voice
 *   control can still say "click SECURITY";
 * - the wording is derived by diffing one control against itself in its two
 *   states and resolving the difference back to a dictionary key that carries
 *   both a German and an English value. This file types no UI string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ModeBar } from "../src/components/ModeBar";
import { useStore, type ViewMode } from "../src/stores/useStore";
import { DICT, type Lang } from "../src/i18n";

const MODES: readonly ViewMode[] = ["structure", "security", "dependencies"];

let host: HTMLDivElement;
let root: Root | null = null;

function paint(mode: ViewMode, lang: Lang): void {
  const initial = useStore.getInitialState();
  useStore.setState({ ...initial, viewMode: mode, prefs: { ...initial.prefs, lang } }, true);
  const previous = root;
  if (previous) {
    act(() => previous.unmount());
    root = null;
  }
  host = document.createElement("div");
  document.body.append(host);
  const fresh = createRoot(host);
  root = fresh;
  act(() => fresh.render(createElement(ModeBar)));
}

const radios = (): HTMLButtonElement[] => [
  ...host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];

/**
 * The description channels a browser can read state from, in the order the
 * platform reads them: `aria-describedby` targets, `aria-description`, `title`.
 * The test asks whether *any* of them names the state, so an equally valid
 * carrier passes and the reported gap — none of them does — fails.
 */
function descriptionOf(el: Element): string {
  const byIds = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => host.querySelector(`#${CSS.escape(id)}`)?.textContent ?? "")
    .join(" · ");
  return [byIds, el.getAttribute("aria-description") ?? "", el.getAttribute("title") ?? ""]
    .filter((s) => s !== "")
    .join(" · ");
}

/** The current-mode marker, whichever of the two honest attributes carries it. */
const marked = (): HTMLButtonElement[] =>
  radios().filter(
    (b) => b.getAttribute("aria-current") === "true" || b.getAttribute("aria-pressed") === "true",
  );

const segments = (text: string): string[] =>
  text
    .split("·")
    .map((s) => s.trim())
    .filter((s) => s !== "");

/** The dictionary keys whose value in this language *is* this segment. */
function keysFor(segment: string, lang: Lang): string[] {
  return Object.entries(DICT)
    .filter(([, entry]) => entry[lang].trim() === segment)
    .map(([key]) => key);
}

/**
 * Diff one and the same control between the state where it is the current lens
 * and the state where it is not. The tip belongs to the control and stays
 * identical, so whatever appears only in the first run is the state notation —
 * got by condition, never copied from the dictionary.
 */
function notations(lang: Lang): { on: string; off: string } {
  paint(MODES[1]!, lang);
  const on = descriptionOf(radios()[1]!);
  paint(MODES[0]!, lang);
  const off = descriptionOf(radios()[1]!);
  expect(on, `${lang}: the control describes nothing at all`).not.toBe("");
  expect(off, `${lang}: the control describes nothing at all either`).not.toBe("");
  expect(on, `${lang}: on and off say the same thing`).not.toBe(off);
  const onOnly = segments(on).filter((s) => !segments(off).includes(s));
  const offOnly = segments(off).filter((s) => !segments(on).includes(s));
  expect(onOnly, `${lang}: the active state adds no word of its own`).toHaveLength(1);
  expect(offOnly, `${lang}: the inactive state adds no word of its own`).toHaveLength(1);
  expect(
    segments(off).filter((s) => segments(on).includes(s)).length,
    `${lang}: the two states share no tip text`,
  ).toBeGreaterThan(0);
  return { on: onOnly[0]!, off: offOnly[0]! };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  const live = root;
  if (live) act(() => live.unmount());
  root = null;
  host?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("der aktive Modus ist zu sagen, nicht nur zu sehen", () => {
  it("trägt genau ein Knopf das Current-Merkmal — in jedem der drei Modi", () => {
    for (const mode of MODES) {
      paint(mode, "de");
      expect(radios(), `${mode}: the bar lost a control`).toHaveLength(3);
      expect(marked(), `${mode}: nothing says which lens is on`).toHaveLength(1);
    }
  });

  it("sitzt auf dem Knopf, der den Modus wählt, der gerade gilt", () => {
    for (const mode of MODES) {
      paint(mode, "de");
      const on = marked()[0]!;
      // Pressing the marked control must be a no-op for the store: it already
      // selects the running mode. That is the behaviour, not a label.
      act(() => on.click());
      expect(useStore.getState().viewMode, `${mode}: the mark sits on the wrong control`).toBe(
        mode,
      );
    }
  });

  it("wandert mit, wenn eine andere Linse gewählt wird", () => {
    paint("structure", "de");
    const before = marked()[0]!;
    const other = radios().find((b) => b !== before)!;
    act(() => other.click());
    const moved = useStore.getState().viewMode;
    expect(moved, "clicking a mode control did not change the mode").not.toBe("structure");
    const after = marked();
    expect(after, "the marker did not follow the store").toHaveLength(1);
    expect(after[0]).toBe(other);
    // and the new marked control really selects the mode the store now reports
    act(() => after[0]!.click());
    expect(useStore.getState().viewMode).toBe(moved);
  });

  it("bleibt lesbar, wenn jede Fläche ihrer Farbe beraubt wird", () => {
    paint("security", "de");
    for (const b of radios()) b.removeAttribute("style");
    expect(marked(), "with the colours gone, the mode is unsayable again").toHaveLength(1);
  });

  it("sagt an, welcher Zustand gilt — und nur einer Knopf behauptet, es zu sein", () => {
    const { on, off } = notations("de");
    for (const mode of MODES) {
      paint(mode, "de");
      const all = radios();
      const claimsOn = all.filter((b) => segments(descriptionOf(b)).includes(on));
      const claimsOff = all.filter((b) => segments(descriptionOf(b)).includes(off));
      expect(claimsOn, `${mode}: exactly one control may claim the active state`).toHaveLength(1);
      expect(claimsOff, `${mode}: the other two must say they are off`).toHaveLength(2);
      expect(claimsOn[0]).toBe(marked()[0]);
    }
  });

  it("holt beide Zustands-Wörter aus dem Wörterbuch — DE und EN an demselben Schlüssel", () => {
    const de = notations("de");
    const en = notations("en");
    const pairs = [
      ["active", de.on, en.on],
      ["inactive", de.off, en.off],
    ] as const;
    for (const [state, deWord, enWord] of pairs) {
      const deKeys = keysFor(deWord, "de");
      const enKeys = keysFor(enWord, "en");
      expect(
        deKeys.length,
        `the ${state} wording is hardcoded, not in the dictionary`,
      ).toBeGreaterThan(0);
      expect(enKeys.length, `the ${state} wording has no English`).toBeGreaterThan(0);
      expect(
        deKeys.filter((k) => enKeys.includes(k)).length,
        `the ${state} wording is not one key in both languages`,
      ).toBeGreaterThan(0);
      for (const k of deKeys) {
        const entry = DICT[k as keyof typeof DICT];
        expect(entry.de.trim(), `${k} has no German`).not.toBe("");
        expect(entry.en.trim(), `${k} has no English`).not.toBe("");
      }
    }
    // The two states must be two different dictionary entries, in either
    // language — one key with a placeholder would not tell them apart either.
    expect(
      keysFor(de.on, "de").filter((k) => keysFor(de.off, "de").includes(k)),
      "on and off share one dictionary key",
    ).toEqual([]);
    expect(
      keysFor(en.on, "en").filter((k) => keysFor(en.off, "en").includes(k)),
      "on and off share one dictionary key",
    ).toEqual([]);
  });

  it("lässt den Namen des Knopfes in Ruhe — Sprachsteuerung trifft weiter das Wort", () => {
    paint("structure", "de");
    const before = radios().map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(before.every((label) => label !== "")).toBe(true);
    paint("security", "de");
    const after = radios().map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
    // No state word ever enters the visible label: the bar reads the same in
    // every mode, so nothing about its look moved.
    expect(after).toEqual(before);
    for (const b of radios()) {
      const label = b.getAttribute("aria-label");
      if (label !== null) {
        expect(label.trim(), `${label} is not the label on the button`).toBe(
          (b.textContent ?? "").trim(),
        );
      }
      // `aria-pressed` on role="radio" is invalid ARIA — a single-select lens
      // group states its case with the radio semantics it already carries.
      expect(b.getAttribute("aria-pressed"), "aria-pressed on a radio").toBeNull();
    }
  });

  it("hält die Gruppen-Semantik: eine Linse an, und es ist die markierte", () => {
    paint("dependencies", "de");
    const group = host.querySelector('[role="radiogroup"]');
    expect(group, "the lens control has no group").toBeTruthy();
    expect(
      (group?.getAttribute("aria-label") ?? "").trim().length,
      "the group is unnamed",
    ).toBeGreaterThan(0);
    const checked = radios().filter((b) => b.getAttribute("aria-checked") === "true");
    expect(checked, "one lens at a time, and the group says so").toHaveLength(1);
    expect(checked[0]).toBe(marked()[0]);
  });
});
