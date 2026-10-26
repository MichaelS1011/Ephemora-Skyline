/**
 * Where the import label may sit on the screen.
 *
 * The arc's apex is a point in the world, and in a real project the roofs are
 * tall: measured on a self-scan of this repository, the apex of one arc landed
 * 258 px above the top of the window, so the sentence naming the two files —
 * the only place the relationship is written down — never reached the reader.
 *
 * The fix is a placement rule, not a camera move. It lives here as a pure
 * function so the rule is testable without a renderer, and so the camera stays
 * exactly where the reader put it.
 */

/** A surface in CSS pixels, relative to the canvas' own box. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Which way the true anchor lies once the plate has been moved to stay legible. */
export type Direction =
  "up" | "down" | "left" | "right" | "up-left" | "up-right" | "down-left" | "down-right";

export interface Placement {
  /** Top-left of the plate, CSS px. */
  x: number;
  y: number;
  /** The plate could not sit on its own apex and had to be moved. */
  clamped: boolean;
  /** Set only when `clamped`: where the arc's real apex actually is. */
  toward: Direction | null;
  /** Surfaces the plate still shares pixels with after every push. Should be none. */
  unresolved: number;
}

const EPS = 1;
/** Bounded, so a crowded window cannot make the placement loop. */
const MAX_PASSES = 12;

/**
 * The surfaces the label must not sit on. Each is a real container with a
 * stable class; `label-hud.test.ts` fails if one stops existing, so the list
 * cannot quietly rot into "everything except the mode bar".
 */
export const HUD_SURFACES = [
  ".workspace-header",
  ".workspace-breadcrumbs",
  ".workspace-modes",
  ".start-summary-slot",
  ".start-summary-strip-slot",
  ".action-dock",
  ".panel-info",
  ".search-control",
] as const;

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

const totalOverlap = (
  pos: { x: number; y: number },
  plate: Size,
  reserved: readonly Box[],
): number =>
  reserved.reduce(
    (n, s) => n + (s.w > 0 && s.h > 0 ? overlapArea({ x: pos.x, y: pos.y, ...plate }, s) : 0),
    0,
  );

function directionFrom(
  plateCentre: { x: number; y: number },
  anchor: { x: number; y: number },
): Direction {
  const dy = anchor.y - plateCentre.y;
  const dx = anchor.x - plateCentre.x;
  const vert = dy < -EPS ? "up" : dy > EPS ? "down" : "";
  const horz = dx < -EPS ? "left" : dx > EPS ? "right" : "";
  if (vert && horz) return `${vert}-${horz}` as Direction;
  if (vert || horz) return (vert || horz) as Direction;
  // Moved but the anchor is level with the centre: it left through the edge
  // that had no room.
  return "up";
}

/**
 * Place the plate on its apex where it can, and as close to the apex as the
 * HUD allows where it cannot.
 *
 * The rule is collision push-out rather than a fixed inset band: the header
 * spans the whole width and so touches the left and right edges without being
 * anchored to them, and the action dock sits free in the middle of the bottom.
 * Any model that asks "which edge is this surface on" gets both of those wrong.
 * Pushing the plate out of whichever surface it lands on, along the shorter
 * way out, needs no such assumption.
 *
 * A plate larger than the canvas is still placed — an oversized label is a
 * layout problem, an absent one loses the relationship.
 */
export function placeLabel(
  anchor: { x: number; y: number },
  plate: Size,
  canvas: Size,
  reserved: readonly Box[],
): Placement {
  const free = { w: Math.max(0, canvas.w - plate.w), h: Math.max(0, canvas.h - plate.h) };
  // Compared against the raw apex position, not the canvas-limited one: a plate
  // pulled in from an apex 258 px above the window is detached from its arc just
  // as much as one pushed aside by the header, and the reader has to be told.
  const raw = { x: anchor.x - plate.w / 2, y: anchor.y - plate.h / 2 };
  const ideal = { x: clamp(raw.x, 0, free.w), y: clamp(raw.y, 0, free.h) };
  let best = ideal;
  let bestCost = totalOverlap(ideal, plate, reserved);
  let leastBad = ideal;
  const seen = new Set<string>([`${ideal.x}|${ideal.y}`]);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const box = { x: best.x, y: best.y, w: plate.w, h: plate.h };
    const hits = reserved.filter((s) => s.w > 0 && s.h > 0 && overlaps(box, s));
    if (hits.length === 0) {
      bestCost = 0;
      leastBad = best;
      break;
    }
    // Deepest first: one surface moved aside usually uncovers the rest.
    const worst = hits.reduce((a, b) => (overlapArea(box, b) > overlapArea(box, a) ? b : a));
    // Only pushes that actually move the plate count. The shortest way out of
    // the header is upwards and the shortest way out of the dossier is rightwards,
    // and both are against the wall of the window — offering them and then
    // clamping back leaves the plate exactly where it was, overlapping.
    const moves: Array<{ x: number; y: number; d: number }> = [];
    const offer = (nx: number, ny: number, d: number): void => {
      const cx = clamp(nx, 0, free.w);
      const cy = clamp(ny, 0, free.h);
      if (Math.abs(cx - best.x) < EPS && Math.abs(cy - best.y) < EPS) return;
      if (seen.has(`${cx}|${cy}`)) return;
      moves.push({ x: cx, y: cy, d });
    };
    offer(worst.x - plate.w, best.y, box.x + box.w - worst.x);
    offer(worst.x + worst.w, best.y, worst.x + worst.w - box.x);
    offer(best.x, worst.y - plate.h, box.y + box.h - worst.y);
    offer(best.x, worst.y + worst.h, worst.y + worst.h - box.y);
    if (moves.length === 0) break;
    const next = moves.reduce((a, b) => (b.d < a.d ? b : a));
    seen.add(`${next.x}|${next.y}`);
    best = { x: next.x, y: next.y };
    // Getting worse on the way out is normal: the header and the dossier meet at
    // a corner, and leaving one means entering the other before clearing both.
    // Termination is the visited set and the pass cap, not the cost.
    const cost = totalOverlap(best, plate, reserved);
    if (cost < bestCost) {
      bestCost = cost;
      leastBad = best;
    }
  }
  if (bestCost > 0) best = leastBad;
  const finalBox = { x: best.x, y: best.y, w: plate.w, h: plate.h };
  const unresolved = reserved.filter((s) => s.w > 0 && s.h > 0 && overlaps(finalBox, s)).length;
  const clamped = Math.abs(best.x - raw.x) > EPS || Math.abs(best.y - raw.y) > EPS;
  return {
    x: best.x,
    y: best.y,
    clamped,
    toward: clamped
      ? directionFrom({ x: best.x + plate.w / 2, y: best.y + plate.h / 2 }, anchor)
      : null,
    unresolved,
  };
}

/** The glyph the plate points with when its real apex is out of reach. */
export const TOWARD_GLYPH: Record<Direction, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  "up-left": "↖",
  "up-right": "↗",
  "down-left": "↙",
  "down-right": "↘",
};
