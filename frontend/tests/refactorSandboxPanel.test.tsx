// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefactorSandbox } from "../src/components/RefactorSandbox";
import { sandboxCopy } from "../src/components/sandboxCopy";
import { useSandboxStore } from "../src/stores/useSandboxStore";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData, CityFile } from "../src/city/types";

/**
 * The panel is the reader's half of the sandbox: three actions they can press,
 * a comparison they can read, the assumptions said out loud, a coverage GOAL
 * that never masquerades as a measurement, and a reset. The model's numbers are
 * judged in `refactorSandbox.test.ts`; here the contract is what reaches the
 * screen and the store.
 */

const TARGET: CityFile = file("src/big.ts", "TypeScript", [], undefined, {
  id: "big",
  linesOfCode: 400,
  cyclomaticComplexity: 40,
  importCount: 8,
});

const CITY: CityData = city({
  files: [TARGET],
  tree: dir({ path: "", detailFiles: [TARGET] }),
  fileConnections: [
    { from: "login", to: "big", weight: 1 },
    { from: "session", to: "big", weight: 1 },
  ],
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useSandboxStore.setState(useSandboxStore.getInitialState(), true);
  useStore.setState(
    { ...useStore.getState(), prefs: { ...useStore.getState().prefs, lang: "en" } },
    false,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useSandboxStore.setState(useSandboxStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

async function show(element: ReactElement) {
  await act(async () => root.render(element));
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) =>
    (b.textContent || "").includes(text),
  );
  expect(found, `no button reading "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}

async function press(text: string) {
  const b = button(text);
  await act(async () => b.click());
}

const text = () => (host.textContent || "").replace(/\s+/g, " ").trim();

describe("the Refactor-Sandbox panel", () => {
  it("offers the three learning actions and labels itself heuristic", async () => {
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    expect(text()).toContain(sandboxCopy("en", "title"));
    expect(text()).toContain(sandboxCopy("en", "heuristic"));
    expect(button(sandboxCopy("en", "split")).getAttribute("type")).toBe("button");
    expect(button(sandboxCopy("en", "extract")).getAttribute("type")).toBe("button");
    expect(button(sandboxCopy("en", "test")).getAttribute("type")).toBe("button");
    expect(useSandboxStore.getState().scenario).toBeNull();
  });

  it("publishes a split scenario to the store and compares metrics", async () => {
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    await press(sandboxCopy("en", "split"));
    const scenario = useSandboxStore.getState().scenario;
    expect(scenario?.fileId).toBe("big");
    expect(scenario?.action).toBe("split");
    expect(scenario?.parts).toBe(2);
    expect(button(sandboxCopy("en", "split")).getAttribute("aria-pressed")).toBe("true");
    expect(text()).toContain(sandboxCopy("en", "comparison"));
    expect(text()).toContain(sandboxCopy("en", "metricHeight"));
    expect(text()).toContain(sandboxCopy("en", "assumptions"));
  });

  it("changes the split part count through an accessible control", async () => {
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    await press(sandboxCopy("en", "split"));
    const select = host.querySelector<HTMLSelectElement>("[data-sandbox-parts]");
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = "3";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(useSandboxStore.getState().scenario?.parts).toBe(3);
    expect(useSandboxStore.getState().scenario?.ghosts).toHaveLength(3);
  });

  it("says a test adds a coverage GOAL, not a measurement, and no height change", async () => {
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    await press(sandboxCopy("en", "test"));
    expect(useSandboxStore.getState().scenario?.coverageGoal).toEqual({
      targetPct: 80,
      measured: false,
    });
    expect(text()).toContain(sandboxCopy("en", "coverageGoal", { pct: "80" }));
    expect(text()).toContain(sandboxCopy("en", "goalNotMeasured"));
    expect(text()).toContain(sandboxCopy("en", "noHeightChange"));
  });

  it("resets the store and the preview", async () => {
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    await press(sandboxCopy("en", "split"));
    expect(useSandboxStore.getState().scenario).not.toBeNull();
    await press(sandboxCopy("en", "reset"));
    expect(useSandboxStore.getState().scenario).toBeNull();
    expect(button(sandboxCopy("en", "split")).getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector("[data-sandbox-preview]")).toBeNull();
  });

  it("speaks German from its own copy module", async () => {
    useStore.setState(
      { ...useStore.getState(), prefs: { ...useStore.getState().prefs, lang: "de" } },
      false,
    );
    await show(<RefactorSandbox file={TARGET} cityData={CITY} />);
    expect(text()).toContain("Refactor-Sandbox");
    expect(button("Datei teilen")).toBeTruthy();
    expect(button("Modul extrahieren")).toBeTruthy();
    expect(button("Test hinzufügen")).toBeTruthy();
    expect(text()).toContain("Heuristik");
  });
});
