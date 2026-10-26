// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlastRadiusBlock } from "../src/components/BlastRadiusBlock";
import { useStore } from "../src/stores/useStore";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData, CityFile } from "../src/city/types";

/**
 * 005 Teil A — the dossier half of the blast radius.
 *
 * The direction rule itself is judged in `blast-radius.test.ts` against a hand
 * built graph. What this file owns is the part a reader actually meets: the
 * answer is off until asked for, it names the files rather than pointing at a
 * colour, it keeps the files the city does not draw in the list, and it changes
 * when the selection changes.
 *
 *   login.ts ─┐
 *   session.ts ┼─▶ auth.ts        (three files import auth)
 *   deep/other.ts ─┘              (this one has no building on the plaza)
 *   auth.ts ──▶ util.ts           (so util must NOT list auth)
 */

const plaza = (path: string, id: string): CityFile =>
  file(path, "TypeScript", [], undefined, { id, linesOfCode: 40, cyclomaticComplexity: 3 });

const LOGIN = plaza("login.ts", "login");
const SESSION = plaza("session.ts", "session");
const AUTH = plaza("auth.ts", "auth");
const UTIL = plaza("util.ts", "util");
const DEEP = plaza("deep/other.ts", "other");

function probeCity(): CityData {
  return city({
    repo: { owner: "local", name: "blast", branch: "main" },
    files: [LOGIN, SESSION, AUTH, UTIL],
    tree: dir({
      path: "",
      detailFiles: [LOGIN, SESSION, AUTH, UTIL],
      children: [dir({ path: "deep", name: "deep", detailFiles: [DEEP], districtFiles: [DEEP] })],
    }),
    fileConnections: [
      { from: "login", to: "auth", weight: 1 },
      { from: "session", to: "auth", weight: 2 },
      { from: "other", to: "auth", weight: 1 },
      { from: "auth", to: "util", weight: 1 },
    ],
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: probeCity(),
      focusPath: [],
      selectedUnit: { kind: "file", id: "auth" },
      buildPhase: "built",
    },
    true,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

async function show(element: ReactElement) {
  await act(async () => root.render(element));
}

async function press(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) =>
    (b.textContent || "").includes(text),
  );
  expect(button, `no button reading "${text}"`).toBeTruthy();
  await act(async () => button!.click());
}

const text = () => (host.textContent || "").replace(/\s+/g, " ").trim();

describe("the impact answer in the file dossier", () => {
  it("is not shown until the reader asks", async () => {
    await show(<BlastRadiusBlock />);
    expect(host.querySelector(".cf-blast-panel")).toBeNull();
    expect(text()).toContain("Show potential impact");
  });

  it("names the importing files, in path order, when asked", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(host.querySelector(".cf-blast-panel")).not.toBeNull();
    expect(text()).toContain("3 files import this one");
    const listed = [...host.querySelectorAll(".cf-blast-file")].map((b) => b.textContent);
    // Sorted by PATH, not by the name the list shows: `deep/other.ts` precedes
    // `login.ts` even though "other" would follow "login" by name.
    expect(listed).toEqual(["▣other.tsnot drawn here", "▣login.ts", "▣session.ts"]);
  });

  it("keeps the file it cannot draw in the list and says so", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(text()).toContain("not drawn here");
    expect(text()).toContain("2 of 3 stand as a building on this level.");
  });

  it("states what the claim is made of", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(text()).toContain("Static import analysis. Runtime impact not verified.");
  });

  it("follows the arrow: the file that imports is not itself affected", async () => {
    // auth imports util, so selecting util names auth — and selecting auth must
    // never name util.
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(text()).not.toContain("util.ts");
    await act(async () => useStore.setState({ selectedUnit: { kind: "file", id: "util" } }, false));
    expect(text()).toContain("1 file imports this one");
    expect(text()).toContain("▣auth.ts");
  });

  it("says so plainly when nothing imports the file", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    await act(async () =>
      useStore.setState({ selectedUnit: { kind: "file", id: "login" } }, false),
    );
    expect(text()).toContain("No file in this city imports this one.");
    // The caveat stays: an empty answer is the least self-explanatory one.
    expect(text()).toContain("Static import analysis. Runtime impact not verified.");
  });

  it("turns off again and leaves nothing behind", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(host.querySelector(".cf-blast-panel")).not.toBeNull();
    await press("Hide potential impact");
    expect(host.querySelector(".cf-blast-panel")).toBeNull();
    expect(useStore.getState().blastOn).toBe(false);
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it("is switched off by a new city, like every other view state", async () => {
    await show(<BlastRadiusBlock />);
    await press("Show potential impact");
    expect(useStore.getState().blastOn).toBe(true);
    await act(async () => useStore.getState().setCityData(probeCity()));
    expect(useStore.getState().blastOn).toBe(false);
  });
});
