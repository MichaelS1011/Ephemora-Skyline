import { describe, it, expect } from "vitest";
import {
  constructionStep,
  constructionDuration,
  planConstruction,
  type DirLayout,
} from "../src/city/layout";

/**
 * Construction pacing. The unit is ONE TOWER, not a district, and the total
 * is proportional to how many towers there are — a small folder builds in a
 * moment, a large one takes its time, between a floor and a ceiling.
 */
const BEAT = 200;
const MIN = 4000;
const MAX = 20_000;

describe("constructionDuration", () => {
  it("is one beat per tower in the proportional band", () => {
    expect(constructionDuration(40)).toBe(40 * BEAT);
    expect(constructionDuration(90)).toBe(90 * BEAT);
  });

  it("floors tiny builds so they still read as construction", () => {
    expect(constructionDuration(1)).toBe(MIN);
    expect(constructionDuration(10)).toBe(MIN);
  });

  it("caps huge builds — the wait never runs away", () => {
    expect(constructionDuration(500)).toBe(MAX);
    expect(constructionDuration(20_000)).toBe(MAX);
  });

  it("grows with the size of the project", () => {
    const small = constructionDuration(30);
    const mid = constructionDuration(90);
    const big = constructionDuration(150);
    expect(mid).toBeGreaterThan(small);
    expect(big).toBeGreaterThan(mid);
  });

  it("step is the duration shared over the towers", () => {
    for (const n of [1, 6, 73, 300, 5000]) {
      expect(n * constructionStep(n)).toBeCloseTo(constructionDuration(n), 6);
    }
  });
});

// ── the schedule ───────────────────────────────────────────────────────────

const tower = { file: { id: "f", path: "f.ts" } } as never;
const block = (name: string, towers: number) =>
  ({
    dir: { name, path: name, languages: {} },
    x: 0,
    z: 0,
    w: 10,
    d: 10,
    skyline: Array.from({ length: towers }, () => tower),
  }) as never;
const layoutOf = (
  blocks: number[],
  plazaFiles = 0,
  podium = false,
): Pick<DirLayout, "blocks" | "buildings" | "podium"> => ({
  blocks: blocks.map((n, i) => block(`d${i}`, n)),
  buildings: Array.from({ length: plazaFiles }, () => tower),
  podium: podium ? ({ x: 0, z: 0 } as never) : null,
});

describe("planConstruction", () => {
  it("counts every tower, not every district", () => {
    // 3 districts of 8 towers + 4 plaza files + the podium
    const plan = planConstruction(layoutOf([8, 8, 8], 4, true), 0);
    expect(plan.total).toBe(3 + 24 + 4 + 1);
    // ...while the district count alone would have paced this as 8 units
    expect(plan.total).toBeGreaterThan(8);
  });

  it("opens a plot before its towers and finishes the district before the next", () => {
    const plan = planConstruction(layoutOf([3, 2], 1, false), 1000);
    const s = plan.step;
    expect(plan.blockAt[0]).toBe(1000);
    expect(plan.skylineAt[0]).toEqual([1000 + s, 1000 + 2 * s, 1000 + 3 * s]);
    expect(plan.blockAt[1]).toBe(1000 + 4 * s);
    expect(plan.skylineAt[1]).toEqual([1000 + 5 * s, 1000 + 6 * s]);
    expect(plan.plazaAt).toEqual([1000 + 7 * s]);
  });

  it("lands the podium last", () => {
    const plan = planConstruction(layoutOf([2], 2, true), 0);
    const last = Math.max(...plan.skylineAt.flat(), ...plan.plazaAt);
    expect(plan.podiumAt).toBeGreaterThan(last);
  });

  it("gives a district with more towers proportionally more build time", () => {
    const few = planConstruction(layoutOf([2, 2, 2, 2], 0, false), 0);
    const many = planConstruction(layoutOf([40, 40, 40, 40], 0, false), 0);
    expect(many.durationMs).toBeGreaterThan(few.durationMs);
  });

  it("is a strictly increasing sequence", () => {
    const plan = planConstruction(layoutOf([5, 5], 3, true), 0);
    const all = [...plan.blockAt, ...plan.skylineAt.flat(), ...plan.plazaAt, plan.podiumAt].sort(
      (a, b) => a - b,
    );
    expect(all).toHaveLength(plan.total);
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThan(all[i - 1]!);
  });

  it("empty level still gets a beat", () => {
    const plan = planConstruction(layoutOf([], 0, false), 0);
    expect(plan.total).toBe(0);
    expect(plan.step).toBeGreaterThan(0);
  });
});
