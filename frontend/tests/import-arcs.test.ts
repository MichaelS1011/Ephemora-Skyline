import { describe, it, expect } from "vitest";
import {
  planImportArcs,
  FILE_ARCS_MAX,
  type ArcAnchor,
  type ImportArc,
} from "../src/city/importArcs";

/**
 * Feature 001's acceptance rules, measured where they are actually decided.
 *
 * The brief asked for six proofs about a line in a 3D city. Rendering a tube is
 * three.js's job and proves nothing about correctness; every rule the brief
 * states — which edges become arcs, which building they may touch, which one
 * carries the label — is a decision, and the decision lives in `planImportArcs`.
 * These tests read that function, not a mock of what it ought to return.
 */

const anchor = (id: string, x: number, z: number, over: Partial<ArcAnchor> = {}): ArcAnchor => ({
  x,
  y: 4,
  z,
  name: `${id}.ts`,
  path: `src/${id}.ts`,
  ...over,
});

/** Four buildings on four separate plots. */
const ROOFS = new Map<string, ArcAnchor>([
  ["a", anchor("a", 0, 0)],
  ["b", anchor("b", 10, 0)],
  ["c", anchor("c", 0, 10)],
  ["d", anchor("d", 10, 10)],
] as const);

const edge = (from: string, to: string, weight = 1) => ({ from, to, weight });

/** The arc the plan is claimed to draw — and nothing else is allowed to answer. */
const only = (arcs: ImportArc[]): ImportArc => {
  expect(arcs).toHaveLength(1);
  return arcs[0] as ImportArc;
};

describe("Regel 2 — nothing is invented", () => {
  it("draws no arc while nothing is selected", () => {
    const edges = [edge("a", "b"), edge("a", "c")];
    expect(planImportArcs(edges, ROOFS, null)).toEqual([]);
    expect(planImportArcs(edges, ROOFS, null).length).toBe(0);
  });

  it("draws no arc for a building with no import relationship", () => {
    expect(planImportArcs([edge("b", "c")], ROOFS, "a")).toEqual([]);
  });

  it("draws no arc to a file that is not a building here", () => {
    // A real edge whose far end lives in another district — the payload ships
    // it, this layout does not draw it. Pointing it at some other roof would
    // be the one failure mode a reader could never catch.
    const arcs = planImportArcs([edge("a", "z")], ROOFS, "a");
    expect(arcs).toEqual([]);
  });

  it("draws no arc between two files sharing one plot", () => {
    const same = new Map<string, ArcAnchor>([
      ["a", anchor("a", 5, 5)],
      ["b", anchor("b", 5, 5, { y: 9 })],
    ]);
    expect(planImportArcs([edge("a", "b")], same, "a")).toEqual([]);
  });
});

describe("Regel 1 — the arc that is drawn is the arc that is true", () => {
  it("connects the two buildings the edge names, at their own roofs", () => {
    const arc = only(planImportArcs([edge("a", "b")], ROOFS, "a"));
    expect(arc.start).toBe(ROOFS.get("a"));
    expect(arc.end).toBe(ROOFS.get("b"));
  });

  it("keeps every real relationship of the selection — none is dropped", () => {
    const edges = [edge("a", "b"), edge("c", "a"), edge("a", "d"), edge("b", "c")];
    const arcs = planImportArcs(edges, ROOFS, "a");
    expect(arcs.map((x) => `${x.from}>${x.to}`).sort()).toEqual(["a>b", "a>d", "c>a"]);
  });

  it("lifts the apex above both roofs and centres it between them", () => {
    const arc = only(planImportArcs([edge("a", "b")], ROOFS, "a"));
    expect(arc.apex.x).toBe(5);
    expect(arc.apex.z).toBe(0);
    expect(arc.apex.y).toBeGreaterThan(arc.start.y);
    expect(arc.apex.y).toBeGreaterThan(arc.end.y);
  });

  it("caps the drawn set at the budget it publishes", () => {
    const many = Array.from({ length: FILE_ARCS_MAX + 30 }, (_, i) => edge("a", `b${i}`));
    const roofs = new Map<string, ArcAnchor>([["a", anchor("a", 0, 0)]]);
    for (let i = 0; i < FILE_ARCS_MAX + 30; i++) roofs.set(`b${i}`, anchor(`b${i}`, i + 1, 5));
    expect(planImportArcs(many, roofs, "a")).toHaveLength(FILE_ARCS_MAX);
  });
});

