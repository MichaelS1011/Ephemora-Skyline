import { describe, it, expect } from "vitest";
import { collectBenches, freeBenchNear, type BenchSpot } from "../src/city/benchLife";
import { seatPlacement } from "../src/city/seatSurface";
import type { BlockPlacement } from "../src/city/layout";

function block(path: string, x: number, z: number, w = 24, d = 18): BlockPlacement {
  return { dir: { path, name: path } as BlockPlacement["dir"], x, z, w, d } as BlockPlacement;
}

const bench = (id: string, x: number, z: number, visible = true): BenchSpot => ({
  id,
  x,
  z,
  y: 0.18,
  visible,
});

describe("collectBenches", () => {
  it("turns each seat placement into a world-space bench", () => {
    const benches = collectBenches([block("frontend/src", 10, -4)]);
    const seat = seatPlacement(24, 18)!;
    expect(benches).toEqual([
      { id: "frontend/src", x: 10 + seat.x, z: -4 + seat.z, y: seat.y, visible: true },
    ]);
  });

  it("invents no bench on a plot too small for a seat", () => {
    expect(collectBenches([block("tiny", 0, 0, 8, 12)])).toEqual([]);
  });

  it("keeps one bench per plot, in layout order", () => {
    const benches = collectBenches([block("a", 0, 0), block("b", 30, 0)]);
    expect(benches.map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("freeBenchNear", () => {
  const benches = [bench("a", 0, 0), bench("b", 10, 0), bench("hidden", 1, 0, false)];

  it("skips hidden benches and benches someone already holds", () => {
    expect(freeBenchNear(benches, new Set(["a", "hidden"]), { x: 0, z: 0 })?.id).toBe("b");
  });

  it("picks the nearest free bench", () => {
    expect(freeBenchNear(benches, new Set(["hidden"]), { x: 8, z: 0 })?.id).toBe("b");
  });

  it("returns null when every visible bench is taken", () => {
    expect(freeBenchNear(benches, new Set(["a", "b", "hidden"]), { x: 0, z: 0 })).toBeNull();
  });

  it("breaks a distance tie by id", () => {
    const pair = [bench("z", 5, 0), bench("a", -5, 0)];
    expect(freeBenchNear(pair, new Set(), { x: 0, z: 0 })?.id).toBe("a");
  });
});
