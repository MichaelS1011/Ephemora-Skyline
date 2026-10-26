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

/**
 * Read the live HUD surfaces off the document, in canvas-local CSS px.
 *
 * This is the DOM half of the rule above; the rule itself stays pure so it can
 * be tested without a renderer. `CityConnections` (the arc plate and the
 * neighbour plates) and `Pedestrians` (the role badges) share this one reader —
 * a second copy would drift the moment a surface is renamed.
 */
export function hudBoxes(canvasBox: DOMRect | null, selectors: readonly string[]): Box[] {
  const out: Box[] = [];
  const ox = canvasBox?.left ?? 0;
  const oy = canvasBox?.top ?? 0;
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      const el = node as HTMLElement;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.push({ x: r.x - ox, y: r.y - oy, w: r.width, h: r.height });
    }
  }
  return out;
}

// ── the role badge's own placement rule ─────────────────────────────────────

/**
 * Surfaces only the badge must additionally keep clear of, measured in the
 * running window at 1600 × 1000 (x8_badge_geometry.mjs, 2026-10-26): the tour's
 * step card (450 × 194 at (575, 716)) and the open dock menu (256 × 560 at
 * (830, 361)). Neither belongs on the arc plate's list — `label-hud.test.ts`
 * pins that list — so the badge extends it rather than editing it.
 */
export const BADGE_EXTRA_HUD = [".security-tour", "#city-more-menu"] as const;

/**
 * How far the badge may be pushed from its figure, CSS px.
 *
 * Bounded by the widest surface a mark can land on: the dossier is 400 px wide,
 * so an escape from its exact middle is 200 px plus the badge's own 18.4 px
 * (measured) — 209 px does it against the panel; the tour card wants 234 px
 * horizontally but only ~106 px vertically. 240 covers every measured case and
 * stops the mark from being pushed clear across the city it marks.
 */
export const BADGE_MAX_SHIFT = 240;

/** The size the badge falls back to before the browser has laid it out.
 *  Measured at the live frame: 18.4 × 17.2 CSS px; rounded up. */
export const BADGE_FALLBACK: Size = { w: 19, h: 18 };

export interface BadgePlacement {
  /** Centre of the badge, CSS px — the point the `center` Html sits on. */
  x: number;
  y: number;
  /** True when the badge left its figure's projected head to stay visible. */
  shifted: boolean;
}

/**
 * The role mark never sits under an open panel — and never loses its figure.
 *
 * The rule is the district plate's rule, narrowed to the badge: when the
 * projected head lands on a HUD surface, push the mark out of that surface the
 * short way, toward the free space, as far as `maxShift` allows. The figure
 * stays exactly where it is; only the mark moves. With no panel under the head
 * the anchor is returned untouched — even when the figure stands half off
 * screen, because there the mark belongs to the figure, not to the window.
 *
 * When every position inside `maxShift` still touches something (a resident
 * circled right where header, dossier and strip meet), the mark takes the
 * position with the least contact, and among those the closest to its figure.
 * It is never hidden for it: a nudged mark still says *a resident is here*,
 * a vanished one says nothing.
 *
 * One honest exception, measured live (x8e, 2026-10-26): opening the dossier
 * narrows the canvas to 1164 px, so a figure the camera parked behind the
 * panel projects at x 1560 — outside the window entirely. There the closest
 * visible point is the canvas edge, and the fallback pins there even past
 * `maxShift` (observed: 405 px): the budget bounds pushes away from surfaces,
 * not the last clamp back into the window. A mark at the rail still marks;
 * one at the figure's head, under the panel, marks nothing.
 */
