// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoachMarks } from "../src/components/CoachMarks";
import { useStore } from "../src/stores/useStore";

/**
 * The onboarding primer sits over the city at bottom-centre, so Escape on it
 * means "I have read this". Only when nothing else is asking for the key: the
 * primer's capture-phase listener keeps the ownership order the tour already
 * uses — menus, modals, the analyze panel and anything being typed into win.
 * Ignoring that took out thirteen control tests in one go.
 *
 * It no longer raises itself. `showPrimer` is the dock's "First look" row, and
 * the store is the only memory the primer has: what Escape ends, ends for the
 * visit rather than for a version number in localStorage.
 */
let host: HTMLDivElement;
let root: Root;

function renderCoach(open = true): void {
  useStore.getState().setShowPrimer(open);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<CoachMarks />));
}

const primer = (): Element | null => host.querySelector('[role="region"]');

function druecke(target: EventTarget): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

describe("Escape against the primer", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().resetToLanding();
    renderCoach();
    expect(primer(), "the primer shows while the dock says it is on").toBeTruthy();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("is dismissed by an Escape that belongs to nobody", () => {
    druecke(window);
    expect(primer()).toBeNull();
  });

  it("stays out of the way of an open menu", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const inner = document.createElement("button");
    menu.append(inner);
    host.append(menu);
    druecke(inner);
    expect(primer(), "the menu owns Escape first").toBeTruthy();
  });

  it("stays out of the way of a modal dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    const inner = document.createElement("span");
    dialog.append(inner);
    host.append(dialog);
    druecke(inner);
    expect(primer()).toBeTruthy();
  });

  it("stays out of the way of a focused input", () => {
    const input = document.createElement("input");
    host.append(input);
    input.focus();
    druecke(input);
    expect(primer()).toBeTruthy();
  });

  it("does not come back: the dismissal is the store's answer, not a remount", () => {
    druecke(window);
    expect(primer()).toBeNull();
    act(() => root.unmount());
    // the same city, the same visit, no new request: the primer stays folded
    renderCoach(false);
    expect(primer(), "a fresh mount must not re-show a dismissed primer").toBeNull();
    // and the row that opened it is the row that brings it back
    act(() => root.unmount());
    renderCoach(true);
    expect(primer()).toBeTruthy();
  });
});
