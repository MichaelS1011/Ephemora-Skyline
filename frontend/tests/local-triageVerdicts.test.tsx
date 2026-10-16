// @vitest-environment jsdom
// A verdict is a finished decision. Before this, the triage queue walked every
// finding of the city regardless of what the user had already judged, and said
// only "n / total" — so the second round through the same folder re-asked
// questions that were answered, and nothing on screen said how much was left.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { nextOpenTriageIndex, openTriageCount, triageList, useStore } from "../src/stores/useStore";
import { reviewKeyFor } from "../src/reviews";
import { ActionBar } from "../src/components/ActionBar";
import type { CityData, CityFile } from "../src/city/types";

function makeFile(id: string, path: string, rules: string[]): CityFile {
  return {
    id: `file:${id}`,
    name: id,
    path,
    language: "TypeScript",
    linesOfCode: 10,
    cyclomaticComplexity: 1,
    threatLevel: "medium",
    findings: rules.map((type, i) => ({
      type,
      ruleId: type,
      severity: i === 0 ? ("P0" as const) : ("P2" as const),
      line: i + 1,
      code: "x",
      message: `finding ${type}`,
    })),
  };
}

function makeCity(files: CityFile[]): CityData {
  const p0 = files.reduce((n, f) => n + f.findings.filter((x) => x.severity === "P0").length, 0);
  const p2 = files.reduce((n, f) => n + f.findings.filter((x) => x.severity === "P2").length, 0);
  return {
    repo: { owner: "test", name: "repo", branch: "main" },
    analysisId: "scan-1",
    languages: { TypeScript: 10 * files.length },
    totalFiles: files.length,
    renderedFiles: files.length,
    threatScore: 1,
    findingsBySeverity: { P0: p0, P1: 0, P2: p2 },
    fileConnections: [],
    dirConnections: [],
    meta: {},
    tree: {
      name: "root",
      path: "",
      fileCount: files.length,
      linesOfCode: 10 * files.length,
      findingsBySeverity: { P0: p0, P1: 0, P2: p2 },
      children: [],
      detailFiles: files,
      remainingFiles: 0,
      districtFiles: [],
    },
  } as unknown as CityData;
}

const files = [
  makeFile("a.ts", "a.ts", ["ALPHA", "SHARED"]),
  makeFile("b.ts", "b.ts", ["BETA", "SHARED"]),
  makeFile("c.ts", "c.ts", ["GAMMA"]),
];
const city = makeCity(files);

/** The key a verdict for one queue entry is stored under. */
const keyOf = (entry: ReturnType<typeof triageList>[number]): string =>
  reviewKeyFor(entry.file, entry.index, entry.file.findings[entry.index]);

let queue: ReturnType<typeof triageList>;
beforeEach(() => {
  useStore.setState({ ...useStore.getInitialState(), cityData: city, buildPhase: "built" }, true);
  queue = triageList(city, "all", null);
});