export function placeBadge(
  anchor: { x: number; y: number },
  plate: Size,
  canvas: Size,
  reserved: readonly Box[],
  maxShift = BADGE_MAX_SHIFT,
): BadgePlacement {
  const boxAt = (p: { x: number; y: number }): Box => ({
    x: p.x - plate.w / 2,
    y: p.y - plate.h / 2,
    w: plate.w,
    h: plate.h,
  });
  const touching = (p: { x: number; y: number }): Box[] => {
    const b = boxAt(p);
    return reserved.filter((s) => s.w > 0 && s.h > 0 && overlaps(b, s));
  };
  if (touching(anchor).length === 0) return { x: anchor.x, y: anchor.y, shifted: false };

  const pushCost = (p: { x: number; y: number }): number =>
    Math.hypot(p.x - anchor.x, p.y - anchor.y);
  const free = {
    w: Math.max(0, canvas.w - plate.w),
    h: Math.max(0, canvas.h - plate.h),
  };
  /** Slide a candidate point back into the window (keeping the whole badge in). */
  const inside = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: plate.w >= canvas.w ? canvas.w / 2 : clamp(p.x, plate.w / 2, free.w + plate.w / 2),
    y: plate.h >= canvas.h ? canvas.h / 2 : clamp(p.y, plate.h / 2, free.h + plate.h / 2),
  });

  let best = anchor;
  let bestCost = Infinity;
  const seen = new Set<string>([`${Math.round(anchor.x)}|${Math.round(anchor.y)}`]);
  const frontier: Array<{ p: { x: number; y: number }; d: number }> = [{ p: anchor, d: 0 }];
  for (let pass = 0; pass < MAX_PASSES && frontier.length > 0; pass++) {
    const current = frontier.shift()!;
    const hits = touching(current.p);
    if (hits.length === 0) {
      // Free, but only a valid answer while the push stayed inside the
      // budget: 300 px away the mark no longer reads as belonging to a
      // 30 px figure, and an honest overlap close to the head beats a clean
      // dot across the window.
      if (pushCost(current.p) <= maxShift && pushCost(current.p) < bestCost) {
        best = current.p;
        bestCost = pushCost(current.p);
      }
      continue;
    }
    if (pushCost(current.p) >= maxShift) continue;
    // Deepest first, same as the plate rule: one surface moved off usually
    // uncovers the rest.
    const cur = boxAt(current.p);
    const worst = hits.reduce((a, b) => (overlapArea(cur, b) > overlapArea(cur, a) ? b : a));
    const offers: Array<{ x: number; y: number }> = [
      { x: worst.x - plate.w / 2 - EPS, y: current.p.y },
      { x: worst.x + worst.w + plate.w / 2 + EPS, y: current.p.y },
      { x: current.p.x, y: worst.y - plate.h / 2 - EPS },
      { x: current.p.x, y: worst.y + worst.h + plate.h / 2 + EPS },
    ];
    for (const raw of offers) {
      const p = inside(raw);
      // The search itself lives inside the budget: a candidate further from
      // the figure than `maxShift` is not a push the rule will ever execute —
      // not as an answer, and not as a step toward one.
      if (pushCost(p) > maxShift) continue;
      const key = `${Math.round(p.x)}|${Math.round(p.y)}`;
      if (seen.has(key)) continue;
      // A push that only clamps back to where we stood is not a push — this is
      // the same guard the plate loop runs, and it is why only feasible moves
      // are ever executed.
      if (Math.abs(p.x - current.p.x) < EPS && Math.abs(p.y - current.p.y) < EPS) continue;
      seen.add(key);
      frontier.push({ p, d: 0 });
    }
  }
  if (touching(best).length !== 0) {
    // Nothing cleared inside the budget: take the least-covered point, and
    // among equals the one closest to the figure. The seen set holds every
    // candidate this pass produced.
    let leastBad = anchor;
    let leastHits = Infinity;
    for (const key of seen) {
      const bar = key.indexOf("|");
      const x = Number(key.slice(0, bar));
      const y = Number(key.slice(bar + 1));
      const n = touching({ x, y }).length;
      if (n < leastHits || (n === leastHits && pushCost({ x, y }) < pushCost(leastBad))) {
        leastBad = { x, y };
        leastHits = n;
      }
    }
    // Best effort still keeps the whole mark in the window: half a clipped
    // badge at its figure's head reads as no badge at all.
    best = inside(leastBad);
  }
  return { x: best.x, y: best.y, shifted: pushCost(best) > EPS };
}
