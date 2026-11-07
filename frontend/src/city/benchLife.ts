/**
 * The benches a level can offer, and which of them a resident may take.
 *
 * A bench is not a new object: it is the seat `seatPlacement` already puts on
 * a district plot, moved into world space. This module only names those places
 * and applies the one eligibility rule the scene can prove — a bench is free
 * when its own `visible` flag is true and no other resident has already claimed
 * its id. Everything else (route, pause, pose) stays in the crowd.
 */

import type { BlockPlacement } from "./layout";
import { seatPlacement } from "./seatSurface";

export interface BenchSpot {
  /** Stable for the plot, not for the frame. */
  id: string;
  /** World-space centre of the seat. */
  x: number;
  z: number;
  y: number;
  /** The district's own answer: the bench is not under its nameplate. */
  visible: boolean;
}

/** One bench per plot that is big enough for one; the rest invent nothing. */
export function collectBenches(blocks: readonly BlockPlacement[]): BenchSpot[] {
  const out: BenchSpot[] = [];
  for (const block of blocks) {
    const seat = seatPlacement(block.w, block.d);
    if (!seat) continue;
    out.push({
      id: block.dir.path || block.dir.name,
      x: block.x + seat.x,
      z: block.z + seat.z,
      y: seat.y,
      visible: true,
    });
  }
  return out;
}

/**
 * The nearest free bench that is visible from `from`. Ties break on id so the
 * same crowd and the same level always pick the same bench.
 */
export function freeBenchNear(
  benches: readonly BenchSpot[],
  claimed: ReadonlySet<string>,
  from: { x: number; z: number },
): BenchSpot | null {
  let best: BenchSpot | null = null;
  let bestDistance = Infinity;
  for (const bench of benches) {
    if (!bench.visible || claimed.has(bench.id)) continue;
    const distance = Math.hypot(bench.x - from.x, bench.z - from.z);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && bench.id < best.id)
    ) {
      best = bench;
      bestDistance = distance;
    }
  }
  return best;
}
