// @vitest-environment jsdom
// The nudge is the one place this feature reaches out by itself, so its
// limits are pinned here: once per city, a refusal that holds forever, and it
// walks away on its own instead of waiting for an answer.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareHint } from "../src/share/ShareHint";
import { useStore } from "../src/stores/useStore";
import type { CityData } from "../src/city/types";

const city = (analysisId: string): CityData =>
  ({
    repo: { owner: "local", name: analysisId, branch: "main" },
    analysisId,
    totalFiles: 3,
    renderedFiles: 3,
    totalLines: 30,
    languages: { TypeScript: 30 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: { name: analysisId, path: "", children: [], detailFiles: [], districtFiles: [] },
  }) as unknown as CityData;

let container: HTMLDivElement;
let root: Root;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ShareHint />));
}

function build(id: string): void {
  act(() => useStore.setState({ cityData: city(id), buildPhase: "constructing" }));
  act(() => useStore.setState({ buildPhase: "built" }));
}

const hint = (): HTMLElement | null => container.querySelector(".share-hint");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ cityData: null, buildPhase: "empty" });
  vi.useRealTimers();
});

describe("the one nudge", () => {
  it("comes when a city finished building", () => {
    expect(hint()).toBeNull();
    build("scan-a");
    expect(hint()).not.toBeNull();
    expect(hint()!.getAttribute("role")).toBe("note");
  });

  it("comes on a reload that shows the skyline already standing", () => {
    // The app does not replay the build for a `?city=` visit, so a nudge that
    // waited for the transition would stay silent on every ordinary day.
    act(() => root.unmount());
    mount();
    act(() => useStore.setState({ cityData: city("scan-reload"), buildPhase: "built" }));
    expect(hint()).not.toBeNull();
  });

  it("says nothing while a scan or a queue is running", () => {
    act(() =>
      useStore.setState({ cityData: city("scan-busy"), buildPhase: "built", isLoading: true }),
    );
    expect(hint()).toBeNull();
    act(() => useStore.setState({ isLoading: false, triageActive: true }));
    expect(hint()).toBeNull();
    act(() => useStore.setState({ triageActive: false, tourActive: true }));
    expect(hint()).toBeNull();
    act(() => useStore.setState({ tourActive: false }));
    expect(hint()).not.toBeNull();
  });

  it("does not come twice for the same city", () => {
    build("scan-a");
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(hint()).toBeNull();
    build("scan-a");
    expect(hint()).toBeNull();
  });

  it("comes for a city it has not seen", () => {
    build("scan-a");
    act(() => root.unmount());
    mount();
    build("scan-b");
    expect(hint()).not.toBeNull();
  });

  it("leaves on its own without an answer", () => {
    build("scan-a");
    expect(hint()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(hint()).toBeNull();
  });

  it("takes a refusal as final, for every city after it", () => {
    build("scan-a");
    const no = hint()!.querySelector<HTMLButtonElement>(".share-hint-no");
    expect(no).not.toBeNull();
    expect(no!.textContent).toContain("not again");
    act(() => {
      no!.click();
    });
    expect(hint()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("ephemora-share-hint") ?? "{}").muted).toBe(true);
    act(() => root.unmount());
    mount();
    build("scan-c");
    expect(hint()).toBeNull();
  });

  it("opens the studio from its button and does not nag afterwards", () => {
    const seen: string[] = [];
    const onOpen = (): void => {
      seen.push("opened");
    };
    window.addEventListener("ephemora:open-share-studio", onOpen);
    build("scan-a");
    const yes = hint()!.querySelector<HTMLButtonElement>(".share-hint-yes");
    act(() => yes!.click());
    expect(seen).toEqual(["opened"]);
    expect(hint()).toBeNull();
    window.removeEventListener("ephemora:open-share-studio", onOpen);
  });

  it("keeps the stored list of nudged cities bounded", () => {
    for (let i = 0; i < 40; i += 1) {
      build(`scan-${i}`);
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
    }
    const stored = JSON.parse(window.localStorage.getItem("ephemora-share-hint") ?? "{}") as {
      shown: string[];
    };
    expect(stored.shown.length).toBeLessThanOrEqual(24);
  });
});
