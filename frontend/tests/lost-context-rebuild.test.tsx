// @vitest-environment jsdom
/**
 * 17.14 — the reader's rebuild must survive its own grace window.
 *
 * Measured on 2026-10-27 in the real app (headless Chrome, --use-angle=metal,
 * `.qoder-scratch/skyline-defect-hunter/2026-10-27-kontextverlust/`): after a
 * genuine `webglcontextlost`, clicking "Draw it again" remounts a fresh canvas
 * that draws the city again within ~240 ms — and then App tears that healthy
 * new canvas back down 2500 ms later. Cause: `sceneRebuildAt` is raised by the
 * loss and is only ever cleared by a `webglcontextrestored` event — an event
 * the OLD canvas would fire, but that canvas was unmounted the moment the
 * sentence appeared (the same synthetic-event run proves the teardown happens
 * with a perfectly healthy context). So after the rebuild the stale flag makes
 * `contextLost` true again the instant the grace window closes, React
 * unmounts the new `<Canvas>`, and the reader is left on the sentence with 0
 * draw calls. Recovery only worked by reloading the page.
 *
 * The contract this file pins, in the product's own words (App.tsx): "the
 * reader pressed 'Draw it again', so the canvas is remounted either way and
 * the sentence has to leave" — LEAVE, permanently, until a NEW loss.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", async () => {
  const { createElement: h } = await import("react");
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) =>
      h("div", { "data-canvas": "true" }, children),
    useFrame: () => {},
    useThree: () => ({
      camera: { position: { set() {} }, rotation: {} },
      gl: { domElement: null },
    }),
  };
});
vi.mock("@react-three/postprocessing", () => ({
  EffectComposer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Bloom: () => null,
  ToneMapping: () => null,
}));
vi.mock("postprocessing", () => ({ ToneMappingMode: { ACES_FILMIC: 1 } }));
vi.mock("../src/components/CityScene", () => ({ CityScene: () => null }));

import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import App from "../src/App";

const LOST_CITY = city({
  tree: dir({
    path: "",
    detailFiles: [
      file("src/server.ts", "TypeScript", [
        finding({ severity: "P1", type: "SQL_INJECTION", message: "Unparameterised SQL" }),
      ]),
    ],
  }),
  analysisId: "lost-rebuild-1",
});

const SENTENCE = "The graphics stopped drawing this city.";

let host: HTMLDivElement | undefined;
let root: Root | undefined;

function arrive(): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(App)));
}

const sentenceUp = (): boolean => (host!.textContent ?? "").includes(SENTENCE);
const canvasUp = (): boolean => host!.querySelector("[data-canvas]") !== null;
const retryButton = (): HTMLButtonElement | undefined =>
  [...host!.querySelectorAll("button")].find((b) => /Draw it again/.test(b.textContent ?? ""));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: LOST_CITY,
      analysisId: "lost-rebuild-1",
      buildPhase: "built",
    },
    true,
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the reader-driven rebuild after a lost graphics context", () => {
  it("raises the sentence when the context is lost", () => {
    arrive();
    expect(canvasUp()).toBe(true);
    expect(sentenceUp()).toBe(false);
    act(() => useStore.getState().onContextLost());
    expect(sentenceUp()).toBe(true);
    expect(canvasUp()).toBe(false);
  });

  it("puts the canvas back and keeps it after the grace window closes", () => {
    arrive();
    act(() => useStore.getState().onContextLost());
    expect(sentenceUp()).toBe(true);
    const btn = retryButton();
    expect(btn, "the sentence must offer 'Draw it again'").toBeTruthy();
    act(() => btn!.click());
    expect(sentenceUp()).toBe(false);
    expect(canvasUp()).toBe(true);
    // the grace window: 2500 ms, then sceneRebuilding drops. The rebuilt
    // canvas must STILL stand — this is where the measured app killed it.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(sentenceUp(), "the stale flag tore the rebuilt canvas down after the grace window").toBe(
      false,
    );
    expect(canvasUp(), "the rebuilt canvas must survive its own grace window").toBe(true);
  });

  it("tells a NEW loss on the rebuilt canvas — the fix must not silence the story", () => {
    arrive();
    act(() => useStore.getState().onContextLost());
    act(() => retryButton()!.click());
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(canvasUp()).toBe(true);
    act(() => useStore.getState().onContextLost());
    expect(sentenceUp()).toBe(true);
  });
});
