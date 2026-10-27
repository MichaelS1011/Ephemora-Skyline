// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArrivalProgress } from "../src/components/ArrivalProgress";
import type { ArrivalStage } from "../src/firstArrival";

/**
 * MASTER-2027 §03.06 — the visible setup progress.
 *
 * The claim this file holds is honesty: the marks move only with the two guided
 * beats that actually exist, and nothing is shown as done that the reader has
 * not done. #30 added a third entry in the same shape as the two beats: the
 * folder action that really follows, named in the button's own words. It is
 * never `current` — the beats decide themselves. "Create an Ephe" (§04) stays
 * out of the list: it is not a step of this sequence.
 */

let host: HTMLDivElement;

function render(stage: ArrivalStage, onSkip?: () => void): HTMLElement {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ArrivalProgress lang="en" stage={stage} onSkip={onSkip} />);
  });
  return host;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  host?.remove();
  vi.unstubAllGlobals();
});

function states(stage: ArrivalStage): string[] {
  const el = render(stage);
  return [...el.querySelectorAll("li")].map((li) => li.getAttribute("data-state") ?? "");
}

describe("the marks follow the real beats", () => {
  it("opens on the greeting — nothing done yet", () => {
    expect(states("welcome")).toEqual(["current", "todo", "todo"]);
  });

  it("advances to the introduction — the greeting is done", () => {
    expect(states("intro")).toEqual(["done", "current", "todo"]);
  });
});

describe("it does not invent progress", () => {
  it("lists the two beats and the action that really follows (#30)", () => {
    const el = render("intro");
    const lis = [...el.querySelectorAll("li")];
    expect(lis).toHaveLength(3);
    // The third entry names the folder action in the button's own words — it
    // is a real step on this screen (#28 brought the entry surface to it).
    // "Create an Ephe" (§04) stays out: not a beat of this sequence.
    const stepText = lis.map((li) => li.textContent ?? "").join(" ");
    expect(stepText).toMatch(/Choose project folder|Projektordner/);
    expect(stepText).not.toMatch(/Ephe/);
    // every entry has the same shape: a dot span, no bare sentence beside it
    for (const li of lis) {
      expect(
        li.querySelector(".start-progress-dot"),
        `${li.textContent}: kein Punkt`,
      ).not.toBeNull();
    }
  });

  it("marks the current step for assistive tech, and names each state", () => {
    const el = render("intro");
    const lis = [...el.querySelectorAll("li")];
    expect(lis[1]?.getAttribute("aria-current")).toBe("step");
    expect(lis[0]?.getAttribute("aria-current")).toBeNull();
    // the state is in the accessible name, not only in the dot's colour
    expect(lis[0]?.getAttribute("aria-label")).toMatch(/done/);
    expect(lis[1]?.getAttribute("aria-label")).toMatch(/now/);
  });
});

describe("the sequence's Skip lives on the chrome (§03.07)", () => {
  it("offers one Skip that ends the whole introduction", () => {
    let skipped = 0;
    const el = render("intro", () => {
      skipped += 1;
    });
    const skip = el.querySelector<HTMLButtonElement>(".start-progress-skip");
    expect(skip).not.toBeNull();
    act(() => {
      skip?.click();
    });
    expect(skipped).toBe(1);
  });

  it("shows no Skip when the host does not offer one", () => {
    const el = render("welcome");
    expect(el.querySelector(".start-progress-skip")).toBeNull();
  });
});
