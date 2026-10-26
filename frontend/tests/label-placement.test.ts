import { readFileSync } from "node:fs";
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

/**
 * Auftrag #14 — the role mark keeps out of every open panel too.
 *
 * Measured in the running window (x8_badge_geometry.mjs, real scan, 1600 ×
 * 1000 CSS px): the security badge on a tour step sat at (1240.2, 521.9) while
 * the dossier covered (1178, 130, 400 × 775) — worn in the DOM, invisible on
 * the screen, `elementFromPoint` answering `SPAN.finding-message-orig`. The
 * surfaces below are those exact measured rects (the dock at 576.1 × 54, the
 * open dock menu at (830.4, 361, 256 × 560), the tour card at (575, 716,
 * 450 × 194)); the badge is the measured 18.4 × 17.2, rounded up.
 */
import { BADGE_FALLBACK, BADGE_MAX_SHIFT, placeBadge } from "../src/city/labelPlacement";

const BADGE = { w: 19, h: 18 };
const panel: Box = { x: 1178, y: 130, w: 400, h: 775 };
const dockLive: Box = { x: 512, y: 926, w: 576.1, h: 54 };
const dockMenu: Box = { x: 830.4, y: 361, w: 256, h: 560 };
const tourCard: Box = { x: 575, y: 716, w: 450, h: 194 };
const stripLive: Box = { x: 0, y: 128, w: 1600, h: 42 };
const MARK_HUD = [header, stripLive, dockLive, panel, dockMenu, tourCard];

const badgeBox = (p: { x: number; y: number }): Box => ({
  x: p.x - BADGE.w / 2,
  y: p.y - BADGE.h / 2,
  w: BADGE.w,
  h: BADGE.h,
});
const markClear = (p: { x: number; y: number }): boolean =>
  MARK_HUD.every((s) => !overlaps(badgeBox(p), s));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("the role mark dodges open panels", () => {
  it("leaves the mark exactly on its figure when nothing is reserved", () => {
    const p = placeBadge({ x: 700, y: 500 }, BADGE, CANVAS, []);
    expect(p).toEqual({ x: 700, y: 500, shifted: false });
  });

  it("leaves the mark exactly on its figure in free air, panels and all", () => {
    const p = placeBadge({ x: 700, y: 500 }, BADGE, CANVAS, MARK_HUD);
    expect(p.shifted).toBe(false);
    expect(p).toMatchObject({ x: 700, y: 500 });
  });

  it("pushes the measured tour-step collision out of the dossier", () => {
    // the worn security badge at (1240.2, 521.9), 18.4 × 17.2 — centre here.
    const p = placeBadge({ x: 1249.4, y: 530.5 }, BADGE, CANVAS, MARK_HUD);
    expect(p.shifted).toBe(true);
    expect(markClear(p)).toBe(true);
    expect(overlaps(badgeBox(p), panel)).toBe(false);
  });

  it("takes the short way out, not the long way", () => {
    // 60 px inside the panel's left edge: leaving left costs ~69 px, leaving
    // right would cost 350. The mark must move the fewest pixels that free it.
    const p = placeBadge({ x: 1238, y: 500 }, BADGE, CANVAS, [panel]);
    expect(p.x).toBeLessThan(1238);
    expect(distance(p, { x: 1238, y: 500 })).toBeLessThan(90);
    expect(overlaps(badgeBox(p), panel)).toBe(false);
  });

  it("escapes the middle of the panel within the bounded push", () => {
    const p = placeBadge({ x: 1378, y: 517 }, BADGE, CANVAS, MARK_HUD);
    expect(markClear(p)).toBe(true);
    expect(distance(p, { x: 1378, y: 517 })).toBeLessThanOrEqual(BADGE_MAX_SHIFT);
  });

  it("gets off the tour card and the open dock menu too", () => {
    for (const anchor of [
      { x: 800, y: 813 }, // middle of the tour card
      { x: 958, y: 641 }, // middle of the open dock menu
    ]) {
      const p = placeBadge(anchor, BADGE, CANVAS, MARK_HUD);
      expect(markClear(p)).toBe(true);
      expect(distance(p, anchor)).toBeLessThanOrEqual(BADGE_MAX_SHIFT);
    }
  });

  it("never hides the mark: when no free spot exists it takes the least-covered one", () => {
    const everywhere: Box = { x: 0, y: 0, w: 1600, h: 1000 };
    const p = placeBadge({ x: 800, y: 500 }, BADGE, CANVAS, [everywhere]);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1600);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(1000);
    // the anchor still has exactly one covering surface; the rule may not
    // hand back a worse answer than leaving the mark where the figure is.
    expect(overlaps(badgeBox(p), everywhere)).toBe(true);
  });

  it("stays bounded at the far edge: a deep mark moves, it does not teleport", () => {
    const p = placeBadge({ x: 1450, y: 300 }, BADGE, CANVAS, MARK_HUD);
    expect(markClear(p)).toBe(true);
    expect(distance(p, { x: 1450, y: 300 })).toBeLessThanOrEqual(BADGE_MAX_SHIFT);
  });

  it("keeps the whole mark inside the window once it had to move", () => {
    const rightPanelOnly: Box[] = [{ x: 1178, y: 130, w: 422, h: 775 }];
    const p = placeBadge({ x: 1595, y: 500 }, BADGE, CANVAS, rightPanelOnly);
    expect(badgeBox(p).x + badgeBox(p).w).toBeLessThanOrEqual(1600 + 1);
    expect(badgeBox(p).x).toBeGreaterThanOrEqual(-1);
  });

  it("pins the mark to the canvas rail when the figure sits wholly behind the panel", () => {
    // x8e live: opening the dossier narrows the canvas to 1164 px, and a tour
    // arrival projects the head at x 1560 — outside the window, behind the
    // panel. The honest answer is the rail (visible, 405 px away), not the
    // head (invisible, 0 px away). The budget bounds pushes, not this clamp.
    const narrow = { w: 1164, h: 1000 };
    const p = placeBadge({ x: 1560, y: 762 }, BADGE, narrow, [panel]);
    expect(overlaps(badgeBox(p), panel)).toBe(false);
    expect(badgeBox(p).x + badgeBox(p).w).toBeLessThanOrEqual(1164 + 1);
    expect(p.shifted).toBe(true);
  });

  it("falls back to the measured badge box, not a hopeful guess", () => {
    // 18.4 × 17.2 CSS px was the live measurement; the fallback must be at
    // least as large, or the rule would reserve too little and clip.
    expect(BADGE_FALLBACK.w).toBeGreaterThanOrEqual(18.4);
    expect(BADGE_FALLBACK.h).toBeGreaterThanOrEqual(17.2);
  });

  it("is wired to every role badge in the scene", () => {
    // The rule only holds if all three marks actually run through it: source
    // guard, because jsdom never mounts the R3F tree.
    const src = readFileSync(new URL("../src/components/Pedestrians.tsx", import.meta.url), "utf8");
    const badgeHtml = src.match(/<Html center zIndexRange=\{\[9, 0\]\}[^>]*>/g) ?? [];
    expect(badgeHtml.length).toBe(3);
    for (const tag of badgeHtml) expect(tag).toContain("calculatePosition={badgePosition}");
    const wornDivs = src.match(/className="cf-guide-badge[^"]*"/g) ?? [];
    expect(wornDivs.length).toBe(3);
    expect(src.match(/ref=\{badgeElRef\}/g)?.length).toBe(3);
  });
});