describe("Richtung — the arrow says who imports whom", () => {
  it("calls an edge leaving the selection outgoing and one arriving incoming", () => {
    const arcs = planImportArcs([edge("a", "b"), edge("c", "a")], ROOFS, "a");
    expect(arcs.find((x) => x.to === "b")?.direction).toBe("out");
    expect(arcs.find((x) => x.from === "c")?.direction).toBe("in");
  });

  it("names the importer first whichever end was selected", () => {
    // The label reads `start → end`. Selecting the imported file must not turn
    // the sentence around: b imports a, whichever of the two the reader clicked.
    const sameEdgeFromImporter = only(planImportArcs([edge("b", "a")], ROOFS, "b"));
    const sameEdgeFromImported = only(planImportArcs([edge("b", "a")], ROOFS, "a"));
    expect(sameEdgeFromImporter.start.name).toBe("b.ts");
    expect(sameEdgeFromImporter.end.name).toBe("a.ts");
    expect(sameEdgeFromImported.start.name).toBe("b.ts");
    expect(sameEdgeFromImported.end.name).toBe("a.ts");
    expect(sameEdgeFromImported.direction).toBe("in");
  });
});

describe("Regel 3 — the selection moves, the picture follows", () => {
  const edges = [edge("a", "b", 2), edge("b", "c", 5)];

  it("leaves nothing behind when the selection is dropped", () => {
    expect(planImportArcs(edges, ROOFS, null)).toEqual([]);
  });

  it("carries only the new building's edges when the selection changes", () => {
    const onA = planImportArcs(edges, ROOFS, "a");
    const onB = planImportArcs(edges, ROOFS, "b");
    expect(onA.map((x) => `${x.from}>${x.to}`)).toEqual(["a>b"]);
    expect(onB.map((x) => `${x.from}>${x.to}`).sort()).toEqual(["a>b", "b>c"]);
    // a>b is the same real edge seen from the other end: incoming now, not outgoing
    expect((onA[0] as ImportArc).direction).toBe("out");
    expect(onB.find((x) => x.from === "a")?.direction).toBe("in");
  });
});

describe("Hervorhebung — exactly one arc is the one you read", () => {
  it("labels one arc and no more", () => {
    const arcs = planImportArcs([edge("a", "b"), edge("a", "c"), edge("d", "a")], ROOFS, "a");
    expect(arcs.filter((x) => x.emphasized)).toHaveLength(1);
  });

  it("picks the heaviest relationship", () => {
    const arcs = planImportArcs(
      [edge("a", "b", 1), edge("a", "c", 7), edge("d", "a", 3)],
      ROOFS,
      "a",
    );
    expect(arcs.find((x) => x.emphasized)?.to).toBe("c");
  });

  it("picks the same arc whatever order the payload arrives in", () => {
    const edges = [edge("a", "b", 4), edge("a", "c", 4)];
    const forwards = planImportArcs(edges, ROOFS, "a");
    const backwards = planImportArcs([...edges].reverse(), ROOFS, "a");
    expect(forwards.find((x) => x.emphasized)?.to).toBe(backwards.find((x) => x.emphasized)?.to);
    expect(forwards.find((x) => x.emphasized)?.to).toBe("b"); // src/b sorts before src/c
  });

  it("labels nothing when there is nothing to label", () => {
    expect(planImportArcs([], ROOFS, "a")).toEqual([]);
  });
});
