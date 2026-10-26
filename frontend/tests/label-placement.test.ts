import { describe, it, expect } from "vitest";
import { placeLabel, overlaps, TOWARD_GLYPH, type Box } from "../src/city/labelPlacement";

/**
 * Folge-003: the label has to stay where a reader can read it, without the
 * camera moving and without the plate ever appearing to belong to a building it
 * is not attached to. Both halves are rules, so both are tested as rules.
 *
 * The surfaces are measured shapes from the running app at 1600 × 1000: the
 * header across the top, the announcement strip under it, the action dock free
 * in the bottom middle, the dossier down the right edge.
 */
const CANVAS = { w: 1600, h: 1000 };
const header: Box = { x: 0, y: 0, w: 1600, h: 62 };
const strip: Box = { x: 24, y: 122, w: 812, h: 40 };
const dock: Box = { x: 516, y: 918, w: 568, h: 58 };
const dossier: Box = { x: 1176, y: 78, w: 424, h: 922 };
const HUD = [header, strip, dock, dossier];
const PLATE = { w: 220, h: 40 };

const boxOf = (p: { x: number; y: number }, size = PLATE): Box => ({ x: p.x, y: p.y, ...size });
const clear = (p: { x: number; y: number }) => HUD.every((s) => !overlaps(boxOf(p), s));

describe("the plate keeps out of the HUD", () => {
  it("leaves a plate whose apex is already in free air exactly alone", () => {
    const p = placeLabel({ x: 700, y: 500 }, PLATE, CANVAS, HUD);
    expect(p.clamped).toBe(false);
    expect(p.toward).toBeNull();
    expect(p).toMatchObject({ x: 590, y: 480 });
    expect(p.unresolved).toBe(0);
  });

  it("pushes a plate off the header the short way, not the long way", () => {
    const p = placeLabel({ x: 700, y: 40 }, PLATE, CANVAS, HUD);
    expect(p.y).toBeGreaterThanOrEqual(62);
    expect(clear(p)).toBe(true);
  });

  it("pulls the measured failure back into view", () => {
    // `palette.ts` in a self-scan of this repository: apex 258 px above the
    // window, plate centre x 778.
    const p = placeLabel({ x: 778, y: -240 }, PLATE, CANVAS, HUD);
    expect(p.clamped).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(62);
    expect(clear(p)).toBe(true);
    expect(p.toward).toBe("up");
  });

  it("steps over the announcement strip instead of under the header", () => {
    const p = placeLabel({ x: 400, y: 142 }, PLATE, CANVAS, HUD);
    expect(clear(p)).toBe(true);
  });

  it("lifts clear of the action dock, which touches no edge", () => {
    const p = placeLabel({ x: 800, y: 947 }, PLATE, CANVAS, HUD);
    expect(clear(p)).toBe(true);
    expect(p.toward).toBe("down");
  });

  it("comes back inside from behind the dossier", () => {
    const p = placeLabel({ x: 1500, y: 500 }, PLATE, CANVAS, HUD);
    expect(boxOf(p).x + boxOf(p).w).toBeLessThanOrEqual(1176);
    expect(clear(p)).toBe(true);
  });

  it("overlaps nothing on screen, whichever way the camera looks", () => {
    // Swept, because the claim is "never" and a handful of anchors cannot hold
    // that. 41 × 35 = 1435 camera positions across and beyond the window.
    const offenders: string[] = [];
    for (let ax = -300; ax <= 1900; ax += 50) {
      for (let ay = -300; ay <= 1300; ay += 50) {
        const p = placeLabel({ x: ax, y: ay }, PLATE, CANVAS, HUD);
        const b = boxOf(p);
        if (b.x < 0 || b.y < 0 || b.x + b.w > CANVAS.w || b.y + b.h > CANVAS.h)
          offenders.push(`${ax},${ay} outside the canvas`);
        if (p.unresolved > 0) offenders.push(`${ax},${ay} still on ${p.unresolved} surface(s)`);
      }
    }
    expect(offenders.slice(0, 6), `${offenders.length} positions fail`).toEqual([]);
  });

  it("still places the plate when the HUD has taken everything", () => {
    // A small window with no free band: the label loses its clearance before it
    // loses the one sentence that names the relationship.
    const p = placeLabel({ x: 40, y: -50 }, PLATE, { w: 300, h: 120 }, [
      { x: 0, y: 0, w: 300, h: 110 },
      { x: 200, y: 0, w: 100, h: 120 },
    ]);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.clamped).toBe(true);
  });

  it("ignores a surface with no size", () => {
    const p = placeLabel({ x: 700, y: 500 }, PLATE, CANVAS, [{ x: 600, y: 480, w: 0, h: 0 }]);
    expect(p.unresolved).toBe(0);
    expect(p.clamped).toBe(false);
  });
});

describe("Regel 4 — a moved plate says where its arc went", () => {
  it("points at the apex it left behind", () => {
    expect(placeLabel({ x: 700, y: -300 }, PLATE, CANVAS, HUD).toward).toBe("up");
    expect(placeLabel({ x: 700, y: 1300 }, PLATE, CANVAS, HUD).toward).toBe("down");
    expect(placeLabel({ x: -300, y: 500 }, PLATE, CANVAS, HUD).toward).toBe("left");
    expect(placeLabel({ x: 1900, y: 500 }, PLATE, CANVAS, HUD).toward).toBe("right");
  });

  it("names a corner when the apex left through a corner", () => {
    expect(placeLabel({ x: 1900, y: -300 }, PLATE, CANVAS, HUD).toward).toBe("up-right");
    expect(placeLabel({ x: -300, y: 1300 }, PLATE, CANVAS, HUD).toward).toBe("down-left");
  });

  it("gives every direction a single glyph", () => {
    for (const [dir, glyph] of Object.entries(TOWARD_GLYPH)) expect(glyph, dir).toHaveLength(1);
  });

  it("reports a direction whenever, and only whenever, it moved", () => {
    for (const ax of [-400, 0, 400, 800, 1200, 1600, 2000]) {
      for (const ay of [-400, 0, 400, 800, 1200, 1600]) {
        const p = placeLabel({ x: ax, y: ay }, PLATE, CANVAS, HUD);
        expect(p.toward === null).toBe(!p.clamped);
      }
    }
  });
});
