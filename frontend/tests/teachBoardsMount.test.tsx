// @vitest-environment jsdom
/**
 * The teaching boards' gates: the three plates stand only in the state their
 * placement and copy were measured for.
 *
 * Two measured findings from the harvest acceptance (2026-10-29, the harvest
 * lane's frames) decided these gates, and this file holds them so neither can
 * quietly come back:
 *
 *   • The build window. The boards face the arrival eye while the camera is
 *     still the crane: at 1440×900 the finding board stood across a third of
 *     the frame over an empty terrain; at 1280×800 the same three boards were
 *     nowhere in the frame. A board is scenery of the FINISHED city.
 *   • The district level. Drilled into `frontend` (35 files), the boards
 *     stood inside it carrying the root city's numbers — "Files read · 74" on
 *     a district's own streets. A board that lies by position is worse than
 *     no board.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", async () => {
  const { createElement: h } = await import("react");
  /** The canvas measure the placement is computed against — 964×800 is what a
   *  1280×800 window renders after the project card's column. */
  const state = {
    gl: { domElement: { clientWidth: 964, clientHeight: 800 } },
    size: { width: 964, height: 800 },
  };
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) =>
      h("div", { "data-canvas": "true" }, children),
    useThree: (selector: (s: typeof state) => unknown) => selector(state),
  };
});

import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { TeachBoards } from "../src/components/TeachBoards";

const DEMO_CITY = city({
  totalFiles: 74,
  findingsBySeverity: { P0: 3, P1: 2, P2: 3 },
  scanProvenance: {
    regex: false,
    gitleaks: false,
    semgrep: false,
    dependencies: false,
    osv: false,
    ruff: false,
    churn: false,
    duplicates: false,
    coverage: false,
  } as never,
  tree: dir({
    path: "",
    detailFiles: [
      file("services/database.ts", "TypeScript", [
        finding({ severity: "P0", ruleId: "SQL_INJECTION", line: 141 }),
      ]),
    ],
    children: [
      dir({ path: "frontend", detailFiles: [file("frontend/app.tsx", "TypeScript", [])] }),
    ],
  }),
});

let host: HTMLDivElement | undefined;
let root: Root | undefined;

function mount(): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(TeachBoards)));
}

const boards = (): number => host!.querySelectorAll('[name="teach-boards"] > mesh').length;

beforeEach(() => {
  const store = useStore.getState();
  act(() => {
    store.setCityData(DEMO_CITY);
    store.setBuildPhase("built");
  });
});

afterEach(() => {
  act(() => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
});

describe("the boards stand only where they were measured", () => {
  it("three boards stand on the built root level", () => {
    mount();
    expect(boards()).toBe(3);
  });

  it("no board stands while the city is still building", () => {
    act(() => useStore.getState().setBuildPhase("constructing"));
    mount();
    expect(boards()).toBe(0);
    expect(host!.querySelector('[name="teach-boards"]')).toBeNull();
  });

  it("no board stands on the bare world, before any city", () => {
    act(() => useStore.getState().setCityData(null));
    mount();
    expect(boards()).toBe(0);
  });

  it("no board stands inside a district — the copy speaks the root city's numbers", () => {
    act(() => useStore.getState().drillIn("frontend"));
    mount();
    expect(useStore.getState().focusPath).toEqual(["frontend"]);
    expect(boards()).toBe(0);
    expect(host!.querySelector('[name="teach-boards"]')).toBeNull();
  });

  it("back at the overview the boards stand again", () => {
    act(() => {
      useStore.getState().drillIn("frontend");
      useStore.getState().drillOut();
    });
    mount();
    expect(useStore.getState().focusPath).toEqual([]);
    expect(boards()).toBe(3);
  });
});
