import { describe, it, expect } from "vitest";
import { computeFocusTiers } from "../src/city/focus";
import type { FileConnection } from "../src/city/types";

/**
 * Fixture: 7 files. The selection lives in district "d1" together with the
 * two same-district files; two direct dependency partners and two files far
 * away (d3) round the tiers off.
 */
function files(): Array<{ id: string; path: string }> {
  return [
    { id: "sel", path: "d1/sel.ts" },
    { id: "dep1", path: "d2/dep1.ts" },
    { id: "dep2", path: "d2/dep2.ts" },
    { id: "same1", path: "d1/same1.ts" },
    { id: "same2", path: "d1/same2.ts" },
    { id: "far1", path: "d3/far1.ts" },
    { id: "far2", path: "d3/far2.ts" },
  ];
}

function connections(): FileConnection[] {
  return [
    { from: "sel", to: "dep1", weight: 3 },
    // dep2 imports sel — the REVERSE direction, must still count as a
    // direct dependency (connections are read both ways)
    { from: "dep2", to: "sel", weight: 1 },
    // unrelated edge between two non-selected files must not affect tiers
    { from: "far1", to: "far2", weight: 2 },
  ];
}

/** District = first path segment, mirroring the plaza's constant district. */
function districtOf(fileId: string): string {
  const f = files().find((x) => x.id === fileId);
  return f ? f.path.split("/")[0]! : "";
}

describe("computeFocusTiers", () => {
  it("assigns tier 0 to the selection, 1 to direct deps, 2 to same district, 3 to the rest", () => {
    const tiers = computeFocusTiers("sel", files(), connections(), districtOf);
    expect(tiers.size).toBe(7);
    expect(tiers.get("sel")).toBe(0);
    expect(tiers.get("dep1")).toBe(1);
    expect(tiers.get("dep2")).toBe(1);
    expect(tiers.get("same1")).toBe(2);
    expect(tiers.get("same2")).toBe(2);
    expect(tiers.get("far1")).toBe(3);
    expect(tiers.get("far2")).toBe(3);
  });

  it("detects connections in both directions", () => {
    // Only an incoming edge (dep2 → sel) — dep2 must still be tier 1
    const tiers = computeFocusTiers(
      "sel",
      files(),
      [{ from: "dep2", to: "sel", weight: 1 }],
      districtOf,
    );
    expect(tiers.get("dep2")).toBe(1);
    // dep1 sits in district d2 and has no edge — it falls to the rest (3)
    expect(tiers.get("dep1")).toBe(3);
    expect(tiers.get("same1")).toBe(2); // no edge, but same district

    // Only an outgoing edge — same treatment
    const tiersOut = computeFocusTiers(
      "sel",
      files(),
      [{ from: "sel", to: "dep1", weight: 1 }],
      districtOf,
    );
    expect(tiersOut.get("dep1")).toBe(1);
  });

  it("returns an EMPTY map without a selection (nothing dimmed)", () => {
    const tiers = computeFocusTiers(null, files(), connections(), districtOf);
    expect(tiers.size).toBe(0);
  });

  it("returns an EMPTY map when the selection is not among the rendered files", () => {
    // e.g. a selection made on another zoom level
    const tiers = computeFocusTiers("ghost", files(), connections(), districtOf);
    expect(tiers.size).toBe(0);
  });

  it("is deterministic — same inputs, same map", () => {
    const a = computeFocusTiers("sel", files(), connections(), districtOf);
    const b = computeFocusTiers("sel", files(), connections(), districtOf);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("keeps edges to unrendered files harmless", () => {
    // Connection pointing at a file not in the rendered list — must not crash
    // and must not invent tiers
    const tiers = computeFocusTiers(
      "sel",
      [{ id: "sel", path: "d1/sel.ts" }],
      [{ from: "sel", to: "invisible", weight: 1 }],
      districtOf,
    );
    expect(tiers.size).toBe(1);
    expect(tiers.get("sel")).toBe(0);
  });
});
