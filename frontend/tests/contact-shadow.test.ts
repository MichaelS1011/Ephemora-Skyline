// @vitest-environment jsdom
/**
 * The contact shadow: one baked AO pool per building, measured as pixels.
 *
 * Depth in this world comes from a texture, not a light pass (the shadow map
 * cost broke the fps frame once). So the guard measures what the eye must see:
 * the darkest ring sits where the foundation meets the ground and fades to
 * nothing at the pool's rim — and the pool scales with the footprint instead
 * of drowning small files or leaving big ones floating.
 */
import { describe, expect, it } from "vitest";

describe("cavitySpan", () => {
  // imported below after the stub exists
  it("scales with the footprint diagonal", async () => {
    const { cavitySpan } = await import("../src/components/Building");
    // 2×2 still sits on the legibility floor; 8×8 is four times its diagonal
    expect(cavitySpan(2, 2)).toBe(6);
    expect(cavitySpan(8, 8) / cavitySpan(4, 4)).toBeCloseTo(2, 5);
  });

  it("clamps between a legible floor and a block-sized ceiling", async () => {
    const { cavitySpan } = await import("../src/components/Building");
    expect(cavitySpan(0.5, 0.5)).toBe(6);
    expect(cavitySpan(40, 40)).toBe(26);
  });
});

describe("the cavity texture paints an AO ring, not a blob", () => {
  it("darkens toward the centre band and clears at the rim", async () => {
    // render the canvas through a recording context
    const stops: Array<{ o: number; color: string }> = [];
    const origGet = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({
      createRadialGradient() {
        return {
          addColorStop(o: number, color: string) {
            stops.push({ o, color });
          },
        };
      },
      set fillStyle(_v: unknown) {},
      fillRect() {},
    })) as never;
    try {
      const { getCavityTexture } = await import("../src/components/Building");
      getCavityTexture();
    } finally {
      HTMLCanvasElement.prototype.getContext = origGet;
    }
    const alphaOf = (s: string) => Number(s.match(/([\d.]+)\)$/)?.[1] ?? NaN);
    // stop order: transparent core → dark band → feathered rim → clear
    expect(stops.length).toBeGreaterThanOrEqual(4);
    expect(alphaOf(stops[0]!.color), "core stays clear under the slab").toBeLessThan(0.05);
    expect(alphaOf(stops[1]!.color), "band is the darkest point").toBeGreaterThan(0.7);
    expect(alphaOf(stops[stops.length - 1]!.color), "rim fades to nothing").toBeLessThan(0.05);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.o, "stops run outward").toBeGreaterThan(stops[i - 1]!.o);
    }
  });
});
