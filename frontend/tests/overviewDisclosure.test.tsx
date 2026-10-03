// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextCard } from "../src/components/ContextCard";
import { ScanSummary } from "../src/components/ScanSummary";
import { useStore } from "../src/stores/useStore";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * The overview panel is where a user decides whether the city is complete.
 * Three things it used to get wrong: one line figure that mixed code with
 * translation JSON, no word about what .gitignore kept out, and a district of
 * 92 files drawing 6 buildings without saying why.
 */

function file(path: string): CityFile {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 40,
    cyclomaticComplexity: 3,
    threatLevel: "safe",
    findings: [],
  };
}

const files = (dir: string, n: number): CityFile[] =>
  Array.from({ length: n }, (_, i) => file(`${dir}/f${i}.ts`));

function subDistrict(path: string, fileCount: number): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount,
    linesOfCode: fileCount * 40,
    codeLines: fileCount * 40,
    dataLines: 0,
    languages: { TypeScript: fileCount * 40 },
    dataLanguages: {},
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: files(path, Math.min(5, fileCount)),
    remainingFiles: Math.max(0, fileCount - Math.min(5, fileCount)),
    districtFiles: files(path, 6),
  };
}

/** The measured case book: 92 files, 249 code lines, 300 data lines. */
function cityData(overrides: Partial<CityData> = {}): CityData {
  const frontend: CityDir = {
    name: "frontend",
    path: "frontend",
    fileCount: 92,
    linesOfCode: 549,
    codeLines: 249,
    dataLines: 300,
    languages: { TypeScript: 134, PHP: 63, Shell: 45, SQL: 4, Terraform: 3 },
    dataLanguages: { JSON: 300 },
    findingsBySeverity: { P0: 4, P1: 3, P2: 0 },
    threatScore: 61,
    topFindings: [],
    children: [subDistrict("frontend/src", 60), subDistrict("frontend/tests", 26)],
    detailFiles: files("frontend", 6),
    remainingFiles: 0,
    districtFiles: files("frontend", 6),
  };
  const tree: CityDir = {
    ...frontend,
    name: "",
    path: "",
    fileCount: 92,
    detailFiles: [],
    districtFiles: [],
    children: [frontend],
  };
  return {
    repo: { owner: "local", name: "casebook", branch: "main" },
    totalFiles: 92,
    renderedFiles: 16,
    totalLines: 549,
    codeLines: 249,
    dataLines: 300,
    languages: tree.languages,
    dataLanguages: tree.dataLanguages,
    findingsBySeverity: tree.findingsBySeverity,
    skippedByGitignore: { files: 49, directories: 3 },
    limits: { skylineTowers: 6, buildingsPerDirectory: 35 },
    tree,
    fileConnections: [],
    dirConnections: [],
    meta: {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
    ...overrides,
  };
}

/** A city mapped before the split existed: one line figure, no provenance rows. */
function legacyCity(): CityData {
  const city = cityData();
  const {
    codeLines: _code,
    dataLines: _data,
    dataLanguages: _langs,
    skippedByGitignore: _skip,
    limits: _limits,
    ...rest
  } = city;
  const strip = (d: CityDir): CityDir => {
    const copy: CityDir = { ...d };
    delete copy.codeLines;
    delete copy.dataLines;
    delete copy.dataLanguages;
    copy.children = copy.children.map(strip);
    return copy;
  };
  return { ...rest, tree: strip(city.tree) };
}

let container: HTMLDivElement;
let root: Root;

async function show(
  component: ReactElement,
  city: CityData,
  focusPath: string[] = [],
): Promise<string> {
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: city,
      buildPhase: "built",
      focusPath,
      analysisId: "scan-1",
    },
    true,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(component));
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe("project overview", () => {
  it("separates the code lines from the data lines", async () => {
    const text = await show(<ContextCard />, cityData());
    expect(text).toContain("249");
    expect(text).toContain("300 lines of data (JSON)");
    expect(text).not.toContain("549");
    // the language bar is a share of code now: TypeScript is 54 % of 249,
    // not 24 % of the mixed 549
    expect(text).toContain("54%");
    expect(text).not.toContain("24%");
  });

  it("names what the project's own .gitignore kept out", async () => {
    const text = await show(<ContextCard />, cityData());
    expect(text).toContain("49 files and 3 folders kept out by .gitignore");
  });

  it("explains why a district of 92 files draws few buildings", async () => {
    const text = await show(<ContextCard />, cityData(), ["frontend"]);
    expect(text).toContain("District overview");
    expect(text).toContain("86 files live in 2 sub-districts");
    expect(text).toContain("each plot shows up to 6 of its most at-risk files");
  });

  it("explains a plaza whose files do not all fit on the plots", async () => {
    const city = cityData();
    city.tree.detailFiles = files("f", 35);
    city.tree.fileCount = 60;
    city.tree.remainingFiles = 25;
    city.tree.children = [];
    const text = await show(<ContextCard />, city);
    expect(text).toContain("35 of 60 files here stand as buildings");
    expect(text).toContain("podium");
  });

  it("says nothing about data or .gitignore for a city that never measured them", async () => {
    const text = await show(<ContextCard />, legacyCity());
    expect(text).toContain("549");
    expect(text).not.toContain("lines of data");
    expect(text).not.toContain(".gitignore");
  });

  it("counts one kept-out folder in the singular", async () => {
    const text = await show(
      <ContextCard />,
      cityData({ skippedByGitignore: { files: 3, directories: 1 } }),
    );
    expect(text).toContain("3 files and 1 folder kept out by .gitignore");
    expect(text).not.toContain("1 folders");
  });

  it("says how many findings come from test code", async () => {
    const city = cityData();
    city.findingsInTests = 3;
    city.tree.findingsInTests = 3;
    const text = await show(<ContextCard />, city);
    // 4 P0 + 3 P1 in the case book
    expect(text).toContain("3 of 7 findings were found in test code");
  });

  it("says nothing about test code when a folder has none", async () => {
    const text = await show(<ContextCard />, cityData());
    expect(text).not.toContain("test code");
  });
});

describe("scan summary", () => {
  it("reports the .gitignore exclusions the moment the city is declared done", async () => {
    const text = await show(<ScanSummary />, cityData());
    expect(text).toContain("92 files analyzed");
    expect(text).toContain("49 files and 3 folders kept out by .gitignore");
  });

  it("stays quiet when nothing was ignored", async () => {
    const text = await show(
      <ScanSummary />,
      cityData({ skippedByGitignore: { files: 0, directories: 0 } }),
    );
    expect(text).not.toContain(".gitignore");
  });
});
