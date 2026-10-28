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
 * not done.
 *
 * #30 put a third entry in the row — the folder action, named in the button's
 * own words — and this file defended it. Erste Reise (2026-10-28) took it out,
 * measured: on the first beat the row was then four prompts wide (three
 * entries and the Skip) and none of the three entries was one — two of them
 * printed the beat's own title 117 px above the card titled with it, and the
 * third was the exact label of a button that is not on the screen and will not
 * be for two more clicks. The marks stay; they stopped borrowing words. The
 * beats are named once, on the card, and each mark keeps its beat and its state
 * as its accessible name, so the row still reads out "Welcome — now".
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
    expect(states("welcome")).toEqual(["current", "todo"]);
  });

  it("advances to the introduction — the greeting is done", () => {
    expect(states("intro")).toEqual(["done", "current"]);
  });
});

describe("it does not invent progress", () => {
  it("marks the two beats and nothing else", () => {
    const el = render("intro");
    const lis = [...el.querySelectorAll("li")];
    expect(lis).toHaveLength(2);
    // every entry has the same shape: a dot, and a name for assistive tech
    for (const li of lis) {
      expect(
        li.querySelector(".start-progress-dot"),
        `${li.textContent}: kein Punkt`,
      ).not.toBeNull();
      expect(li.getAttribute("aria-label"), "die Marke trägt ihren Beat als Namen").toMatch(
        /Welcome|How it works/,
      );
    }
    // "Create an Ephe" (§04) is not a beat of this sequence, and the folder
    // action is not either: it is a button, and it is not on this screen.
    const painted = [...lis].map((li) => li.textContent ?? "").join(" ");
    expect(painted.trim(), "die Marke trägt keinen sichtbaren Text").toBe("");
    expect(el.textContent).not.toMatch(/Choose project folder|Projektordner/);
    expect(el.textContent).not.toMatch(/Ephe/);
  });

  it("says the length once, in words the card does not already say", () => {
    const el = render("welcome");
    const line = el.querySelector(".start-progress-position");
    expect(line, "die Zeile sagt, wie weit der Weg ist").not.toBeNull();
    expect(line?.textContent).toBe("Getting started · 1 of 2");
    const el2 = render("intro");
    expect(el2.querySelector(".start-progress-position")?.textContent).toBe(
      "Getting started · 2 of 2",
    );
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
  it("names what it ends", () => {
    const el = render("welcome", () => {});
    const skip = el.querySelector<HTMLButtonElement>(".start-progress-skip");
    expect(skip?.textContent).toBe("Skip the introduction");
  });

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
