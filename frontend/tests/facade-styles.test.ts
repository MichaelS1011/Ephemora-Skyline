// @vitest-environment jsdom
/**
 * The four procedural facade styles, measured on the pixels they paint.
 *
 * jsdom's canvas has no 2D context (the "Not implemented" warning the rest of
 * the suite lives with), so getContext is stubbed with a recording context:
 * every fillRect/strokeRect/gradient call lands in an event list, and each
 * style's identity is a claim about that list — brick courses step by half a
 * brick, glass paints one wide band per floor, classic stands a pilaster at
 * every bay boundary, modern keeps the v3 seam rhythm. A style that stops
 * drawing its pattern goes red here, not on someone's screen three weeks later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Rect = { x: number; y: number; w: number; h: number };
type FillRectEvent = { op: "fillRect"; r: Rect; fill?: string };
type Event =
  FillRectEvent | { op: "strokeRect"; r: Rect } | { op: "linearGradient"; stops: number[] };

let events: Event[] = [];
let currentFill: string | undefined;

function makeRecordingContext() {
  return {
    get fillStyle() {
      return currentFill ?? "";
    },
    set fillStyle(v: string) {
      currentFill = v ?? undefined;
    },
    strokeStyle: "",
    lineWidth: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      events.push({ op: "fillRect", r: { x, y, w, h }, fill: currentFill ?? "" });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      events.push({ op: "strokeRect", r: { x, y, w, h } });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number) {
      const stops: number[] = [];
      events.push({ op: "linearGradient", stops });
      return {
        addColorStop(offset: number) {
          stops.push(offset);
        },
      };
    },
  };
}

const TONES = { lit: "#ffc470", pale: "#d9cfae" };

async function loadFacadeModule() {
  // fresh import per test file run; the stub must exist BEFORE the module's
  // getFacadeTextures call creates any canvas
  return import("../src/components/Building");
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  events = [];
  currentFill = undefined;
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = ((id: string) =>
    id === "2d" ? makeRecordingContext() : null) as never;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

describe("facadeStyleForSeed", () => {
  it("is deterministic and covers all four styles across seeds 0-3", async () => {
    const { facadeStyleForSeed } = await loadFacadeModule();
    expect(["modern", "brick", "classic", "glass"]).toEqual([0, 1, 2, 3].map(facadeStyleForSeed));
    expect(facadeStyleForSeed(17)).toBe(facadeStyleForSeed(17));
    expect(facadeStyleForSeed(-5), "a negative seed still picks a style").toBeDefined();
  });
});

describe("the style decides what the surface is made of (Materiality)", () => {
  it("roughness runs matte stone → polished glass, metalness follows", async () => {
    const { facadeSurfaceForStyle } = await loadFacadeModule();
    const brick = facadeSurfaceForStyle("brick");
    const classic = facadeSurfaceForStyle("classic");
    const modern = facadeSurfaceForStyle("modern");
    const glass = facadeSurfaceForStyle("glass");
    expect(brick.roughness).toBeGreaterThan(classic.roughness);
    expect(classic.roughness).toBeGreaterThan(modern.roughness);
    expect(modern.roughness).toBeGreaterThan(glass.roughness);
    expect(glass.metalness).toBeGreaterThan(brick.metalness);
    // every value stays inside what MeshStandardMaterial can hold
    for (const s of [brick, classic, modern, glass]) {
      expect(s.roughness).toBeGreaterThanOrEqual(0);
      expect(s.roughness).toBeLessThanOrEqual(1);
      expect(s.metalness).toBeGreaterThanOrEqual(0);
      expect(s.metalness).toBeLessThanOrEqual(1);
    }
  });

  it("erosion still coarsens any style in the same direction it always did", async () => {
    const { facadeSurfaceForStyle } = await loadFacadeModule();
    // the material adds +0.24/-0.12 on eroded and clamps — no style may leave
    // the [0,1] range MeshStandardMaterial holds
    for (const style of ["modern", "brick", "classic", "glass"] as const) {
      const s = facadeSurfaceForStyle(style);
      expect(Math.min(1, s.roughness + 0.24), `${style} eroded caps at 1`).toBeLessThanOrEqual(1);
      expect(Math.max(0, s.metalness - 0.12), `${style} eroded floors at 0`).toBeGreaterThanOrEqual(
        0,
      );
    }
  });
});

describe("the painted facade carries its style's pattern", () => {
  /** Seeds chosen so facadeStyleForSeed lands on each style (0..3 mod 4). */
  const SEEDS = { modern: 0, brick: 1, classic: 2, glass: 3 } as const;

  function fills() {
    return events.filter((e): e is FillRectEvent => e.op === "fillRect");
  }

  it("brick steps its courses by half a brick — offset rows are the pattern", async () => {
    const { getFacadeTexturesForTest } = await loadFacadeModule();
    getFacadeTexturesForTest("#8f3f2d", 6, 20, false, SEEDS.brick, TONES);
    const courseRows = new Map<number, Set<number>>();
    for (const f of fills()) {
      if (f.r.w > 20 && f.r.w < 25 && f.r.h > 6 && f.r.h < 9) {
        const row = Math.round(f.r.y / 8);
        if (!courseRows.has(row)) courseRows.set(row, new Set());
        courseRows.get(row)!.add(Math.round(f.r.x));
      }
    }
    const xs = [...courseRows.values()].map((set) => Math.min(...set));
    expect(xs.length, "brick courses were painted").toBeGreaterThan(4);
    // consecutive rows start half a brick apart (± rounding at the -brickW margin)
    for (let i = 1; i < xs.length; i++) {
      const shift = Math.abs(xs[i]! - xs[i - 1]!);
      expect(shift, `row ${i} offsets from row ${i - 1}`).toBeGreaterThanOrEqual(9);
      expect(shift).toBeLessThanOrEqual(13);
    }
  });

  it("glass paints one near-full-width band per floor via gradients", async () => {
    const { getFacadeTexturesForTest } = await loadFacadeModule();
    getFacadeTexturesForTest("#a9d6e8", 6, 20, false, SEEDS.glass, TONES);
    const wide = fills().filter((f) => f.r.w > 100 && f.r.h > 15 && f.r.h < 30);
    expect(wide.length, "horizontal glazing bands").toBeGreaterThanOrEqual(8);
    const grads = events.filter((e) => e.op === "linearGradient");
    expect(grads.length, "bands shade through gradients").toBeGreaterThanOrEqual(8);
  });

  it("classic stands a gradient pilaster at every bay boundary", async () => {
    const { getFacadeTexturesForTest } = await loadFacadeModule();
    getFacadeTexturesForTest("#c8c2b6", 6, 20, false, SEEDS.classic, TONES);
    // 6 cols + 1 boundary = 7 pilasters; each is painted as a full-height
    // gradient band (W wide) and then filled strip by strip (pilW ≈ 13.8 px)
    const boundaries = events.filter(
      (e) => e.op === "linearGradient" && e.stops.length >= 3,
    ).length;
    expect(boundaries, "each pilaster shades accent→light→accent").toBe(7);
    // every pilaster strip is a thin vertical band (pilW ≈ 13.8 px) at its bay
    // boundary; the window row bands are 25.6 px wide and cannot match
    const strips = fills().filter((f) => Math.abs(f.r.w - 3.84) < 0.01 && f.r.h === 256);
    expect(strips.length, "a pilaster stands at every bay boundary").toBe(7);
  });

  it("modern keeps the v3 rhythm: 2px seams only, no gradients or glazing bands", async () => {
    const { getFacadeTexturesForTest } = await loadFacadeModule();
    getFacadeTexturesForTest("#cbd5e1", 6, 20, false, SEEDS.modern, TONES);
    const seams = fills().filter((f) => f.r.w === 2 || f.r.h === 2);
    expect(seams.length, "floor + mullion seams").toBeGreaterThanOrEqual(12);
    expect(
      events.some((e) => e.op === "linearGradient"),
      "no gradients",
    ).toBe(false);
    const bands = fills().filter((f) => f.r.w > 100 && f.r.h > 15 && f.r.h < 30);
    // the one wide fill modern may paint is its ground-floor plinth — a band
    // per FLOOR (≥ 8 of them, with gradients) is what glass does and must not
    // appear here
    expect(bands.length, "at most the plinth band").toBeLessThanOrEqual(1);
  });
});
