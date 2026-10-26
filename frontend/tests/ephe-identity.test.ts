import { describe, it, expect } from "vitest";
import { epheIdentityOf, epheKey, epheOnLevel, type EpheIdentity } from "../src/city/epheIdentity";
import { getDirLayout, planConstruction } from "../src/city/layout";
import { city, dir, file } from "./helpers/cityFixture";
import type { CityData } from "../src/city/types";

/**
 * EPHE-AI EA-01 — the address a resident lives at.
 *
 * The crowd is rebuilt per level (`homes` are that level's plots, `crowdFor`
 * sizes the population from them), so the array index a click returns is only
 * meaningful in the level it came from. Anything that has to remember a figure
 * — a name, a role, a bound model, a mission — needs an address that survives.
 * These tests hold the rule and the one thing the renderer must not do: invent
 * its own identifier when the payload already has one.
 */

const plazaFile = (path: string) => file(path, "TypeScript");

function smallCity(paths: string[]): CityData {
  const files = paths.map(plazaFile);
  return city({
    files,
    tree: dir({ path: "", detailFiles: files }),
  });
}

/** The plots a level draws, in the order the build plan hands them out — the
 *  exact array `CityTree` turns into `homes`. */
function planHomes(city: CityData, focusPath: string[] = []): (string | null)[] {
  const plan = planConstruction(getDirLayout(city, focusPath), 0);
  return plan.sites.filter((s) => s.kind === "building").map((s) => s.unitId ?? null);
}

/** The same plots as the set `epheOnLevel` asks about. */
const plotSet = (homes: (string | null)[]): Set<string> =>
  new Set(homes.filter((h): h is string => h !== null));

describe("the address", () => {
  it("names the plot and the seat at it", () => {
    const id: EpheIdentity = { plot: "f-abc123", seat: 2 };
    expect(epheKey(id)).toBe("plot:f-abc123#2");
  });

  it("says street when there is no plot to belong to", () => {
    expect(epheKey({ plot: null, seat: 7 })).toBe("street:7");
  });

  it("hands each plot its residents in order", () => {
    const homes = ["a", "b", "c"];
    // Six figures, three plots: two citizens per door, and the seat counts which.
    expect([0, 1, 2, 3, 4, 5].map((i) => epheKey(epheIdentityOf(i, homes)))).toEqual([
      "plot:a#0",
      "plot:b#0",
      "plot:c#0",
      "plot:a#1",
      "plot:b#1",
      "plot:c#1",
    ]);
  });

  it("falls back to a seat number when there is no crowd to belong to", () => {
    expect(epheIdentityOf(4, [])).toEqual({ plot: null, seat: 4 });
    // A plot the plan could not name is no address either: the figure sitting
    // at that door falls back to its crowd number rather than claiming a
    // neighbour's address.
    expect(epheIdentityOf(1, ["x", null, "z"])).toEqual({ plot: null, seat: 1 });
    expect(epheIdentityOf(2, ["x", null, "z"])).toEqual({ plot: "z", seat: 0 });
  });

  it("is on a level only when that level draws its plot", () => {
    const id = { plot: "f-auth", seat: 0 };
    expect(epheOnLevel(id, new Set(["f-auth", "f-db"]))).toBe(true);
    expect(epheOnLevel(id, new Set(["f-db"]))).toBe(false);
    expect(epheOnLevel({ plot: null, seat: 0 }, new Set(["f-auth"]))).toBe(false);
  });
});

describe("the address comes from the payload, not from the renderer", () => {
  const A = smallCity(["src/auth.ts", "src/db.ts", "src/ui.ts"]);

  it("carries the file id the payload states, unchanged", () => {
    const layout = getDirLayout(A, []);
    const homes = planHomes(A);
    expect(homes.length).toBeGreaterThan(0);
    for (const b of layout.buildings) expect(homes).toContain(b.file.id);
  });

  it("is the same address for two independently built instances of one city", () => {
    // The acceptance test: nothing in the chain reads a clock, a random number
    // or an object-iteration order that could differ between two builds.
    const first = planHomes(A).map((_h, i) => epheKey(epheIdentityOf(i, planHomes(A))));
    const second = planHomes(A).map((_h, i) => epheKey(epheIdentityOf(i, planHomes(A))));
    expect(second).toEqual(first);
    expect(first.every((k) => k.startsWith("plot:"))).toBe(true);
  });

  it("is a different address in a different project", () => {
    const B = smallCity(["src/auth.ts", "src/db.ts", "src/ui.ts"]);
    // Same file names, same ids — that is what a path-derived id means. What
    // must differ is a genuinely different tree.
    const C = smallCity(["lib/auth.ts", "lib/db.ts", "web/ui.ts"]);
    expect(planHomes(B)).toEqual(planHomes(A));
    expect(planHomes(C)).not.toEqual(planHomes(A));
  });

  it("leaves a figure off-level when the reader moves to a district that does not draw its plot", () => {
    const nested = city({
      files: [plazaFile("root.ts"), plazaFile("deep/nested.ts")],
      tree: dir({
        path: "",
        detailFiles: [plazaFile("root.ts")],
        children: [
          dir({
            path: "deep",
            name: "deep",
            detailFiles: [plazaFile("deep/nested.ts")],
            districtFiles: [plazaFile("deep/nested.ts")],
          }),
        ],
      }),
    });
    const atRoot = planHomes(nested, []);
    const inDeep = planHomes(nested, ["deep"]);
    const rootId = getDirLayout(nested, []).buildings.find((b) => b.file.path === "root.ts")!.file
      .id;
    // The root file's own plot is drawn on the level it belongs to and not on
    // the level the reader drilled into. That asymmetry is the whole reason
    // `epheOnLevel` exists: a named Ephe whose door is not drawn is not on
    // screen, and the app has to say that instead of re-using a stranger's body.
    expect(epheOnLevel({ plot: rootId, seat: 0 }, plotSet(atRoot))).toBe(true);
    expect(epheOnLevel({ plot: rootId, seat: 0 }, plotSet(inDeep))).toBe(false);
  });
});
