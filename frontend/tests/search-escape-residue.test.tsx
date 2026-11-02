// @vitest-environment jsdom

/**
 * The search field must leave no residue, and `/` must never type into the
 * question the person just left.
 *
 * Measured in the shipped 0.4.3 by headless Chrome (the coordinator's finding 3,
 * 2026-11-01): after `README` → `Escape` → `/` → `src` the field read
 * "README/src", and four open/close cycles read "README/src//////". Escape
 * closed the list but kept the focus AND the value, so `/` found an input on the
 * other side of the guard in `App.tsx` and fell through into it as a character.
 *
 * These cases drive the product's own `SearchBar` with keystrokes — no
 * hand-set state — and they read the field after every step. The keystroke
 * helper emulates the one thing jsdom does not do for a `keydown`: when the page
 * did not cancel the event, the browser inserts the character. So a test that
 * asserts a value also asserts that the app cancelled the key it should cancel.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "../src/components/SearchBar";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityFile } from "../src/city/types";

function makeCity(): CityData {
  const files: CityFile[] = ["alpha.ts", "beta.ts"].map((name, index) => ({
    id: `file:src/${name}`,
    name,
    path: `src/${name}`,
    language: "TypeScript",
    linesOfCode: 100 - index,
    cyclomaticComplexity: 1,
    threatLevel: "safe",
    findings: [],
  }));
  return {
    repo: { owner: "local", name: "test", branch: "main" },
    totalFiles: 2,
    renderedFiles: 2,
    totalLines: 199,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    languages: { TypeScript: 199 },
    tree: {
      name: "test",
      path: "",
      fileCount: 2,
      linesOfCode: 199,
      languages: { TypeScript: 199 },
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      threatScore: 0,
      topFindings: [],
      children: [],
      detailFiles: files,
      remainingFiles: 0,
      districtFiles: [],
    },
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
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState(useStore.getInitialState());
  useStore.getState().setCityData(makeCity());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mountSearch(): HTMLInputElement {
  act(() => root.render(<SearchBar />));
  const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  act(() => input.focus());
  return input;
}

/** One real keystroke: keydown, then the browser's own default action. */
function pressKey(target: HTMLInputElement, key: string): KeyboardEvent {
  const event = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => target.dispatchEvent(event));
  if (key.length === 1 && !event.defaultPrevented) typeCharacter(target, key);
  return event;
}

/** What Chrome does with an uncancled character key: append it and fire `input`. */
function typeCharacter(input: HTMLInputElement, character: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, input.value + character);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

/** Types a whole word one keystroke at a time. */
function typeWord(input: HTMLInputElement, word: string): void {
  for (const character of word) pressKey(input, character);
}

const listbox = (): HTMLElement | null => container.querySelector('[role="listbox"]');
const status = (): string | undefined => container.querySelector('[role="status"]')?.textContent;

describe("leaving the search leaves no residue", () => {
  it("closes the list, clears the field, and keeps the keyboard on the field", () => {
    const input = mountSearch();
    typeWord(input, "README");
    expect(input.value).toBe("README");
    expect(status()).toContain("No files match");

    pressKey(input, "Escape");
    expect(listbox(), "Escape closed the list").toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value, "Escape left the query in the field").toBe("");
    expect(document.activeElement, "the field must not be thrown out of the tab order").toBe(input);
  });

  it("keeps the signature: README, Escape, `/`, src reads exactly src", () => {
    const input = mountSearch();
    const trail: string[] = [];
    typeWord(input, "README");
    trail.push(input.value);

    pressKey(input, "Escape");
    trail.push(input.value);

    const slash = pressKey(input, "/");
    trail.push(input.value);
    expect(slash.defaultPrevented, "`/` was not cancelled, so it typed into the field").toBe(true);

    typeWord(input, "src");
    trail.push(input.value);

    expect(
      trail,
      "the field after README → Esc → / → src — tonight it read README/README/src",
    ).toEqual(["README", "", "", "src"]);
    expect(input.value).toBe("src");
    // The fixture holds src/alpha.ts and src/beta.ts, so a clean "src" answers
    // with both; a mashed query answers with nothing.
    expect(status(), "the search still answers the mashed query").not.toContain("README");
    expect(status()).toContain("2 matching files");
  });

  it("survives four open/close cycles without collecting stray slashes", () => {
    const input = mountSearch();
    typeWord(input, "README");
    pressKey(input, "Escape");
    pressKey(input, "/");
    typeWord(input, "src");

    for (let cycle = 0; cycle < 3; cycle += 1) {
      pressKey(input, "Escape");
      pressKey(input, "/");
      typeWord(input, "src");
      expect(input.value, `cycle ${cycle + 1} left residue: ${input.value}`).toBe("src");
    }
  });

  it("reopens the list when `/` is the search shortcut, not a character", () => {
    const input = mountSearch();
    typeWord(input, "README");
    pressKey(input, "Escape");
    expect(listbox()).toBeNull();

    pressKey(input, "/");
    expect(input.getAttribute("aria-expanded"), "`/` did not answer as the search key").toBe(
      "true",
    );
    expect(listbox(), "`/` reopened no results").not.toBeNull();
    expect(input.value).toBe("");
  });

  it("still lets a path be typed: `/` inside a live query is a character", () => {
    const input = mountSearch();
    expect(input.getAttribute("aria-expanded"), "focusing opened no list").toBe("true");
    typeWord(input, "src");
    pressKey(input, "/");
    typeWord(input, "alpha");
    expect(input.value, "the path separator was eaten by the shortcut guard").toBe("src/alpha");
  });

  it("does not leak the keystroke to the window handler that owns `/` elsewhere", () => {
    const input = mountSearch();
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    typeWord(input, "README");
    globalKey.mockClear();
    pressKey(input, "Escape");
    expect(
      globalKey,
      "Escape reached the city's Escape chain from inside the field",
    ).not.toHaveBeenCalled();
    const slash = pressKey(input, "/");
    expect(slash.defaultPrevented).toBe(true);
    window.removeEventListener("keydown", globalKey);
  });
});
