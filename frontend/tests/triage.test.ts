import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/stores/useStore";
import { findingKey } from "../src/reviews";
import type { CityData, CityFile } from "../src/city/types";

/** Minimal file fixture with a configurable findings list. */
function makeFile(id: string, path: string, severities: Array<"P0" | "P1" | "P2">): CityFile {
  return {
    id: `file:${id}`,
    name: id,
    path,
    language: "TypeScript",
    linesOfCode: 10,
    cyclomaticComplexity: 1,
    threatLevel: severities.includes("P0") ? "critical" : "low",
    findings: severities.map((severity, i) => ({
      type: `RULE_${i}`,
      severity,
      score: 9 - i,
      line: i + 1,
      code: "x",
      message: `finding ${i}`,
    })),
  };
}

/** Root city: src has a P0 + a P2, lib has a P1. */
function makeCity(): CityData {
  return {
    id: "triage-city",
    repo: { owner: "test", name: "repo", branch: "main", cloneUrl: "", analyzedAt: "" },
    languages: { TypeScript: 30 },
    totalFiles: 3,
    renderedFiles: 3,
    threatScore: 0,
    findingsBySeverity: { P0: 1, P1: 1, P2: 1 },
    tree: {
      name: "root",
      path: "",
      fileCount: 3,
      linesOfCode: 30,
      findingsBySeverity: { P0: 1, P1: 1, P2: 1 },
      children: [
        {
          name: "src",
          path: "src",
          fileCount: 2,
          linesOfCode: 20,
          findingsBySeverity: { P0: 1, P1: 0, P2: 1 },
          children: [],
          detailFiles: [
            makeFile("evil.ts", "src/evil.ts", ["P0", "P2"]),
            makeFile("odd.ts", "src/odd.ts", ["P2"]),
          ],
        },
        {
          name: "lib",
          path: "lib",
          fileCount: 1,
          linesOfCode: 10,
          findingsBySeverity: { P0: 0, P1: 1, P2: 0 },
          children: [],
          detailFiles: [makeFile("warn.ts", "lib/warn.ts", ["P1"])],
        },
      ],
      detailFiles: [],
      remainingFiles: 0,
      districtFiles: [],
    },
    fileConnections: [],
    dirConnections: [],
    meta: {},
  } as unknown as CityData;
}

describe("triage queue", () => {
  beforeEach(() => {
    useStore.getState().resetToLanding();
    useStore.getState().setCityData(makeCity());
    useStore.getState().setBuildPhase("built");
  });

  it("orders findings severity-first (P0 → P1 → P2) and flies to the first", () => {
    useStore.getState().startTriage();
    const s = useStore.getState();
    expect(s.triageActive).toBe(true);
    expect(s.triageTotal).toBe(4); // 1×P0 + 1×P1 + 2×P2
    expect(s.triageCursor).toBe(0);
    expect(s.focusedFindingKey).toBe(findingKey("file:evil.ts", 0));
    expect(s.selectedUnit).toEqual({ kind: "file", id: "file:evil.ts" });
  });

  it("steps forward and back within the queue", () => {
    const s = useStore.getState();
    s.startTriage();
    s.nextTriage();
    expect(useStore.getState().focusedFindingKey).toBe(findingKey("file:warn.ts", 0));
    s.prevTriage();
    expect(useStore.getState().focusedFindingKey).toBe(findingKey("file:evil.ts", 0));
  });

  it("does not run past the ends of the queue", () => {
    const s = useStore.getState();
    s.startTriage();
    for (let i = 0; i < 10; i++) s.nextTriage();
    expect(useStore.getState().triageCursor).toBe(3);
    for (let i = 0; i < 10; i++) s.prevTriage();
    expect(useStore.getState().triageCursor).toBe(0);
  });

  it("does not crash when filters shrink the queue below the cursor (regression)", () => {
    const s = useStore.getState();
    s.startTriage(); // 4 findings
    s.nextTriage();
    s.nextTriage();
    s.nextTriage(); // cursor = 3 (last)
    // Now shrink the queue: only the P0 survives this filter
    s.setThreatFilter("P0");
    // prev must clamp to the shrunken list instead of reading undefined
    expect(() => s.prevTriage()).not.toThrow();
    expect(useStore.getState().focusedFindingKey).toBe(findingKey("file:evil.ts", 0));
  });

  it("respects the rule filter and resets triage state on a new city", () => {
    const s = useStore.getState();
    s.setRuleFilter("RULE_0"); // every fixture file carries a RULE_0 finding
    s.startTriage();
    expect(useStore.getState().triageTotal).toBe(3);
    expect(useStore.getState().focusedFindingKey).toBe(findingKey("file:evil.ts", 0)); // P0 first
    s.endTriage();
    useStore.getState().setCityData(makeCity());
    const after = useStore.getState();
    expect(after.triageActive).toBe(false);
    expect(after.ruleFilter).toBeNull();
    expect(after.focusedFindingKey).toBeNull();
  });

  it("startTriage does nothing on a city without findings", () => {
    useStore.getState().setCityData({
      ...makeCity(),
      tree: {
        ...makeCity().tree,
        children: [],
        detailFiles: [makeFile("clean.ts", "clean.ts", [])],
        fileCount: 1,
      },
    } as unknown as CityData);
    useStore.getState().startTriage();
    expect(useStore.getState().triageActive).toBe(false);
  });
});

/**
 * Persona B, 2026-10-04: with a triage running, a filter switch left the
 * stepper reading "Finding 4 of 11" over a queue the panel called 3 — the
 * cursor and the total were only recomputed on the next click, so the first
 * entries of the new queue were skipped without anyone seeing it.
 */
describe("a filter switch inside a running triage", () => {
  beforeEach(() => {
    useStore.getState().resetToLanding();
    useStore.getState().setCityData(makeCity());
    useStore.getState().setBuildPhase("built");
  });

  it("re-anchors cursor and total at the moment the filter changes", () => {
    const s = useStore.getState();
    s.startTriage(); // P0 evil#0, P1 warn#0, P2 evil#1, P2 odd#0
    s.nextTriage();
    s.nextTriage();
    s.nextTriage(); // cursor 3 → src/odd.ts finding #0 (P2)
    expect(useStore.getState().triageTotal).toBe(4);

    s.setThreatFilter("P2");
    const after = useStore.getState();
    expect(after.triageTotal, "the queue is two P2 findings now").toBe(2);
    expect(after.triageCursor, "the focused P2 is the second of them").toBe(1);
    expect(after.focusedFindingKey).toBe(findingKey("file:odd.ts", 0));
  });

  it("does not move the camera when the focused finding survives the filter", () => {
    const s = useStore.getState();
    s.startTriage();
    s.nextTriage();
    s.nextTriage();
    s.nextTriage(); // on src/odd.ts (P2)
    const selectedBefore = JSON.stringify(useStore.getState().selectedUnit);
    s.setThreatFilter("P2");
    expect(JSON.stringify(useStore.getState().selectedUnit)).toBe(selectedBefore);
  });

  it("ends the triage instead of counting a queue that no longer exists", () => {
    const s = useStore.getState();
    s.startTriage();
    s.setRuleFilter("RULE_THAT_MATCHES_NOTHING");
    const after = useStore.getState();
    expect(after.triageActive).toBe(false);
    expect(after.triageTotal).toBe(0);
    expect(after.focusedFindingKey).toBeNull();
  });
});
