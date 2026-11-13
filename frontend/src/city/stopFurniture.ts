import type { Transit } from "./openWorldStreets";
import { ENV } from "./palette";

/** Where the furniture group stands and how its local +Z meets the kerb. */
export interface StopFurniturePose {
  x: number;
  z: number;
  rotY: number;
}

/** One box of the bench/bin/shelter assembly, in group-local metres. */
export interface StopFurniturePart {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
}

/**
 * The furniture group sits just behind the stop sign, on the same kerb normal
 * the sign uses. Local +Z is that normal, so the bench faces the road and the
 * shelter's back panel faces the plot.
 */
export function stopFurniturePose(transit: Transit): StopFurniturePose {
  const len = Math.max(
    Math.hypot(transit.busLane.x2 - transit.busLane.x1, transit.busLane.z2 - transit.busLane.z1),
    0.001,
  );
  const nx = -(transit.busLane.z2 - transit.busLane.z1) / len;
  const nz = (transit.busLane.x2 - transit.busLane.x1) / len;
  return {
    x: transit.stopPoint.x + nx * 0.65,
    z: transit.stopPoint.z + nz * 0.65,
    rotY: Math.atan2(nx, nz),
  };
}

/**
 * The parts are unit-box data rather than one mesh each: the whole stop costs
 * one instanced draw call. A hamlet keeps the bench and bin; a bus line adds a
 * shallow shelter whose roof still stops at the plot edge.
 */
export function stopFurnitureParts(bus: boolean): StopFurniturePart[] {
  const parts: StopFurniturePart[] = [
    // Bench seat and back in the lane-dash tan the street already paints.
    { x: 0, y: 0.43, z: 0.1, w: 2.3, h: 0.1, d: 0.45, color: ENV.laneDash },
    { x: 0, y: 0.72, z: 0.31, w: 2.3, h: 0.52, d: 0.08, color: ENV.laneDash },
    { x: -0.95, y: 0.21, z: 0.1, w: 0.09, h: 0.42, d: 0.4, color: ENV.arcCasing },
    { x: 0.95, y: 0.21, z: 0.1, w: 0.09, h: 0.42, d: 0.4, color: ENV.arcCasing },
    // Bin body and lid.
    { x: 1.7, y: 0.34, z: 0.16, w: 0.3, h: 0.66, d: 0.3, color: ENV.road },
    { x: 1.7, y: 0.69, z: 0.16, w: 0.34, h: 0.06, d: 0.34, color: ENV.curb },
  ];

  if (!bus) return parts;

  return [
    ...parts,
    // Roof, back panel and the two posts that carry it. The roof's far edge is
    // at local z 0.43 — 3.18 m from the lane centre, inside the 3.2 m plot inset.
    { x: 0, y: 2.22, z: 0.1, w: 3.5, h: 0.12, d: 0.66, color: ENV.arcCasing },
    { x: 0, y: 1.22, z: 0.34, w: 3.3, h: 1.8, d: 0.07, color: ENV.road },
    { x: -1.56, y: 1.14, z: 0.3, w: 0.1, h: 2.18, d: 0.1, color: ENV.arcCasing },
    { x: 1.56, y: 1.14, z: 0.3, w: 0.1, h: 2.18, d: 0.1, color: ENV.arcCasing },
  ];
}
