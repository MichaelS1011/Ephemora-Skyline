// @vitest-environment jsdom
// Item 9 (launch-bar T4): the overview map said "critical lives here" with one
// colour against another — measured 1,54:1 on a 190 px plate, no symbol, no
// word. The picture now puts a wedge in the corner of an alarm plot and the
// line under it names the count; this file pins that the count is the same
// number the plate drew, in both languages.
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Minimap } from "../src/components/Minimap";
import { useStore } from "../src/stores/useStore";
import { t, type Lang } from "../src/i18n";
import type { CityData, CityDir, CityFile } from "../src/city/types";

const REPO = path.resolve(import.meta.dirname, "../..");

function file(path: string, p0: number): CityFile {
  return {
    id: `f-${path}`,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 30,
    cyclomaticComplexity: 2,
    threatLevel: p0 > 0 ? "critical" : "safe",
    findings: Array.from({ length: p0 }, () => ({ severity: "P0", line: 2, message: "crit" })),
  } as unknown as CityFile;
}

function dir(path: string, p0: number): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: 1,
    linesOfCode: 30,
    languages: { TypeScript: 30 },
    findingsBySeverity: { P0: p0, P1: 0, P2: 0 },
    threatScore: p0 * 10,
    topFindings: [],
    children: [],
    detailFiles: [file(`${path}/a.ts`, p0)],
    remainingFiles: 0,
    districtFiles: [],
  } as unknown as CityDir;
}

const city = (dirs: CityDir[]): CityData =>
  ({
    repo: { owner: "local", name: "probe", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 30 },
    totalFiles: dirs.length,
    renderedFiles: dirs.length,
    findingsBySeverity: dirs.reduce(
      (acc, d) => ({
        P0: acc.P0 + d.findingsBySeverity.P0,
        P1: acc.P1 + d.findingsBySeverity.P1,
        P2: acc.P2 + d.findingsBySeverity.P2,
      }),
      { P0: 0, P1: 0, P2: 0 },
    ),
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: {
      name: "probe",
      path: "",
      fileCount: dirs.length,
      linesOfCode: 30 * dirs.length,
      languages: { TypeScript: 30 * dirs.length },
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      threatScore: 0,
      topFindings: [],
      children: dirs,
      detailFiles: [],
      remainingFiles: 0,
      districtFiles: [],
    },
  }) as unknown as CityData;

let container: HTMLDivElement;
let root: Root;

async function map(dirs: CityDir[], lang: Lang): Promise<void> {
  if (root) await act(async () => root.unmount());
  container = document.createElement("div");
  document.body.append(container);
  useStore.setState(
    {
      ...useStore.getInitialState(),
      prefs: { ...useStore.getInitialState().prefs, lang },
      cityData: city(dirs),
      buildPhase: "built",
    },
    true,
  );
  root = createRoot(container);
  await act(async () => root.render(createElement(Minimap, { show: true })));
}

const line = (): Element | null => container.querySelector("[data-minimap-alarm]");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("die Übersichtskarte sagt ihr Urteil auch ohne Farbe", () => {
  it("counts the alarm plots it marked", async () => {
    await map([dir("src/a", 1), dir("src/b", 0), dir("src/c", 2)], "de");
    expect(line(), "the map shows no count line").toBeTruthy();
    expect(line()!.textContent).toBe("▲ 2 von 3 Plätzen mit einem kritischen Fund");
    expect(line()!.getAttribute("data-minimap-alarm")).toBe("2");
  });

  it("bends the verb to one plot", async () => {
    await map([dir("src/a", 1), dir("src/b", 0)], "de");
    expect(line()!.textContent).toBe("▲ 1 von 2 Plätzen trägt einen kritischen Fund");
    await map([dir("src/a", 1), dir("src/b", 0)], "en");
    expect(line()!.textContent).toBe("▲ 1 of 2 plots carries a critical finding");
  });

  it("says none where none are marked, instead of staying quiet", async () => {
    await map([dir("src/a", 0), dir("src/b", 0)], "de");
    expect(line()!.textContent).toBe("▲ kein Platz mit einem kritischen Fund");
    expect(line()!.getAttribute("data-minimap-alarm")).toBe("0");
  });

  it("is a status line, so the count is announced when the level changes", async () => {
    await map([dir("src/a", 1)], "de");
    expect(line()!.getAttribute("role")).toBe("status");
    // the same city, one level deeper: the line follows the plate
    await map([dir("src/a/deep", 0), dir("src/b/deep", 0)], "de");
    expect(line()!.textContent).toBe("▲ kein Platz mit einem kritischen Fund");
  });

  /**
   * The plate fills a corner triangle in the alarm colour for exactly the plots
   * this line counts. One carrier must not contradict the other, so both read
   * the same predicate.
   */
  it("marks the wedge on the same plots it counts", () => {
    const source = readFileSync(path.join(REPO, "frontend/src/components/Minimap.tsx"), "utf-8");
    const draw = source.slice(
      source.indexOf("// blocks with their skyline towers") - 1400,
      source.indexOf("// representative skyline towers"),
    );
    expect(draw).toContain("const alarm = b.dir.findingsBySeverity.P0 > 0;");
    expect(draw).toContain("if (alarm) {");
    const count = source.slice(source.indexOf("const alarmPlots"), source.indexOf("return ("));
    expect(count).toContain("b.dir.findingsBySeverity.P0 > 0");
    expect(t("de", "minimap.alarm")).toContain("▲");
    expect(t("en", "minimap.alarmOne")).toContain("{n} of {total}");
  });
});
