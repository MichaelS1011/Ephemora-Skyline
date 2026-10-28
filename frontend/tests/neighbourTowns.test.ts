/**
 * The towns next door — the guard on a picture nobody has drawn yet.
 *
 * Three things are pinned here, and all three are the reason the module is
 * allowed to exist at all:
 *
 *  - a neighbour tower is drawn on **the reader's own rail**: the same
 *    `heightForComplexity` and the same `complexityColor` a building in their
 *    city uses, fed by one number. A second scale would make "compare my
 *    projects" false by construction.
 *  - a town that cannot be fetched is **absent**, never half-drawn.
 *  - nothing in this corner of the world carries a **name**. The exported
 *    picture is a pixel copy of the live canvas, so the only reason a folder
 *    name is not in it is that names enter through `frameTexts()` behind
 *    `showNames` — a name painted here would walk around that gate. The last
 *    case reads the module's own source for that.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { complexityColor } from "../src/city/palette";
import { heightForComplexity, syntheticComplexity } from "../src/city/mapping";
import {
  FAR_BEARING,
  NEIGHBOUR_ARC,
  NEIGHBOUR_MAX,
  NEIGHBOUR_RING_FACTOR,
  TOWER_FOOT,
  TOWER_FOOT_PAD,
  TOWERS_PER_TOWN,
  hamletOffsets,
  recededInk,
  selectNeighbourIds,
  townAnchors,
  townTowers,
} from "../src/city/neighbourTowns";
import type { RecentCity } from "../src/recentCities";
import { city, dir, file } from "./helpers/cityFixture";

const entry = (id: string, over: Partial<RecentCity> = {}): RecentCity => ({
  id,
  folder: `f-${id}`,
  openedAt: 1,
  findings: 0,
  files: 10,
  ...over,
});

const district = (name: string, lines: number, cyclomatic: number) =>
  dir({
    name,
    path: name,
    linesOfCode: lines,
    districtFiles: [
      file(`${name}/a.ts`, "TypeScript", [], undefined, {
        linesOfCode: lines,
        cyclomaticComplexity: cyclomatic,
      }),
    ],
  });

/** A folder the scan drew no skyline files for — nothing to measure a tower by. */
const emptyDistrict = (name: string) =>
  dir({ name, path: name, linesOfCode: 120, districtFiles: [] });

describe("selectNeighbourIds", () => {
  it("keeps the browser's own order and stops at five", () => {
    const ids = selectNeighbourIds(
      ["a", "b", "c", "d", "e", "f", "g"].map((id) => entry(id)),
      null,
    );
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids.length).toBe(NEIGHBOUR_MAX);
  });

  it("never makes a neighbour of the city being looked at", () => {
    expect(selectNeighbourIds([entry("a"), entry("b")], "a")).toEqual(["b"]);
  });

  it("counts a folder visited twice as one town", () => {
    expect(selectNeighbourIds([entry("a"), entry("a"), entry("b")], null)).toEqual(["a", "b"]);
  });

  it("says nothing when there is no other city", () => {
    expect(selectNeighbourIds([], null)).toEqual([]);
    expect(selectNeighbourIds([entry("a")], "a")).toEqual([]);
  });
});

describe("townTowers — one rail, one colour", () => {
  it("draws every tower from the city's own height and ink law", () => {
    const towns = city({
      tree: dir({ children: [district("src", 400, 12), district("docs", 40, 2)] }),
    });
    const towers = townTowers(towns, false);
    expect(towers.length).toBeGreaterThan(0);
    for (const tower of towers) {
      expect(tower.height).toBe(heightForComplexity(tower.t));
      // the city's own complexity ink, stepped toward the haze — never a colour
      // this module invented for itself
      expect(tower.ink).toBe(recededInk(tower.t, false));
      expect(tower.ink).not.toBe(complexityColor(tower.t, false));
      expect(tower.t).toBeGreaterThanOrEqual(0);
      expect(tower.t).toBeLessThanOrEqual(1);
    }
  });

  it("takes the crown of each district through the shipped complexity function", () => {
    const towns = city({ tree: dir({ children: [district("src", 400, 12)] }) });
    const [tower] = townTowers(towns, false);
    expect(tower?.t).toBeCloseTo(syntheticComplexity(towns.tree.children[0]!.districtFiles[0]!));
  });

  it("keeps the heaviest districts and never more than a hamlet of towers", () => {
    const many = Array.from({ length: 12 }, (_unused, i) => district(`d${i}`, (i + 1) * 100, 5));
    const towers = townTowers(city({ tree: dir({ children: many }) }), false);
    expect(towers.length).toBe(TOWERS_PER_TOWN);
    const heights = towers.map((t) => t.height);
    expect([...heights].sort((a, b) => b - a)).toEqual(heights);
  });

  it("leaves a district with nothing measured out of the picture", () => {
    const towns = city({
      tree: dir({ children: [emptyDistrict("assets"), district("src", 400, 12)] }),
    });
    const towers = townTowers(towns, false);
    expect(towers.length).toBe(1);
    expect(towers.every((t) => t.t > 0)).toBe(true);
  });

  it("draws no tower at all for a city whose tree holds no districts", () => {
    expect(townTowers(city({ tree: dir({ children: [] }) }), false)).toEqual([]);
  });
});

