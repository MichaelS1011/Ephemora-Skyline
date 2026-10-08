/**
 * The keyboard's mark on the world.
 *
 * `hoveredId` cannot carry it: that slot is the pointer's, claimed and released
 * by the objects under the ray (see interaction/hover.ts), and a red ring that
 * followed every mouse pass would say "alarm" where the file said nothing. The
 * bracket pair marks a *district* when the level has no file buildings, and that
 * mark needs its own channel — one value, no React, read by the camera rig in
 * its frame loop.
 */

export interface KeyboardMark {
  kind: "district";
  /** CityDir.path of the marked block, e.g. "frontend/src". */
  path: string;
}

let mark: KeyboardMark | null = null;

export function setKeyboardMark(next: KeyboardMark | null): void {
  mark = next;
}

export function getKeyboardMark(): KeyboardMark | null {
  return mark;
}

export function clearKeyboardMark(): void {
  mark = null;
}
