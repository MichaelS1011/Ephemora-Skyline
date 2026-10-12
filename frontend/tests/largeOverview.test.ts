import { afterEach, describe, expect, it } from "vitest";
import { defaultOverviewPath } from "../src/city/overview";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile } from "../src/city/types";

function directory(name: string, children: CityDir[] = []): CityDir {
  return {
    name,
    path: name,
    children,
    detailFiles: [],
    remainingFiles: 0,
    districtFiles: [],
    fileCount: 1100,
    languages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    topFindings: [],
  } as unknown as CityDir;
}
function world(totalFiles = 1100): CityData {
  return {
    totalFiles,
    repo: { owner: "local", name: "large", branch: "local" },
    tree: directory("large", [directory("src", [directory("api"), directory("ui")])]),
    languages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    meta: {},
    fileConnections: [],
    dirConnections: [],
  } as unknown as CityData;
}
afterEach(() => useStore.setState(useStore.getInitialState(), true));

describe("large world entry", () => {
  it("opens the first branching level of a deep world and uses it for the return flight", () => {
    const city = world();
    expect(defaultOverviewPath(city)).toEqual(["src"]);
    useStore.getState().setCityData(city);
    expect(useStore.getState().focusPath).toEqual(["src"]);
    useStore.getState().setFocusPath(["src", "api"]);
    useStore.getState().resetFocus();
    expect(useStore.getState().focusPath).toEqual(["src"]);
    useStore.getState().setBuildPhase("built");
    useStore.getState().setFocusPath(["src", "api"]);
    useStore.getState().replayConstruction();
    expect(useStore.getState().focusPath).toEqual(["src"]);
  });
  it("keeps small towns at the project level", () => {
    expect(defaultOverviewPath(world(2))).toEqual([]);
  });
  it("keeps project files visible rather than skipping them for the branches", () => {
    const city = world();
    city.tree.detailFiles = [{ id: "manifest" }] as CityFile[];
    expect(defaultOverviewPath(city)).toEqual([]);
    city.tree.detailFiles = [];
    city.tree.remainingFiles = 1;
    expect(defaultOverviewPath(city)).toEqual([]);
  });
  it("does not drill into a single leaf or skip an already branching root", () => {
    const city = world();
    city.tree.children[0]!.children = [];
    expect(defaultOverviewPath(city)).toEqual([]);
    city.tree.children.push(directory("tests"));
    expect(defaultOverviewPath(city)).toEqual([]);
  });
});
