import type { StreetLine } from "./layout";
import { CURB_OFFSET } from "./sidewalks";

/** One streetlight on a kerb, with the arm direction pointing over the road. */
export interface StreetLamp {
  x: number;
  z: number;
  rotY: number;
  /** Unit vector from the pole toward the carriageway. */
  ax: number;
  az: number;
}

/** One blocky street tree, scaled around its own trunk. */
export interface StreetTree {
  x: number;
  z: number;
  rotY: number;
  s: number;
}

const LAMP_PITCH = 16;
const LAMP_LIMIT = 160;
const TREE_PITCH = 10;
const TREE_LIMIT = 140;

/** Lamps alternate kerbs and keep a deterministic jitter along each street. */
export function planStreetLamps(streets: ReadonlyArray<StreetLine>): StreetLamp[] {
  const items: StreetLamp[] = [];
  streets.forEach((s, li) => {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 6) return;
    const ux = (s.x2 - s.x1) / len;
    const uz = (s.z2 - s.z1) / len;
    const nx = -uz;
    const nz = ux;
    const rotY = -Math.atan2(uz, ux);
    const count = Math.floor(len / LAMP_PITCH);
    for (let i = 0; i <= count; i++) {
      const side = (li + i) % 2 === 0 ? 1 : -1;
      const t = count > 0 ? i / count : 0.5;
      const jitter = (((li * 73 + i * 31) % 100) / 100 - 0.5) * 2.4;
      const t2 = Math.min(Math.max(t + jitter / len, 0.08), 0.92);
      items.push({
        x: s.x1 + (s.x2 - s.x1) * t2 + nx * (CURB_OFFSET + 0.2) * side,
        z: s.z1 + (s.z2 - s.z1) * t2 + nz * (CURB_OFFSET + 0.2) * side,
        rotY,
        ax: -nx * side,
        az: -nz * side,
      });
    }
  });
  return items.slice(0, LAMP_LIMIT);
}

/** Trees sit a little deeper into the pavement than the lamp poles. */
export function planStreetTrees(streets: ReadonlyArray<StreetLine>): StreetTree[] {
  const items: StreetTree[] = [];
  streets.forEach((s, li) => {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 8) return;
    const ux = (s.x2 - s.x1) / len;
    const uz = (s.z2 - s.z1) / len;
    const nx = -uz;
    const nz = ux;
    const count = Math.floor(len / TREE_PITCH);
    for (let i = 0; i < count; i++) {
      const side = (li + i) % 2 === 0 ? -1 : 1;
      const t = (i + 0.5) / count;
      const jitter = (((li * 41 + i * 17) % 100) / 100 - 0.5) * 0.7;
      items.push({
        x: s.x1 + (s.x2 - s.x1) * t + nx * (CURB_OFFSET + 0.65) * side + nx * jitter,
        z: s.z1 + (s.z2 - s.z1) * t + nz * (CURB_OFFSET + 0.65) * side + nz * jitter,
        rotY: (((li * 97 + i * 53) % 100) / 100) * Math.PI * 2,
        s: 0.8 + ((li * 29 + i * 13) % 45) / 100,
      });
    }
  });
  return items.slice(0, TREE_LIMIT);
}

export interface LampArm {
  x: number;
  z: number;
  headX: number;
  headZ: number;
  rotY: number;
}

/** Arm centre and lantern centre relative to the pole. */
export function lampArm(lamp: Pick<StreetLamp, "x" | "z" | "ax" | "az">): LampArm {
  return {
    x: lamp.x + lamp.ax * 0.31,
    z: lamp.z + lamp.az * 0.31,
    headX: lamp.x + lamp.ax * 0.64,
    headZ: lamp.z + lamp.az * 0.64,
    rotY: Math.atan2(-lamp.az, lamp.ax),
  };
}

export interface TreeTint {
  /** Hue offset in turns, small enough to stay one green family. */
  hue: number;
  /** Lightness offset applied to the crown and the crown top. */
  light: number;
}

/** Deterministic per-tree tint; five hues and five lightness steps repeat. */
export function treeTint(index: number): TreeTint {
  return {
    hue: (((index * 7) % 5) - 2) * 0.006,
    light: (((index * 13) % 5) - 2) * 0.025,
  };
}