describe("the queue walks the findings that still need a verdict", () => {
  it("has one entry per finding and none of them judged at the start", () => {
    expect(queue.map((e) => `${e.file.id}#${e.index}`)).toEqual([
      "file:a.ts#0",
      "file:b.ts#0",
      "file:c.ts#0",
      "file:a.ts#1",
      "file:b.ts#1",
    ]);
    expect(openTriageCount(queue, {})).toBe(5);
  });

  it("opens the round on the first finding without a verdict", () => {
    useStore.setState({
      reviews: { [keyOf(queue[0]!)]: "reviewed", [keyOf(queue[1]!)]: "false-positive" },
    });
    useStore.getState().startTriage();
    const s = useStore.getState();
    expect(s.triageCursor).toBe(2);
    expect(s.focusedFindingKey).toBe(`${queue[2]!.file.id}#${queue[2]!.index}`);
    expect(s.triageTotal).toBe(5);
  });

  it("steps past judged findings instead of asking twice", () => {
    useStore.setState({ reviews: { [keyOf(queue[2]!)]: "to-fix" } });
    useStore.getState().startTriage();
    expect(useStore.getState().triageCursor).toBe(0);
    useStore.getState().nextTriage();
    expect(useStore.getState().triageCursor).toBe(1);
    useStore.getState().nextTriage();
    // queue[2] carries a verdict — the step lands on the next one instead
    expect(useStore.getState().triageCursor).toBe(3);
    useStore.getState().prevTriage();
    expect(useStore.getState().triageCursor).toBe(1);
  });

  it("stays put when nothing is left in that direction", () => {
    // the first three are decided, the last two are not
    useStore.setState({
      reviews: Object.fromEntries(queue.slice(0, 3).map((e) => [keyOf(e), "reviewed" as const])),
    });
    useStore.getState().startTriage();
    expect(useStore.getState().triageCursor).toBe(3);
    useStore.getState().nextTriage();
    expect(useStore.getState().triageCursor).toBe(4);
    useStore.getState().nextTriage();
    expect(useStore.getState().triageCursor).toBe(4);
  });

  it("still opens entry zero when every finding is already judged", () => {
    useStore.setState({ reviews: Object.fromEntries(queue.map((e) => [keyOf(e), "reviewed"])) });
    useStore.getState().startTriage();
    expect(useStore.getState().triageActive).toBe(true);
    expect(useStore.getState().triageCursor).toBe(0);
    expect(openTriageCount(queue, useStore.getState().reviews)).toBe(0);
  });

  it("reports nothing ahead once the open entries are behind the cursor", () => {
    useStore.setState({ reviews: { [keyOf(queue[4]!)]: "reviewed" } });
    expect(nextOpenTriageIndex(queue, useStore.getState().reviews, 4, 1)).toBe(-1);
    expect(nextOpenTriageIndex(queue, useStore.getState().reviews, 4, -1)).toBe(3);
  });

  it("counts open findings per filter, so the number matches the queue", () => {
    useStore.setState({ reviews: { [keyOf(queue[0]!)]: "reviewed" } });
    expect(openTriageCount(triageList(city, "P0", null), useStore.getState().reviews)).toBe(2);
    expect(openTriageCount(triageList(city, "all", "SHARED"), useStore.getState().reviews)).toBe(2);
  });
});

describe("the dock states how much of the round is left", () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (needle: string): HTMLElement | undefined =>
    Array.from(container.querySelectorAll("button, span")).find((e) =>
      (e.textContent ?? "").includes(needle),
    ) as HTMLElement | undefined;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows the open count before the queue is opened, and drops it as verdicts land", async () => {
    await act(async () => root.render(<ActionBar />));
    expect(text("5 findings")?.textContent).toContain("5 findings");
    await act(async () => useStore.getState().setReview(keyOf(queue[0]!), "reviewed"));
    expect(text("4 findings")?.textContent).toContain("4 findings");
    expect(text("5 findings")).toBeUndefined();
  });

  it("says so when the folder holds nothing left to judge", async () => {
    useStore.setState({ reviews: Object.fromEntries(queue.map((e) => [keyOf(e), "reviewed"])) });
    await act(async () => root.render(<ActionBar />));
    expect(text("0 findings")?.textContent).toContain("0 findings");
  });

  it("disables the step that has no unjudged finding in it", async () => {
    // queue[2] is decided; everything else is open.
    useStore.setState({ reviews: { [keyOf(queue[2]!)]: "reviewed" } });
    await act(async () => {
      useStore.setState({ triageActive: true, triageCursor: 1, triageTotal: queue.length });
    });
    await act(async () => root.render(<ActionBar />));
    const next = text("Next") as HTMLButtonElement;
    const prev = text("Prev") as HTMLButtonElement;
    // aria-disabled: the reason the step is empty is in a title, and a
    // disabled button is never hovered — the explanation has to stay reachable.
    expect(next.getAttribute("aria-disabled")).toBe("false");
    expect(prev.getAttribute("aria-disabled")).toBe("false");
    // past the last entry there is nothing to step to
    await act(async () => useStore.setState({ triageCursor: queue.length - 1 }));
    expect(text("Next")!.getAttribute("aria-disabled")).toBe("true");
    expect(text("Prev")!.getAttribute("aria-disabled")).toBe("false");
  });
});
