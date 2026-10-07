/**
 * The pointer's answer — one hover contract for every object the ray can hit.
 *
 * Measured before this existed (1440×900, real Chrome, 60 fps): moving the
 * pointer onto a file building changed the 240 px field around it by a mean
 * luminance of **+0.28 of 255** — the emissive flicker was the only channel,
 * it skipped glass bodies entirely, and the voxel-body outline sat at 0.12
 * opacity. Hovering a district plot changed nothing at all (-0.03). The world
 * was a picture, not a place.
 *
 * The answer is an **ink annotation** on the object under the pointer:
 * - the body's envelope drawn in graphite (opacity 0 → 0.72), and
 * - a cut line on the ground around its footprint, from the same material.
 *
 * Ink, not light. Measured first, lifting the existing *white* corner seam was
 * worth nothing: against this world's pale sky (`#dcecf5`) a brighter white
 * changed the 220 px field around a tower by 0.002 luminance — the channel had
 * no contrast to give. Graphite has, against sky, facade and ground alike. And
 * it cannot be misread: emission means alarm here (`#ff2e4d` windows, red
 * beacons) and `ENV.selection` means chosen, so a hover that glows or goes red
 * says something the file did not do. A pencil line says only "the pointer is
 * on this one", which is the whole message.
 *
 * Everything here is pure and motion-gated: `easeGlow` lands on its target in
 * one frame while `prefers-reduced-motion` is set, so the hover still happens,
 * it just does not travel.
 */

import { prefersReducedMotion } from "../city/motion";

/** Graphite ink — the drawing's own line colour, deliberately not a light. */
export const HOVER_INK = "#1b2130";

/** The seam colour of a silhouette body (`#f2efe8`): the lit corner seams the
 *  model is specified with. Hover does not recolour them, it firms them up. */
export const SEAM_COLOUR = "#f2efe8";

/**
 * The channels a hover drives, and the ease between them.
 *
 * - `ink`: the envelope contour and the ground cut line, one material, 0 at
 *   rest and `inkLift` under the pointer.
 * - the body's own emissive (only the lit-window facades have one) rides on it.
 *
 * `rate` is per 60 Hz frame: 0.34 reaches 95 % of the target in 8 frames
 * (≈133 ms), the window in which a change still reads as caused by the hand
 * rather than as a coincidence.
 */
export const HOVER = {
  /** The resting corner seam: the lit hairline the model is specified with. */
  seamRest: 0.18,
  /** Ink opacity at full hover: contour and ground line share one material. */
  inkLift: 0.72,
  rate: 0.34,
  /** Below this distance the glow has arrived; stop writing. */
  settle: 0.008,
  /** A selected body keeps a slightly firmer seam, but no new colour. */
  selectedBoost: 1.12,
} as const;

/**
 * One ease step toward `target` (0 or 1). Reduced motion snaps: the hover is
 * a fact about the pointer, not an animation, and a reader who asked for
 * stillness should still see which building they are on.
 */
export function easeGlow(
  current: number,
  target: number,
  reduced = prefersReducedMotion(),
): number {
  if (reduced || Math.abs(target - current) <= HOVER.settle) return target;
  return current + (target - current) * HOVER.rate;
}

/** Ink annotation: nothing at rest, one clean graphite line under the pointer. */
export function inkOpacity(glow: number): number {
  return Math.max(0, Math.min(1, HOVER.inkLift * glow));
}

/**
 * The resting seam's hairline. `dim` is the body's brightness factor (focus
 * tier × view mode × filter) so a backdrop stays a backdrop; a filter-dimmed
 * body drops to a whisper.
 */
export function hairlineOpacity(dim = 1, dimmed = false): number {
  return Math.max(0, Math.min(1, dimmed ? 0.04 : HOVER.seamRest * dim));
}

/**
 * Channel spread (max − min) of a hex colour: 0 is neutral graphite or paper,
 * anything large is a hue that MEANS something in this model.
 *
 * The guard this feeds is the semantic one: a hover may never be mistaken for a
 * finding. Alarm colours are saturated lights — beacons, lit windows, the
 * severity ramp, the selection marker. The pointer's answer is a line in the
 * drawing's own ink, and staying achromatic is what keeps the two apart.
 */
export function colourSpread(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// ── Pointer interest: cursor and tooltip belong to ONE owner ───────────────
/**
 * `document.body.style.cursor` is one slot, and so is the store's `hoveredId`.
 * Both used to be written unconditionally by every hoverable object — including
 * the reset on pointer-out — which made the result depend on whether the
 * framework fired the new object's `over` before the old one's `out`. A tower
 * under the pointer wearing an arrow cursor, or a tooltip that blinks out
 * while the hand holds still, are both that race.
 *
 * So the slot is claimed by token: a release only counts while the releaser
 * still owns it, which makes the whole thing order-independent. Claiming a new
 * id while the same owner holds the slot just rewrites the id, so a district
 * plot and the towers standing on it can share one target without fighting.
 */
let owner: object | null = null;
let ownerId: string | null = null;

/** The store writer the claim drives — passed in by the caller, so this module
 *  stays free of the store and every claim is testable on its own. */
export type HoverWrite = (id: string | null) => void;

/** Claim the pointer: cursor goes to the hand, the tooltip reads `id`. */
export function claimHover(o: object, id: string, write: HoverWrite): void {
  if (owner !== o) {
    const el = bodyEl();
    if (el) el.style.cursor = "pointer";
  }
  owner = o;
  ownerId = id;
  write(id);
}

/** Release the pointer — ignored if the slot already moved on to something else. */
export function releaseHover(o: object, write: HoverWrite): boolean {
  if (owner !== o) return false;
  owner = null;
  ownerId = null;
  const el = bodyEl();
  if (el) el.style.cursor = "";
  write(null);
  return true;
}

/** Who owns the pointer slot right now (test seam). */
export function pointerOwnerIs(o: object): boolean {
  return owner === o;
}

/** The id the pointer currently claims (test seam). */
export function pointerTarget(): string | null {
  return ownerId;
}

/** Drop the claim without touching the DOM or the store — test teardown. */
export function resetPointerOwnership(): void {
  owner = null;
  ownerId = null;
}

function bodyEl(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.body;
}
