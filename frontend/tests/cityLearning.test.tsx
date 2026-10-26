// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CityLearningGuide } from "../src/components/CityLearningGuide";
import { ContextCard } from "../src/components/ContextCard";
import { InfoPanel } from "../src/components/InfoPanel";
import { useStore } from "../src/stores/useStore";
import { city, dir, file, finding, provenance } from "./helpers/cityFixture";
import type { CityData, CityDir, CityFile, CityFinding } from "../src/city/types";

/**
 * The payloads here go through `helpers/cityFixture`; what this file declares
 * itself is the two buildings the guide points at and the finding ids its
 * assertions quote (`source#0`, `source#1`). The finding carries no category —
 * a `regex` console note the scanner never classified — so no district here
 * claims a kind of mistake.
 */
const consoleUsage = (over: Partial<CityFinding> = {}): CityFinding =>
  finding({
    type: "CONSOLE_USAGE",
    severity: "P1",
    line: 8,
    message: "Check console usage",
    ruleId: "sample",
    provenance: "regex",
    category: undefined,
    ...over,
  });

const source: CityFile = file("src/index.ts", "TypeScript", [consoleUsage()], undefined, {
  id: "source",
  linesOfCode: 80,
  cyclomaticComplexity: 12,
});
const testFile: CityFile = file(
  "tests/fixture.test.ts",
  "TypeScript",
  [consoleUsage()],
  undefined,
  {
    id: "test",
    role: "test",
    linesOfCode: 80,
    cyclomaticComplexity: 24,
  },
);
function district(name: string, files: CityFile[], fileCount = files.length): CityDir {
  return dir({ path: name, fileCount, detailFiles: files, districtFiles: files });
}
function learningCity(): CityData {
  return city({
    repo: { owner: "local", name: "learning", branch: "main" },
    totalFiles: 42,
    renderedFiles: 2,
    totalLines: 160,
    languages: { TypeScript: 160 },
    findingsBySeverity: { P0: 0, P1: 2, P2: 0 },
    scanProvenance: provenance(),
    tree: dir({
      path: "",
      fileCount: 42,
      children: [district("src", [source], 40), district("tests", [testFile], 2)],
    }),
  });
}
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    void Promise.resolve().then(() => callback(0));
    return 1;
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  useStore.setState(
    {
      ...useStore.getInitialState(),
      cityData: learningCity(),
      buildPhase: "built",
      analysisId: "learning",
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
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function openGuide() {
  await act(async () => host.querySelector<HTMLElement>(".city-learning summary")!.click());
}

describe("learning from the actual city", () => {
  it("keeps the guide closed until requested and opens the largest real subfolder", async () => {
    await show(<CityLearningGuide />);
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.textContent).toContain("src (40 files)");
    await openGuide();
    await press("Explore this district");
    expect(useStore.getState().focusPath).toEqual(["src"]);
    expect(document.activeElement).toBe(host.querySelector(".city-learning summary"));
  });

  it("opens real evidence with the existing source-focus channel, prioritizing shipped code over test fixtures", async () => {
    await show(<CityLearningGuide />);
    await openGuide();
    await press("Evidence");
    await press("Open a finding and its evidence");
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: source.id });
    expect(useStore.getState().focusedFindingKey).toBe("source#0");
    expect(useStore.getState().focusPath).toEqual(["src"]);
  });

  it("explains test and demo evidence without inventing a production risk", async () => {
    const data = learningCity();
    data.scanProvenance = { regex: false, gitleaks: false, semgrep: false };
    useStore.setState({ cityData: data, focusPath: ["tests"] });
    await show(<CityLearningGuide />);
    await openGuide();
    await press("Evidence");
    expect(host.textContent).toContain("No real scan ran");
    // N-05: the disclaimer has to cover the folders, not only the numbers. The
    // demo ships a `mobile/` district, and a findings-only sentence left a
    // reader free to read that district as a platform claim.
    expect(host.textContent).toContain("invented example project");
    expect(host.textContent).toContain("This example is in test code");
  });

  it("focuses the most severe finding in the chosen file rather than assuming the first row is highest", async () => {
    const data = learningCity();
    data.tree.children[0]!.detailFiles[0] = {
      ...source,
      findings: [
        { ...source.findings[0]!, severity: "P2" },
        { ...source.findings[0]!, severity: "P0", line: 12 },
      ],
    };
    useStore.setState({ cityData: data });
    await show(<CityLearningGuide />);
    await openGuide();
    await press("Evidence");
    await press("Open a finding and its evidence");
    expect(useStore.getState().focusedFindingKey).toBe("source#1");
  });

  it("moves keyboard focus from the learning rail to the opened file and restores it on close", async () => {
    await show(
      <>
        <ContextCard />
        <InfoPanel />
      </>,
    );
    await openGuide();
    await press("Shape");
    const inspect = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Inspect this building"),
    )!;
    inspect.focus();
    await act(async () => inspect.click());
    const close = host.querySelector<HTMLButtonElement>(".panel-info .btn-danger")!;
    expect(document.activeElement).toBe(close);
    await act(async () => close.click());
    expect(document.activeElement).toBe(inspect);
  });

  it("has useful empty-project guidance and no invented example action", async () => {
    const data = learningCity();
    data.tree = district("", []);
    data.totalFiles = 0;
    useStore.setState({ cityData: data });
    await show(<CityLearningGuide />);
    expect(host.textContent).toContain("No files were mapped");
    expect(host.textContent).not.toContain("Explore this district");
    await openGuide();
    await press("Evidence");
    expect(host.textContent).toContain("does not prove the code is error-free");
    expect(host.textContent).not.toContain("Open a finding and its evidence");
  });

  it("keeps a 1,000-file level behind the same user-controlled disclosure", async () => {
    const data = learningCity();
    data.tree.fileCount = data.totalFiles = 1000;
    data.tree.children[0]!.fileCount = 998;
    useStore.setState({ cityData: data });
    await show(<CityLearningGuide />);
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.textContent).toContain("src (998 files)");
    expect(host.querySelectorAll(".city-learning-steps button")).toHaveLength(3);
  });

  it("keeps no-findings context neutral when coverage is missing", async () => {
    const data = learningCity();
    data.tree = district("", []);
    data.findingsBySeverity = { P0: 0, P1: 0, P2: 0 };
    data.scanProvenance = undefined;
    useStore.setState({ cityData: data });
    await show(<ContextCard />);
    expect(host.querySelector("[data-context-verdict]")?.getAttribute("data-context-verdict")).toBe(
      "unchecked",
    );
    expect(host.textContent).toContain("scan coverage is incomplete or unknown");
  });

  it("offers explicit return paths from a file to its district and the whole project", async () => {
    useStore.setState({ selectedUnit: { kind: "file", id: source.id }, focusPath: ["src"] });
    await show(<InfoPanel />);
    await press("Back to district view");
    expect(useStore.getState().selectedUnit).toBeNull();
    expect(useStore.getState().focusPath).toEqual(["src"]);
    useStore.setState({ selectedUnit: { kind: "file", id: source.id } });
    await act(async () => {});
    await press("Project overview");
    expect(useStore.getState().focusPath).toEqual([]);
    expect(useStore.getState().selectedUnit).toBeNull();
  });
});