describe("the ring the towns stand on", () => {
  it("sits past the heat grid's lease and inside the ground the city still shades", () => {
    // render/ground.ts: GROUND_RAMP.untouched = 1 (the heat grid's lease),
    // aoEnd = 2.25 (where the city's own shading stops). Beyond aoEnd the
    // hamlets would stand in the haze's climb, which is where the frame showed
    // them disappearing.
    expect(NEIGHBOUR_RING_FACTOR).toBeGreaterThan(1);
    expect(NEIGHBOUR_RING_FACTOR).toBeLessThan(2.25);
  });

  it("keeps every hamlet on the side of the city the arrival camera looks at", () => {
    // The dock covers the near sector, so a neighbour placed there is a
    // neighbour nobody sees. The arc is measured from the rig's own azimuth.
    const away = { x: Math.sin(FAR_BEARING), z: Math.cos(FAR_BEARING) };
    expect(NEIGHBOUR_ARC).toBeLessThan(Math.PI);
    for (let i = 0; i < NEIGHBOUR_MAX; i++) {
      const a = townAnchors(i, 100, NEIGHBOUR_MAX);
      const len = Math.hypot(a.x, a.z);
      const facing = (a.x / len) * away.x + (a.z / len) * away.z;
      expect(facing, `hamlet ${i} is not behind the viewer`).toBeGreaterThan(
        Math.cos(NEIGHBOUR_ARC / 2) - 1e-9,
      );
    }
  });

  it("gives every tower a pad wider than itself, so it stands ON the ground", () => {
    expect(TOWER_FOOT_PAD).toBeGreaterThan(TOWER_FOOT);
  });

  it("places a hamlet at the factor times the level's own half-extent", () => {
    const anchor = townAnchors(0, 100);
    expect(Math.hypot(anchor.x, anchor.z)).toBeCloseTo(100 * NEIGHBOUR_RING_FACTOR, 6);
  });

  it("is deterministic, so a frame can be compared against itself", () => {
    expect(townAnchors(2, 60)).toEqual(townAnchors(2, 60));
    const seen = new Set(
      Array.from({ length: NEIGHBOUR_MAX }, (_unused, i) => {
        const a = townAnchors(i, 60);
        return `${a.x.toFixed(3)},${a.z.toFixed(3)}`;
      }),
    );
    expect(seen.size).toBe(NEIGHBOUR_MAX);
  });

  it("spreads a hamlet's towers in a row that stays inside its own ground", () => {
    const offsets = hamletOffsets(5);
    expect(offsets.length).toBe(5);
    const widths = offsets.map((o) => o.x);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(9);
    expect(widths.reduce((s, w) => s + w, 0)).toBeCloseTo(0, 6);
  });
});

describe("the nameless rule", () => {
  const src = fileURLToPath(new URL("../src/city/neighbourTowns.ts", import.meta.url));
  const view = readFileSync(
    fileURLToPath(new URL("../src/components/NeighbourTowns.tsx", import.meta.url)),
    "utf-8",
  );

  it("costs two draw calls, and stays at two", () => {
    // The house measure of a world component's cost is its own instanced meshes
    // — the same count `tests/openCityLife.test.ts` pins for the crowd. Tower
    // and pad: one each. A third would mean the hamlets stopped being a batch.
    expect((view.match(/<instancedMesh/g) ?? []).length).toBe(2);
    expect(view).not.toMatch(/useFrame|CanvasTexture|TextureLoader|pointLight|directionalLight/);
  });

  it("reads no folder, repo or district name and paints no text", () => {
    const text = readFileSync(src, "utf-8");
    for (const forbidden of [
      ".folder",
      "repo.",
      ".name",
      "CanvasTexture",
      "<Html",
      "TextureLoader",
    ]) {
      expect(text, `the neighbour module must never reach for ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("keeps its hex in the palette it calls, not in literals of its own", () => {
    expect(readFileSync(src, "utf-8")).not.toMatch(/"#[0-9a-fA-F]{3,8}"/);
  });
});
