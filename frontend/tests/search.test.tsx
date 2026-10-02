// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "../src/components/SearchBar";
import { KeyboardHints } from "../src/components/KeyboardHints";
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

function typeQuery(input: HTMLInputElement, value: string): void {
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setValue.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function press(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new window.KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe("SearchBar keyboard and screen-reader navigation", () => {
  it("announces matching options and opens the chosen file without losing input focus", () => {
    const input = mountSearch();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Search by file name",
    );
    typeQuery(input, "TypeScript");
    const options = container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(
      document.getElementById(input.getAttribute("aria-controls")!)?.getAttribute("role"),
    ).toBe("listbox");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    press(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    press(input, "Enter");
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: "file:src/beta.ts" });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("handles arrows with no matches and selects the first result after refining", () => {
    const input = mountSearch();
    typeQuery(input, "missing");
    press(input, "ArrowDown");
    press(input, "ArrowUp");
    press(input, "Enter");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("No files match");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(useStore.getState().selectedUnit).toBeNull();
    typeQuery(input, "alpha");
    press(input, "Enter");
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: "file:src/alpha.ts" });
  });

  it("dismisses only search on Escape and requires reopening before Enter can select", () => {
    const input = mountSearch();
    typeQuery(input, ".ts");
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    press(input, "Escape");
    window.removeEventListener("keydown", globalKey);
    expect(globalKey).not.toHaveBeenCalled();
    expect(input.value).toBe(".ts");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input);
    press(input, "Enter");
    expect(useStore.getState().selectedUnit).toBeNull();
    press(input, "ArrowUp");
    press(input, "Enter");
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: "file:src/beta.ts" });
  });

  it("leaves Tab native and closes results when focus moves out of search", () => {
    const input = mountSearch();
    typeQuery(input, ".ts");
    expect(press(input, "Tab").defaultPrevented).toBe(false);
    const nextControl = document.createElement("button");
    container.append(nextControl);
    act(() => nextControl.focus());
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("KeyboardHints modal", () => {
  it("keeps Tab inside the dialog and returns focus to its trigger after Escape", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Shortcuts</button>
          <KeyboardHints isOpen={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    act(() => root.render(<Harness />));
    const trigger = container.querySelector("button")!;
    act(() => {
      trigger.focus();
      trigger.click();
    });
    const close = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close keyboard shortcuts"]',
    )!;
    expect(document.activeElement).toBe(close);
    expect(press(close, "Tab").defaultPrevented).toBe(true);
    expect(press(close, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    press(close, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
