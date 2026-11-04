import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLIT_PARTS,
  MAX_SPLIT_PARTS,
  MIN_SPLIT_PARTS,
  clampSplitParts,
  planRefactorSandbox,
} from "../src/city/refactorSandbox";
import { buildingHeight, syntheticComplexity } from "../src/city/mapping";
import { file } from "./helpers/cityFixture";
import type { FileConnection } from "../src/city/types";

/**
 * The sandbox's whole promise is that it is a HEURISTIC about a file that is
 * never touched. These cases judge the pure model, not the panel: three
 * actions, one deterministic result, a split clamp, explicit assumptions,
 * coupling read off the city's own edge list, and no write-back into the
 * payload a reader is looking at.
 */

const target = file("src/big.ts", "TypeScript", [], undefined, {
  id: "big",
  linesOfCode: 400,
  cyclomaticComplexity: 40,
  importCount: 8,
});

const connections: FileConnection[] = [
  { from: "login", to: "big", weight: 1 },
  { from: "session", to: "big", weight: 2 },
  { from: "big", to: "util", weight: 1 },
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("the sandbox model", () => {
  it("states its original metrics on the city's existing height rail", () => {
    const s = planRefactorSandbox(target, "split", { connections });
    expect(s.original.height).toBe(buildingHeight(target));
    expect(s.original.complexity).toBeCloseTo(syntheticComplexity(target), 12);
    expect(s.original.linesOfCode).toBe(400);
    expect(s.original.modules).toBe(1);
    expect(s.heuristic).toBe(true);
    expect(s.mutatesCity).toBe(false);
  });

  it("splits into two parts by default and adds one internal edge", () => {
    const s = planRefactorSandbox(target, "split", { connections });
    expect(s.parts).toBe(DEFAULT_SPLIT_PARTS);
    expect(s.ghosts).toHaveLength(2);
    expect(s.ghosts.every((g) => g.kind === "part")).toBe(true);
    expect(s.ghosts[0]!.linesOfCode + s.ghosts[1]!.linesOfCode).toBe(400);
    expect(s.edges).toEqual([{ from: "big#split-1", to: "big#split-2", kind: "internal" }]);
    expect(s.scenario.height).toBeLessThan(s.original.height);
    expect(s.scenario.complexity).toBeLessThan(s.original.complexity);
    expect(s.scenario.modules).toBe(2);
    expect(s.delta.height).toBeLessThan(0);
    expect(s.delta.modules).toBe(1);
  });

  it("clamps a split to the 2..4 parts the UI can offer", () => {
    expect(MIN_SPLIT_PARTS).toBe(2);
    expect(MAX_SPLIT_PARTS).toBe(4);
    expect(clampSplitParts(undefined)).toBe(2);
    expect(clampSplitParts(Number.NaN)).toBe(2);
    expect(clampSplitParts(1)).toBe(2);
    expect(clampSplitParts(9)).toBe(4);
    expect(clampSplitParts(2.9)).toBe(2);
    expect(planRefactorSandbox(target, "split", { parts: 9 }).parts).toBe(4);
    expect(planRefactorSandbox(target, "split", { parts: 3 }).ghosts).toHaveLength(3);
  });

  it("extracts one ghost module and one new edge, lowering height", () => {
    const s = planRefactorSandbox(target, "extract", { connections });
    expect(s.ghosts).toHaveLength(1);
    expect(s.ghosts[0]!.kind).toBe("extracted");
    expect(s.ghosts[0]!.linesOfCode).toBeGreaterThan(0);
    expect(s.ghosts[0]!.linesOfCode).toBeLessThan(target.linesOfCode);
    expect(s.edges).toEqual([{ from: "big", to: "big#extracted", kind: "extract" }]);
    expect(s.scenario.height).toBeLessThan(s.original.height);
    expect(s.scenario.complexity).toBeLessThan(s.original.complexity);
    expect(s.scenario.modules).toBe(2);
  });

  it("adds no height change for a test, only a coverage GOAL", () => {
    const s = planRefactorSandbox(target, "test", { connections });
    expect(s.ghosts).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.scenario).toEqual(s.original);
    expect(s.delta).toEqual({
      complexity: 0,
      height: 0,
      linesOfCode: 0,
      modules: 0,
    });
    expect(s.coverageGoal).toEqual({ targetPct: 80, measured: false });
    expect(s.assumptions).toContain("coverage-goal-not-measured");
    expect(s.assumptions).toContain("test-does-not-change-height");
  });

  it("reads importers from fileConnections and keeps external importers unchanged", () => {
    for (const action of ["split", "extract", "test"] as const) {
      const s = planRefactorSandbox(target, action, { connections });
      expect(s.coupling.importers).toBe(2);
      expect(s.coupling.externalImporters).toBe(2);
      expect(s.coupling.externalImportersUnchanged).toBe(true);
      expect(s.coupling.newEdges).toBe(s.edges.length);
    }
  });

  it("is deterministic for the same file, action, parts and connections", () => {
    const a = planRefactorSandbox(target, "split", { parts: 3, connections });
    const b = planRefactorSandbox(target, "split", { parts: 3, connections });
    expect(a).toEqual(b);
    expect(planRefactorSandbox(target, "extract", { connections })).toEqual(
      planRefactorSandbox(target, "extract", { connections }),
    );
  });

  it("mutates neither the CityFile nor the connection list", () => {
    const fileBefore = JSON.stringify(target);
    const connectionsBefore = JSON.stringify(connections);
    deepFreeze(target);
    deepFreeze(connections);
    for (const action of ["split", "extract", "test"] as const) {
      planRefactorSandbox(target, action, { parts: 3, connections });
    }
    expect(JSON.stringify(target)).toBe(fileBefore);
    expect(JSON.stringify(connections)).toBe(connectionsBefore);
  });

  it("always returns explicit assumptions, including that nothing was measured", () => {
    for (const action of ["split", "extract", "test"] as const) {
      const s = planRefactorSandbox(target, action, { connections });
      expect(s.assumptions).toContain("heuristic-not-measured");
      expect(s.assumptions).toContain("no-code-changed");
      expect(s.assumptions).toContain("external-importers-unchanged");
      expect(new Set(s.assumptions).size).toBe(s.assumptions.length);
    }
  });
});
