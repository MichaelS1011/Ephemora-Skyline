import * as THREE from "three";
import { ENV } from "./palette";

/**
 * The seat on a district plot (§07.13, Zielbild-Familie "Ruhe"). The city has a
 * rest pose since §07.12 and a walk graph since §07.05, but nowhere to be
 * resting *at*: a paused figure stops in the traffic lane, on the same kerb
 * band it walks on. A seat is the object that gives the pause a place, and the
 * pointer a target that is not a building.
 *
 * The construction is the one this project already proved twice: ONE
 * vertex-coloured geometry, ONE shared material, so a district buys one draw
 * call and no new colour. `bezirksband` and `selectionContour` work this way for
 * the same measured reason — a tone that touches the ground it lies on has to
 * clear its own frame, and the frame is only free if both layers share a mesh.
 *
 * Sizes are the plate's measure, not taste. The district camera looks down at
 * 0.68 rad, so a vertical unit arrives as 0.7776 of a screen unit and a flat
 * horizontal one as sin(0.68) = 0,629 (Z-03, Z-06). At the operating measure of
 * 12,75 px per world unit, the crown therefore lands 4,15 px above the slab and
 * the seat's 0,62 units of depth land 4,97 px — both over the 2 px the step
 * demands of anything a reader is supposed to aim at.
 */
export const SEAT = {
  /** Length along the kerb. A resident is 0,42 wide at the coat, so two fit. */
  laenge: 1.6,
  /** Depth across the kerb, between the tower field and the kerb stone. */
  tiefe: 0.62,
  /** Top of the seat, above ground. `FIGURE.hipY` is 0,70 standing. */
  kronenY: 0.6,
  /** Top of the plot slab — the seat stands on it, not in it. */
  slabY: 0.18,
  /**
   * Centre distance from the tower field's edge into the kerb margin. The
   * margin is 0,95 wide (kerb stone centre 1,1 minus its half-width 0,15), the
   * seat eats 0,31 of it from its centre, so 0,48 leaves 0,16 to the stone and
   * 0,17 to the field. The band lies outside the stone at 1,35 and is never
   * touched.
   */
  randAbstand: 0.48,
  /**
   * Half the widest nameplate in world units — as a pre-filter only. Both
   * brackets were measured on the demo (`sitz-marke-messung.json`): the six
   * plates are 62,2 … 116,8 Px wide, and the same 1,6-unit bench crown arrived as
   * 15, 14, 10 and 9 Px, so the district's scale runs 9,4 … 5,63 Px per unit
   * across the overview's depth. At 4,58 (= 116,8 ÷ 2 ÷ 12,75) one bench of four
   * sat 100 % under its plate; at 10,4 (= 116,8 ÷ 2 ÷ 5,63) the demo loses every
   * bench. No world constant decides a screen rectangle, so the projection in
   * `District.tsx` has the last word.
   */
  plaketteHalbeWelt: 4.58,
  /** Smallest plot that carries a seat. Below this, nothing is invented. */
  minField: 4,
} as const;

export type SeatPlacement = { x: number; z: number; y: number };

/**
 * Where a district's seat stands, in the plot's local space.
 *
 * Left end at the field's own left edge, in the kerb margin on the near side —
 * the side the presentation camera stands at (`stripRowZ` documents it). The
 * other spots on that margin are taken: the nameplate hangs at the near centre
 * (`z = d/2 + 2.2`) outside the kerb, the group strip row stands inside the
 * field at `d/2 − 0,6 − barD/2`, and the podium marker holds the far right
 * corner. Along the near margin, starting from the left keeps the seat clear of
 * both the plate and the side stones on every plot the layout can produce.
 */
export function seatPlacement(w: number, d: number): SeatPlacement | null {
  if (!(w > 0 && d > 0) || !Number.isFinite(w + d)) return null;
  if (w < SEAT.minField || d < SEAT.minField) return null;
  // Die rechte Kante der Bank muss links von der eigenen Plakette bleiben, sonst
  // liegt das Ziel unter einem Schild und ist kein Ziel. Auf Schmal-Platten gibt
  // es deshalb keine Bank — gemessen, nicht geraten.
  if (-(w / 2) + SEAT.laenge > -SEAT.plaketteHalbeWelt) return null;
  return {
    x: -(w / 2) + SEAT.laenge / 2,
    y: SEAT.slabY,
    z: d / 2 + SEAT.randAbstand,
  };
}

function quad(
  pos: number[],
  col: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  color: THREE.Color,
): void {
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

/**
 * The seat as one closed box: crown in the kerb's own tone, four flanks and the
 * underside in the world's casing ink. Both colours are existing `ENV` tokens,
 * which is what keeps `design-tokens` at its budget.
 *
 * Which layer carries which edge is measured, and the first build failed it:
 * with `ENV.curb` as the flanks the seat sat 2,02:1 on its own slab — under the
 * ≥2,5:1 the world sets for every edge — and with `ENV.plotEdge` as the crown
 * three of the 97 palette tones were carried by *neither* layer (the SCSS,
 * Kotlin and mineral façades, at 2,33 / 2,39 / 2,41). The pair that
 * carries everything: ink frame, kerb crown. The frame measures 13,37:1 on the
 * plot, 12,56:1 on the ground, 6,63:1 on the kerb stone; the crown against that
 * frame is 6,63:1; and over all 97 tones the weakest edge any background can
 * offer is 2,71:1. One cost is on record: the crown IS the kerb tone, so the
 * seat's top measures 1,00:1 against the stone behind it — the outline carries
 * that edge, exactly as it does on the chosen tower.
 */
export function seatGeometry(krone: string | THREE.Color = ENV.curb): THREE.BufferGeometry | null {
  const hx = SEAT.laenge / 2;
  const hz = SEAT.tiefe / 2;
  const top = SEAT.kronenY - SEAT.slabY;
  if (!(top > 0)) return null;
  const crown = new THREE.Color(krone);
  const flank = new THREE.Color(ENV.arcCasing);
  const pos: number[] = [];
  const col: number[] = [];
  // Local origin is the seat's footing, so the placement's y is the ground.
  quad(pos, col, [-hx, top, -hz], [-hx, top, hz], [hx, top, hz], [hx, top, -hz], crown);
  quad(pos, col, [-hx, 0, -hz], [hx, 0, -hz], [hx, top, -hz], [-hx, top, -hz], flank);
  quad(pos, col, [hx, 0, hz], [-hx, 0, hz], [-hx, top, hz], [hx, top, hz], flank);
  quad(pos, col, [hx, 0, -hz], [hx, 0, hz], [hx, top, hz], [hx, top, -hz], flank);
  quad(pos, col, [-hx, 0, hz], [-hx, 0, -hz], [-hx, top, -hz], [-hx, top, hz], flank);
  quad(pos, col, [-hx, 0, -hz], [-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], flank);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
