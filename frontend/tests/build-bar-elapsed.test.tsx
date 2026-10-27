// @vitest-environment jsdom
/**
 * Auftrag #31 — der Warteschritt des Erstlaufs hat einen Namen und eine Uhr.
 *
 * Gemessen am echten Lauf (Demo-Klick → Stadt, 1440×900): von der Sekunde an,
 * in der die Landing verschwindet, bis die Stadt steht, vergehen ~9 s, und die
 * Erstlauf-Zählung sah in diesem Fenster 0 benannte Flächen. Ein Grund war die
 * Sonde (zwei ihrer Selektoren existieren nicht mehr), der andere das Produkt:
 * der Baubalken hatte keine eigene Klasse und sagte keine Zahl für die Zeit, um
 * die er gerade bittet. Diese Datei hält beide Teile fest.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { HudOverlay } from "../src/components/HudOverlay";
import type { CityData } from "../src/city/types";

function probeCity(): CityData {
  return city({
    tree: dir({
      path: "",
      name: "repo",
      children: [
        dir({
          path: "src",
          name: "src",
          detailFiles: [file("src/a.ts", "TypeScript", [finding({ severity: "P0", line: 3 })])],
        }),
      ],
    }),
  });
}

let host: HTMLDivElement;
let root: Root;

function setState(patch: Partial<ReturnType<typeof useStore.getState>>) {
  act(() => useStore.setState(patch as never));
}

function renderHud() {
  act(() => root.render(createElement(HudOverlay)));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  setState({
    cityData: probeCity(),
    reviews: {},
    buildPhase: "constructing",
    buildStartedAt: Date.now() - 9_000,
    constructionDone: 7,
    constructionTotal: 36,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  useStore.setState(useStore.getInitialState(), true);
});

describe("the wait is a surface with a clock (#31)", () => {
  it("names the build bar so a first-run census can count it", () => {
    renderHud();
    const bar = host.querySelector(".build-bar");
    expect(
      bar,
      "der Baubalken hat keinen Namen — eine Zählung, die ihn nicht sieht, ist blind",
    ).not.toBeNull();
    expect(bar?.textContent).toContain("7/36");
  });

  it("says how long the build already takes, in the screen's language", () => {
    renderHud();
    expect(host.querySelector(".build-bar")?.textContent).toMatch(/elapsed 9 s/);
    setState({ prefs: { ...useStore.getInitialState().prefs, lang: "de" } });
    renderHud();
    expect(host.querySelector(".build-bar")?.textContent).toMatch(/seit 9 s/);
  });

  it("counts from the store's own stamp, not from a clock of its own", () => {
    setState({ buildStartedAt: Date.now() - 2_400 });
    renderHud();
    expect(host.querySelector(".build-bar")?.textContent).toMatch(/elapsed 2 s/);
  });

  it("is gone once the city stands", () => {
    setState({ buildPhase: "built" });
    renderHud();
    expect(host.querySelector(".build-bar")).toBeNull();
  });
});
