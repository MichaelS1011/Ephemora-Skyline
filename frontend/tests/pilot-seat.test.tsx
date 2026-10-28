// @vitest-environment jsdom
/**
 * The seat in the tow-plane, reached from outside the keyboard.
 *
 * `F` was listed in the shortcut table and answered by the camera rig, and that
 * was all: no door in the interface, no number while flying, and three states
 * in which the key did nothing without saying why. A bound control that refuses
 * silently is the defect class `interaction/shortcuts.ts` was built to end, so
 * these cases hold one law (`pilotRefusal`) in front of three doors — the key,
 * the dock's menu, the header — and demand a sentence wherever the answer is no.
 */
import { act } from "react";
import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../src/components/ActionBar";
import { HudOverlay } from "../src/components/HudOverlay";
import { pilotReadout, pilotRefusal, pilotStateAt } from "../src/city/pilotMotion";
import { useStore } from "../src/stores/useStore";
import { explain, type Press, type World } from "../src/interaction/shortcuts";
import type { CityData } from "../src/city/types";
import { city as buildCity, file as buildFile, finding } from "./helpers/cityFixture";

const SRC = path.resolve(import.meta.dirname, "../src");

const SCAN = "11111111-2222-4333-8444-555555555555";

function demoCity(): CityData {
  return buildCity({
    analysisId: SCAN,
    files: [
      buildFile("src/a.ts", "TypeScript", [
        finding({ type: "RULE_A", ruleId: "RULE_A", severity: "P0", line: 3, message: "one" }),
      ]),
    ],
  });
}

let host: HTMLDivElement;
let root: Root;

function render(node: ReactElement): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}

function seedState(over: Record<string, unknown> = {}): void {
  useStore.setState({ ...useStore.getInitialState(), cityData: demoCity(), ...over }, true);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  seedState();
});

// ── the law ─────────────────────────────────────────────────────────────────

describe("pilotRefusal — the seat's one law", () => {
  it("is silent for a built city with nobody else driving", () => {
    expect(pilotRefusal({ hasCity: true, building: false, tour: false })).toBeNull();
  });

  it("names each reason, in the order a reader would hit them", () => {
    expect(pilotRefusal({ hasCity: false, building: false, tour: false })).toBe("noCity");
    expect(pilotRefusal({ hasCity: true, building: true, tour: false })).toBe("building");
    expect(pilotRefusal({ hasCity: true, building: false, tour: true })).toBe("tour");
  });

  it("rounds the flight numbers to what a reader can compare", () => {
    expect(pilotReadout(pilotStateAt({ agl: 41.62, speed: 7.41 }))).toEqual({ alt: 42, spd: 7 });
    expect(pilotReadout(pilotStateAt({ agl: 0.4, speed: 0 }))).toEqual({ alt: 0, spd: 0 });
  });
});

describe("enterPilot — the store obeys the same law the doors show", () => {
  it("refuses while the city is under its crane, and while the tour drives", () => {
    seedState({ buildPhase: "constructing" });
    useStore.getState().enterPilot();
    expect(useStore.getState().cameraMode).toBe("free");

    seedState({ buildPhase: "built", tourActive: true });
    useStore.getState().enterPilot();
    expect(useStore.getState().cameraMode).toBe("free");
  });

  it("sits the reader down in a built city and hands the aircraft back", () => {
    seedState({ buildPhase: "built" });
    useStore.getState().enterPilot();
    expect(useStore.getState().cameraMode).toBe("pilot");
    expect(useStore.getState().pilotView).toBe("chase");
    useStore.getState().togglePilotView();
    expect(useStore.getState().pilotView).toBe("cockpit");
    useStore.getState().exitPilot();
    expect(useStore.getState().cameraMode).toBe("free");
    expect(useStore.getState().flightReadout).toBeNull();
  });
});

// ── the sentence for a refusal ──────────────────────────────────────────────

const PRESS = (key: string): Press => ({
  key,
  code: `Key${key.toUpperCase()}`,
  meta: false,
  ctrl: false,
  typing: false,
  modalOpen: false,
  onCanvas: true,
});

const WORLD = (over: Partial<World> = {}): World => ({
  hasCity: true,
  focusPath: [],
  buildings: 1,
  blocks: 1,
  selectedFileId: null,
  markedDistrict: null,
  cameraMode: "free",
  triageActive: false,
  triageSize: 1,
  triageOpen: 1,
  tourActive: false,
  constructing: false,
  primerVisible: false,
  hasSearchField: false,
  ...over,
});

describe("explain — a bound key that cannot act says why", () => {
  it("answers the crane and the tour, and stays quiet when F does something", () => {
    expect(explain(PRESS("f"), WORLD({ constructing: true }))).not.toBeNull();
    expect(explain(PRESS("f"), WORLD({ tourActive: true }))).not.toBeNull();
    expect(explain(PRESS("f"), WORLD())).toBeNull();
    expect(explain(PRESS("f"), WORLD({ cameraMode: "pilot" }))).toBeNull();
  });

  it("tells a reader on the ground that V belongs to a flight", () => {
    expect(explain(PRESS("v"), WORLD())?.en).toContain("F takes the controls");
    expect(explain(PRESS("v"), WORLD({ cameraMode: "pilot" }))).toBeNull();
  });

  it("keeps the typing rule: a letter written into a field is not a key press", () => {
    const typing = { ...PRESS("f"), typing: true };
    expect(explain(typing, WORLD({ constructing: true }))).toBeNull();
  });
});

