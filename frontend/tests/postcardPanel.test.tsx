// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostcardChallenges } from "../src/components/PostcardChallenges";
import { postcardText } from "../src/components/postcardCopy";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityFile } from "../src/city/types";

const code = (path: string, id: string, overrides: Partial<CityFile> = {}): CityFile =>
  file(path, "TypeScript", [], undefined, { id, ...overrides });

const TALL = code("src/tall.ts", "f-tall", {
  linesOfCode: 900,
  unverifiedBy: ["semgrep"],
});
const LOOP = code("src/loop.ts", "f-loop", { linesOfCode: 300, inCycle: true });
const CORE = code("src/core.ts", "f-core", { linesOfCode: 200 });
const A = code("src/a.ts", "f-a", { linesOfCode: 30 });

const CITY = city({
  analysisId: "scan-postcards-panel",
  files: [TALL, LOOP, CORE, A],
  tree: dir({
    path: "",
    children: [dir({ path: "src", name: "src", detailFiles: [TALL, LOOP, CORE, A] })],
  }),
  fileConnections: [
    { from: "f-a", to: "f-core", weight: 1 },
    { from: "f-loop", to: "f-core", weight: 1 },
  ],
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  useStore.setState({
    ...useStore.getState(),
    cityData: CITY,
    analysisId: "scan-postcards-panel",
    selectedUnit: null,
    prefs: { ...useStore.getState().prefs, lang: "en" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function show(element: ReactElement) {
  await act(async () => root.render(element));
}

const text = (): string => (host.textContent || "").replace(/\s+/g, " ").trim();

describe("the Postcard Challenges panel", () => {
  it("renders only the missions this scan supports", async () => {
    await show(<PostcardChallenges />);
    expect(text()).toContain(postcardText("en", { key: "section.title" }));
    expect(text()).toContain("src/tall.ts");
    expect(text()).toContain("src/loop.ts");
    expect(text()).toContain("src/core.ts");
    expect(text()).not.toContain(postcardText("en", { key: "section.empty" }));
  });

  it("flies to a mission target through the store", async () => {
    await show(<PostcardChallenges />);
    const fly = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      (button.textContent || "").includes(postcardText("en", { key: "action.fly" })),
    );
    await act(async () => fly!.click());
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: "f-tall" });
  });

  it("does not render a completion mark for an unphotographed target", async () => {
    await show(<PostcardChallenges />);
    expect(text()).not.toContain(postcardText("en", { key: "state.captured" }));
    expect(text()).toContain(postcardText("en", { key: "state.pending" }));
  });
});
