// @vitest-environment jsdom
/**
 * The permalink race.
 *
 * Back/Forward is the undo of the visit (App's popstate handler), and every
 * press can fire a city fetch while the previous one is still in the air. A
 * codebase that learned this lesson twice — `runRef` after every await in
 * useLocalAnalysis, `requestRef` + abort in TimeMachine — had one door left
 * open: `loadCity`, where a slow response for the city you already left could
 * land after the fast one and paint the old world under the new address, or
 * an old failure could mark the new city "demo" it never was.
 *
 * This file holds the door: two deferred responses, deliberately resolved in
 * the WRONG order (fast first, slow last), and the store must still say the
 * city the address names.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The world is not what this file measures — same stubs arrival-budget uses.
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

import { city, file } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { t } from "../src/i18n";
import App from "../src/App";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function probeCity(analysisId: string) {
  return city({
    analysisId,
    files: [file(`src/${analysisId}.ts`, "TypeScript", [])],
  });
}

let host: HTMLDivElement | undefined;
let root: Root | undefined;

function mountApp(): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(App)));
}

const visibleText = (): string => (host?.textContent ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ cityData: null, analysisId: null, isLoading: false });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  vi.unstubAllGlobals();
});

describe("permalink race", () => {
  it("a late response for the city you already left never paints", async () => {
    const slow = deferred<ReturnType<typeof jsonResponse>>();
    const fast = deferred<ReturnType<typeof jsonResponse>>();
    vi.stubGlobal("fetch", (input: RequestInfo | URL) =>
      String(input).includes("slow-city") ? slow.promise : fast.promise,
    );

    // The visit begins at the slow permalink; its request is in the air.
    window.history.replaceState({}, "", "/?city=slow-city");
    mountApp();

    // Back/Forward: the address says fast-city while slow is still pending.
    window.history.replaceState({}, "", "/?city=fast-city");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    // The fast one answers first — the world on screen is fast-city.
    await act(async () => {
      fast.resolve(jsonResponse(probeCity("fast-city")));
    });
    expect(useStore.getState().cityData?.analysisId).toBe("fast-city");

    // The slow one answers LAST. Without the load token this is where the old
    // world lands under the new address.
    await act(async () => {
      slow.resolve(jsonResponse(probeCity("slow-city")));
    });
    expect(useStore.getState().cityData?.analysisId).toBe("fast-city");
    expect(useStore.getState().isLoading).toBe(false);
  });

  it("a late failure cannot mark a live city demo", async () => {
    const slow = deferred<ReturnType<typeof jsonResponse>>();
    const fast = deferred<ReturnType<typeof jsonResponse>>();
    vi.stubGlobal("fetch", (input: RequestInfo | URL) =>
      String(input).includes("slow-city") ? slow.promise : fast.promise,
    );

    window.history.replaceState({}, "", "/?city=slow-city");
    mountApp();

    window.history.replaceState({}, "", "/?city=fast-city");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    await act(async () => {
      fast.resolve(jsonResponse(probeCity("fast-city")));
    });
    expect(useStore.getState().cityData?.analysisId).toBe("fast-city");

    // The old request dies (mistyped link, evicted from the archive). That
    // truth belongs to the address that made it — not to the city now on
    // screen. Without the token this is where the stale catch fires and the
    // landing shows the permalink-error banner over a city that answered
    // fine, calling it demo.
    await act(async () => {
      slow.resolve({ ...jsonResponse({}), ok: false, status: 404 });
    });
    expect(useStore.getState().cityData?.analysisId).toBe("fast-city");
    expect(host!.querySelector('[role="alert"]')).toBeNull();
    expect(visibleText()).not.toContain(t("en", "app.permalinkError"));
  });
});
