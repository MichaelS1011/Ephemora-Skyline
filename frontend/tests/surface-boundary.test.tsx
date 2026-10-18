// @vitest-environment jsdom
/**
 * A failing surface ends at its own edge.
 *
 * Without a boundary a throw inside the world or the card is a white window:
 * no sentence, no way back, and the triage queue the reader was working through
 * gone with it. This file mounts components that throw and asks the one question
 * that matters — what is still standing afterwards — in both UI languages, for
 * both boundaries. It also pins that a failure still reaches the console: the
 * drives fail on a console error, and a boundary that hushed a crash would turn
 * a real defect into a green run.
 *
 * What this file cannot prove and no unit test can: that a throw from a
 * `useFrame` callback inside the real @react-three/fiber reconciler reaches
 * `SceneBoundary`. That is the reason the two boundaries sit where they do in
 * App.tsx, and it is checked live, not here.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneBoundary, SurfaceBoundary } from "../src/components/SurfaceBoundary";
import type { Lang } from "../src/i18n";

let broken = true;
function Boom(): ReactNode {
  if (broken) throw new Error("the surface threw");
  return createElement("p", { "data-rebuilt": "yes" }, "the surface is drawing again");
}

let host: HTMLDivElement | undefined;
let root: Root | undefined;
const logged: string[] = [];

function mountWorld(lang: Lang): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  host.innerHTML =
    '<nav data-dock="true"><button>Triage 8 findings</button></nav><main data-surface="world"></main>';
  root = createRoot(host.querySelector("[data-surface]")!);
  act(() =>
    root!.render(
      createElement(
        SurfaceBoundary,
        {
          lang,
          subject: "surface.worldGone",
          body: "surface.worldBody",
          retry: "surface.tryAgain",
          origin: "city",
          className: "surface-failed--world",
        },
        createElement(Boom),
      ),
    ),
  );
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  broken = true;
  vi.restoreAllMocks();
});

describe("a failing world", () => {
  it("keeps the dock standing and says what was lost", () => {
    logged.length = 0;
    vi.spyOn(console, "error").mockImplementation(
      (...a: unknown[]) => void logged.push(String(a[0])),
    );
    const el = mountWorld("en");
    const fallback = el.querySelector("[data-surface-failed]");
    expect(fallback, "the world's own fallback is on screen").not.toBeNull();
    expect(fallback!.textContent).toMatch(/city stopped drawing/i);
    expect(fallback!.getAttribute("role")).toBe("alert");
    // the claim that survives the crash: the queue is outside the boundary
    expect(el.querySelector("[data-dock] button")!.textContent).toContain("Triage 8 findings");
    expect(logged).toContain("[surface:city]");
  });

  it("promises only what the crashed surface can keep", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const text = mountWorld("de").querySelector("[data-surface-failed]")!.textContent ?? "";
    expect(text).toMatch(/Die Stadt hat das Zeichnen aufgegeben/);
    // the city IS what died, so no sentence may promise the city is intact
    expect(text).not.toMatch(/der Rest der Stadt|die Stadt.*unberührt/i);
    // and a render boundary knows nothing about what left the machine
    expect(text).not.toMatch(/geschickt|sent/i);
  });

  it("speaks German without leaking internals", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const text = mountWorld("de").querySelector("[data-surface-failed]")!.textContent ?? "";
    expect(text).toMatch(/Nochmal zeichnen/);
    expect(text).not.toMatch(/componentStack|Error:|Boundary caught|SurfaceBoundary/);
  });

  it("gives the surface back when the cause is gone", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const el = mountWorld("en");
    broken = false;
    act(() => el.querySelector<HTMLButtonElement>(".surface-failed-retry")!.click());
    expect(el.querySelector("[data-rebuilt]")?.textContent).toBe("the surface is drawing again");
    expect(el.querySelector("[data-surface-failed]")).toBeNull();
  });
});

describe("a failing card", () => {
  it("uses the card's own verb and body, not the city's", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        createElement(
          SurfaceBoundary,
          {
            lang: "en",
            subject: "surface.cardGone",
            body: "surface.cardBody",
            retry: "surface.tryAgainCard",
            origin: "card",
            className: "panel-info panel-card",
          },
          createElement(Boom),
        ),
      ),
    );
    const fallback = host!.querySelector("[data-surface-failed]")!;
    expect(fallback.textContent).toMatch(/This card stopped answering/);
    expect(fallback.textContent).toMatch(/Show it again/);
    expect(fallback.textContent).not.toMatch(/Draw it again/);
    expect(fallback.className).toContain("panel-info");
  });
});

describe("a scene graph that throws", () => {
  it("draws nothing and reports upward", () => {
    logged.length = 0;
    vi.spyOn(console, "error").mockImplementation(
      (...a: unknown[]) => void logged.push(String(a[0])),
    );
    let failed: unknown = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        createElement(
          SceneBoundary,
          { origin: "scene", onFail: (e: unknown) => (failed = e) },
          createElement(Boom),
        ),
      ),
    );
    expect(host!.childElementCount, "a half-drawn city is worse than none").toBe(0);
    expect(String(failed)).toMatch(/the surface threw/);
    expect(logged).toContain("[surface:scene]");
  });

  it("does not loop when a component throws a falsy value", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    let renders = 0;
    function CountingThrower(): ReactNode {
      renders += 1;
      throw null;
    }
    act(() =>
      root!.render(
        createElement(SurfaceBoundary, {
          lang: "en",
          subject: "surface.worldGone",
          body: "surface.worldBody",
          retry: "surface.tryAgain",
          origin: "city",
          className: "surface-failed--world",
          children: createElement(CountingThrower),
        }),
      ),
    );
    const first = renders;
    expect(host!.querySelector("[data-surface-failed]")).not.toBeNull();
    expect(renders, "a null throw must not put the boundary back into the child").toBe(first);
  });
});
