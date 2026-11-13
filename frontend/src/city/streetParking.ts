/**
 * Cars standing at the kerb.
 *
 * The moving traffic is the cab and the bus; the street itself stays empty at
 * overview because those two are smaller than a lane dash at that distance.
 * A parked car is a still object, so it can sit on the same road and read at
 * the whole-level distance without a simulation: one deterministic row along
 * the kerb, clear of the junction mouths, capped so a large level spends
 * instances rather than draw calls.
 *
 * Pure on purpose: the layout and the paint can be measured without a renderer.
 */

import type { StreetLine } from "./layout";

/** The kerb line's distance from the street centre (see sidewalks). */
const KERB = 2.18;
/** A parked car's centre, leaving the body between the lane and the stone. */
const PARKED_OFFSET = KERB - 1.32;
/** A car is 3.4 long; a 12-unit stretch can hold one without eating the mouth. */
const MIN_SPOT_LENGTH = 12;
/** One car per 22 world units of street, at most two per line. */
const SPOT_STEP = 22;
const MAX_PARKED = 40;

export interface ParkedCar {
  x: number;
  z: number;
  /** Yaw so the body points along the kerb. */
  rotY: number;
  /** Index into the paint list, not a colour: the caller owns the palette. */
  paint: number;
  /** Body length; the row varies it so a kerb does not read as a stamp. */
  length: number;
}

type ParkingLayout = Pick<
  { buildings: unknown[]; blocks: unknown[]; streets: StreetLine[] },
  "buildings" | "blocks" | "streets"
>;

/**
 * Where the parked row may stand. The two-file level has no street life to
 * dress yet, so it stays bare; every larger level gets the row.
 */
export function parkedCars(layout: ParkingLayout): ParkedCar[] {
  // A wrapper level can hold its files in child blocks and have no plaza
  // buildings of its own; the row belongs to every level with a real street
  // life, not merely to a folder that happens to contain files directly.
  if (layout.buildings.length < 3 && layout.blocks.length < 2) return [];
  const out: ParkedCar[] = [];
  layout.streets.forEach((line, li) => {
    const dx = line.x2 - line.x1;
    const dz = line.z2 - line.z1;
    const len = Math.hypot(dx, dz);
    if (len < MIN_SPOT_LENGTH) return;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const rotY = -Math.atan2(uz, ux);
    const spots = Math.max(1, Math.min(2, Math.floor(len / SPOT_STEP)));
    // A one-sided plaza lane has pavement on +normal only; parking on the
    // other side would put the car through the facade it serves.
    const sides = line.oneSided ? [1] : [1, -1];
    for (let i = 0; i < spots; i++) {
      const t = 0.22 + ((i + 0.5) / spots) * 0.56;
      const side = sides[(li + i) % sides.length]!;
      out.push({
        x: line.x1 + dx * t + nx * PARKED_OFFSET * side,
        z: line.z1 + dz * t + nz * PARKED_OFFSET * side,
        rotY,
        paint: (li * 17 + i * 7) % 5,
        length: 3.1 + ((li * 13 + i * 7 + 3) % 8) * 0.1,
      });
    }
  });
  return out.slice(0, MAX_PARKED);
}

/** Muted body paints; none of them is a language or a severity colour. */
export const PARKED_PAINT = ["#7f8c99", "#63727f", "#9b9184", "#556677", "#8a6f6a"] as const;

/** The one glazing tone, kept out of the DOM components' inline-hex budget. */
export const PARKED_GLASS = "#202a36";

/** Tyre/underbody tone, same reason. */
export const PARKED_TYRE = "#151b25";
