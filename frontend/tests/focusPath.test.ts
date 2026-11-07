import { describe, it, expect } from "vitest";
import { planFocusPath, visibleFocusPath } from "../src/city/focusPath";
import type { FileConnection } from "../src/city/types";

const edge = (from: string, to: string): FileConnection => ({ from, to, weight: 1 });

describe("planFocusPath", () => {
  it("follows imports in the shipped direction, entry first", () => {
    const plan = planFocusPath(["entry"], "target", [
      edge("entry", "app"),
      edge("app", "target"),
      edge("target", "unrelated"),
    ]);
    expect(plan?.nodes).toEqual(["entry", "app", "target"]);
    expect(plan?.edges).toEqual([
      { from: "entry", to: "app" },
      { from: "app", to: "target" },
    ]);
  });

  it("does not walk an import edge backwards", () => {
    expect(planFocusPath(["entry"], "target", [edge("target", "entry")])).toBeNull();
  });

  it("takes the shortest chain, not the first edge in the payload", () => {
    const plan = planFocusPath(["entry"], "target", [
      edge("entry", "long-a"),
      edge("long-a", "long-b"),
      edge("long-b", "target"),
      edge("entry", "short-a"),
      edge("short-a", "target"),
    ]);
    expect(plan?.nodes).toEqual(["entry", "short-a", "target"]);
  });

  it("is deterministic when two chains have the same length", () => {
    const connections = [
      edge("entry", "b"),
      edge("b", "target"),
      edge("entry", "a"),
      edge("a", "target"),
    ];
    const first = planFocusPath(["entry"], "target", connections);
    const second = planFocusPath(["entry"], "target", [...connections].reverse());
    expect(first?.nodes).toEqual(["entry", "a", "target"]);
    expect(second?.nodes).toEqual(first?.nodes);
  });

  it("picks the deterministic entry when several entries can reach the target", () => {
    const plan = planFocusPath(["z-entry", "a-entry"], "target", [
      edge("z-entry", "target"),
      edge("a-entry", "target"),
    ]);
    expect(plan?.entry).toBe("a-entry");
  });

  it("returns null without an entry, a target, or a proven chain", () => {
    expect(planFocusPath([], "target", [edge("entry", "target")])).toBeNull();
    expect(planFocusPath(["entry"], null, [edge("entry", "target")])).toBeNull();
    expect(planFocusPath(["entry"], "target", [edge("entry", "other")])).toBeNull();
  });

  it("returns the selection alone when the selection IS the entry", () => {
    const plan = planFocusPath(["entry"], "entry", [edge("entry", "target")]);
    expect(plan).toMatchObject({ entry: "entry", target: "entry", nodes: ["entry"], edges: [] });
  });
});

describe("visibleFocusPath", () => {
  const full = planFocusPath(["entry"], "target", [edge("entry", "app"), edge("app", "target")])!;

  it("keeps the whole chain when every hop is drawn", () => {
    const visible = visibleFocusPath(full, new Set(["entry", "app", "target"]));
    expect(visible?.nodes).toEqual(["entry", "app", "target"]);
    expect(visible?.edges).toHaveLength(2);
  });

  it("draws only the contiguous suffix that ends at the selected file", () => {
    const visible = visibleFocusPath(full, new Set(["app", "target"]));
    expect(visible?.nodes).toEqual(["app", "target"]);
    expect(visible?.edges).toEqual([{ from: "app", to: "target" }]);
    expect(visible?.entry).toBe("app");
  });

  it("never jumps over an undrawn hop to keep a longer line", () => {
    expect(visibleFocusPath(full, new Set(["entry", "target"]))).toBeNull();
  });

  it("returns null when the selection is not drawn on this level", () => {
    expect(visibleFocusPath(full, new Set(["entry", "app"]))).toBeNull();
  });

  it("returns null for a zero-hop chain", () => {
    const alone = planFocusPath(["entry"], "entry", [edge("entry", "target")])!;
    expect(visibleFocusPath(alone, new Set(["entry"]))).toBeNull();
  });
});
