// @vitest-environment jsdom
/**
 * Auftrag 24 — a language switch is not a city visit.
 *
 * Measured live on 2026-10-27 in a second instance on own ports
 * (`.qoder-scratch/skyline-hardening-engineer/2026-10-27-sprachwechsel/
 * drive-result.json`): with the heat shell open and a
 * channel picked, one click on the menu's language control fired 1-2 extra
 * `GET /api/result/<id>/city` and `.workspace-heatmap` dropped out of the DOM
 * (shell 1 -> 0, checked channel THREAT -> gone). Cause chain: `App` keeps
 * `lang` in `loadCity`'s callback deps (only for the error string), so every
 * `prefs.lang` change hands the permalink effect a new function, the effect
 * re-runs, re-fetches the SAME city and calls `setCityData` — the one door
 * that folds every deferred surface (useStore.ts "Stale view state must never
 * leak into a new city"). The reader who switches language to read the census
 * sentence in their own language loses the census sentence at that moment.
 *
 * The contract pinned here, in three parts:
 *  (a) a language switch at App level leaves the heat shell, the picked
 *      channel and the city request count untouched;
 *  (b) a REAL city change (a different analysisId) still folds the shell —
 *      that is the existing intent and must not be lost by the fix;
 *  (c) `setPref("lang", ...)` in the store touches no surface state, no
 *      arrival/reduced-motion state and no verdict/resident warnings.
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

import { useStore } from "../src/stores/useStore";
import App from "../src/App";
import type { CityData, CityDir } from "../src/city/types";

function dir(path: string, files: string[]): CityDir {
  return {
    name: path,
    path,
    fileCount: files.length,
    linesOfCode: 10,
    languages: { TypeScript: 10 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    detailFiles: files.map((p, i) => ({
      id: `f${i}`,
      name: p.split("/").pop() ?? p,
      path: p,
      language: "TypeScript",
      linesOfCode: 10,
      cyclomaticComplexity: 1,
      threatLevel: "safe",
      findings: [],
    })),
    children: [],
  } as unknown as CityDir;
}
const city = (id: string): CityData =>
  ({
    analysisId: id,
    projectName: "p",
    rootPath: "",
    repo: { owner: "me", name: "p", url: "" },
    totalFiles: 1,
    totalLines: 10,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree: dir("root", ["src/a.ts"]),
    districts: [],
    meta: {},
  }) as unknown as CityData;

let cityRequests: string[] = [];
let host: HTMLDivElement | undefined;
let root: Root | undefined;

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
  useStore.setState(useStore.getInitialState(), true);
  cityRequests = [];
  window.history.pushState({}, "", "/?city=switch-1");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (/\/api\/result\/[^/]+\/city$/.test(url)) {
      cityRequests.push(url);
      return new Response(JSON.stringify(city("switch-1")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });
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

async function arrive(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(App));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(useStore.getState().cityData?.analysisId, "the permalink brought the city in").toBe(
    "switch-1",
  );
}

describe("the language switch inside a city", () => {
  it("(a) leaves the open heat shell, the picked channel and the network quiet", async () => {
    await arrive();
    const arrivalFetches = cityRequests.length;
    act(() => {
      useStore.getState().setShowHeat(true);
      useStore.getState().setHeatChannel("threat");
      useStore.getState().setPref("lang", "de");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const s = useStore.getState();
    expect(s.showHeat, "the shell the reader opened must stand after a language switch").toBe(true);
    expect(s.heatChannel, "the picked channel must survive the switch").toBe("threat");
    expect(
      cityRequests,
      `a language switch must not re-visit the city (arrival fired ${arrivalFetches} fetch(es), now ${cityRequests.length})`,
    ).toHaveLength(arrivalFetches);
    expect(host!.querySelector("[data-canvas]"), "the city is still on screen").not.toBeNull();
  });

  it("(b) a real city change still folds the deferred surfaces", () => {
    useStore.getState().setCityData(city("switch-A"));
    useStore.getState().setShowHeat(true);
    useStore.getState().setHeatChannel("threat");
    useStore.setState({ showLegend: true, showMinimap: true });
    useStore.getState().setCityData(city("switch-B"));
    const s = useStore.getState();
    expect(s.showHeat, "a new city is a neutral stage — the shell folds").toBe(false);
    expect(s.showLegend).toBe(false);
    expect(s.showMinimap).toBe(false);
  });

  it("(c) setPref(lang) touches no surface, arrival or warning state", () => {
    useStore.getState().setCityData(city("switch-C"));
    useStore.getState().setShowHeat(true);
    useStore.getState().setHeatChannel("time");
    useStore.getState().setHeatDateMs(1_700_000_000_000);
    useStore.setState({ residentNamesBlocked: true, verdictsUnreadable: true });
    const before = useStore.getState();
    const snapshot = {
      showHeat: before.showHeat,
      heatChannel: before.heatChannel,
      heatDateMs: before.heatDateMs,
      residentNamesBlocked: before.residentNamesBlocked,
      verdictsUnreadable: before.verdictsUnreadable,
      buildPhase: before.buildPhase,
    };
    act(() => {
      useStore.getState().setPref("lang", "de");
    });
    const after = useStore.getState();
    expect(after).toMatchObject(snapshot);
  });
});