// ── the dock's door ─────────────────────────────────────────────────────────

describe("the More menu carries the seat", () => {
  const openMenu = (): HTMLElement => {
    const button = host.querySelector<HTMLButtonElement>("#city-more-button");
    expect(button, "the ••• button").toBeTruthy();
    act(() => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const item = host.querySelector<HTMLElement>("[data-testid='menu-fly']");
    expect(item, "the flight row in the menu").toBeTruthy();
    return item as HTMLElement;
  };

  it("offers the seat in a built city, and the flight ends from the same row", () => {
    seedState({ buildPhase: "built" });
    render(createElement(ActionBar));
    const item = openMenu();
    expect(item.textContent).toContain("Fly the plane");
    expect(item.hasAttribute("disabled")).toBe(false);
    act(() => item.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStore.getState().cameraMode).toBe("pilot");
  });

  it("strikes the row with its reason while the crane is still up", () => {
    seedState({ buildPhase: "constructing" });
    render(createElement(ActionBar));
    const item = openMenu();
    expect(item.hasAttribute("disabled")).toBe(true);
    // The app's own tooltip provider moves `title` to `data-tip`; either form
    // has to carry the reason, or the refusal is silent again.
    expect(item.getAttribute("title") ?? item.getAttribute("data-tip")).toContain("crane");
    act(() => item.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStore.getState().cameraMode).toBe("free");
  });

  it("changes its own name once the reader is flying", () => {
    seedState({ buildPhase: "built", cameraMode: "pilot" });
    render(createElement(ActionBar));
    const item = openMenu();
    expect(item.textContent).toContain("Hand the plane back");
    expect(item.hasAttribute("disabled")).toBe(false);
    act(() => item.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStore.getState().cameraMode).toBe("free");
  });
});

// ── the header's numbers ────────────────────────────────────────────────────

describe("the header while a person flies", () => {
  it("carries height, speed and the view, and only in the seat", () => {
    seedState({ buildPhase: "built", cameraMode: "pilot", flightReadout: { alt: 42, spd: 8 } });
    render(createElement(HudOverlay, { apiStatus: "live" }));
    const line = host.querySelector<HTMLElement>(".workspace-flight");
    expect(line, "the flight line in the header").toBeTruthy();
    expect(line?.textContent).toContain("42");
    expect(line?.textContent).toContain("8");
    expect(line?.textContent).toContain("m/s");
    const view = host.querySelector<HTMLButtonElement>(".workspace-flight button");
    expect(view?.textContent).toBe("Behind");
    act(() => view!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStore.getState().pilotView).toBe("cockpit");
  });

  it("says nothing about a flight nobody is in", () => {
    seedState({ buildPhase: "built", flightReadout: { alt: 42, spd: 8 } });
    render(createElement(HudOverlay, { apiStatus: "live" } as never));
    expect(host.querySelector(".workspace-flight")).toBeNull();
  });
});

// ── the two doors the frame loop owns ───────────────────────────────────────

describe("the rig's own obligations", () => {
  const rig = readFileSync(path.join(SRC, "components/CameraRig.tsx"), "utf-8");

  it("lets a written letter belong to the field, not to the seat", () => {
    const block = rig.slice(rig.indexOf("const held ="), rig.indexOf("!isNavKey"));
    expect(block.length).toBeGreaterThan(0);
    expect(block, "V and F stand down for typing, dialogs and the minimap").toContain(
      "isTypingTarget(e.target)",
    );
    expect(block).toContain("dialogOpen()");
    expect(block).toContain("ownsTheKeys(e.target)");
  });

  it("hands the aircraft back on every way out of the seat", () => {
    const block = rig.slice(rig.indexOf('if (cameraMode === "pilot")'));
    const sweeper = block.slice(0, block.indexOf("}, [cameraMode]);"));
    expect(sweeper.length).toBeGreaterThan(0);
    expect(sweeper).toContain("stopPilot()");
    expect(sweeper, "the show's plane must not stay frozen mid-sky").toContain("setFlying(false)");
    expect(sweeper, "the header stops counting a flight that ended").toContain(
      "setFlightReadout(null)",
    );
  });

  it("gives the keys to the world when the seat was taken by mouse", () => {
    // Measured before the fix: the dock's ••• button answers ArrowUp by opening
    // its own menu and stops the event on the way, so 2,2 s of held ↑ moved the
    // aircraft 0 m. The seat therefore moves the focus to the canvas.
    const block = rig.slice(rig.indexOf('if (cameraMode === "pilot")'));
    const enter = block.slice(0, block.indexOf("return;"));
    expect(enter).toContain('querySelector<HTMLElement>(".city-canvas")');
    expect(enter).toContain(".focus()");
  });

  it("writes the flight numbers on a beat, not per frame", () => {
    expect(rig).toMatch(/readoutAt\.current >= 0\.5/);
  });
});
