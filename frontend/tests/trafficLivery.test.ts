import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  buildOpenWorld,
  distanceToSegment,
  OPEN_WORLD_REACH,
  STOP_BOARD,
  TAXI_LIVERY,
  TRANSIT_LIVERY,
  VEHICLE_BOXES,
  VEHICLE_WHEELS,
} from "../src/city/openWorldStreets";
import { CURB_OFFSET } from "../src/city/sidewalks";
import { ENV, SEVERITY_COLOR, SEVERITY_CVD_COLOR } from "../src/city/palette";

/**
 * Street furniture is not allowed to speak the alarm channel.
 *
 * The product's one colour promise is that red/orange/yellow in this city means
 * "a finding" — rooftop beacons, window pulses, landmark shapes. Traffic used to
 * wear `#e8503c`, which is the brand red AND `ENV.selection`: a bus idling next
 * to a building read as "on fire" or "selected", and neither is true. These are
 * the guards that keep the road calm, plus the two geometry guards for the road
 * paint that now runs out past the grid instead of ending in a blunt cut.
 */

// ── CIE76 ΔE in Lab — enough to say "not the same colour at a glance" ──────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lab(hex: string): [number, number, number] {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255);
  // sRGB → XYZ (D65)
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Everything the product paints as "this is a finding". */
const ALARM_COLORS: Array<[string, string]> = [
  ...Object.entries(SEVERITY_COLOR).map(([k, v]): [string, string] => [k, v]),
  ...Object.entries(SEVERITY_CVD_COLOR).map(([k, v]): [string, string] => [`CVD ${k}`, v]),
];

/** The painted parts of the two vehicles, and the sign that serves them. */
const PAINTED: Array<{ what: string; color: string }> = [
  ...VEHICLE_BOXES.map((p) => ({ what: `${p.vehicle} body`, color: p.color })),
  ...VEHICLE_WHEELS.map((w) => ({ what: `${w.vehicle} wheel`, color: w.color })),
  { what: "stop board", color: STOP_BOARD.color },
];

/** ΔE below which two colours are read as the same colour on a small object. */
const SAME_COLOUR = 25;

describe("the traffic livery", () => {
  it("stays out of the alarm band, at every severity and in both palettes", () => {
    for (const part of PAINTED) {
      for (const [name, alarm] of ALARM_COLORS) {
        expect(
          deltaE(part.color, alarm),
          `${part.what} (${part.color}) reads as ${name}`,
        ).toBeGreaterThanOrEqual(SAME_COLOUR);
      }
    }
  });

  it("stays out of the selection colour, so a parked bus is never a picked file", () => {
    for (const part of PAINTED) {
      expect(
        deltaE(part.color, ENV.selection),
        `${part.what} (${part.color}) collides with ENV.selection`,
      ).toBeGreaterThanOrEqual(SAME_COLOUR);
    }
  });

  it("keeps the brand red out of the street entirely", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/city/openWorldStreets.ts"),
      "utf-8",
    );
    const body = src.slice(src.indexOf("export const VEHICLE_BOXES"));
    expect(body, "the brand red is back in the vehicle table").not.toContain(
      ENV.selection.toLowerCase(),
    );
  });

  it("keeps the two roles apart by colour as well as by size", () => {
    expect(deltaE(TAXI_LIVERY, TRANSIT_LIVERY)).toBeGreaterThanOrEqual(SAME_COLOUR);
  });

  it("gives the stop sign the livery of the bus it serves", () => {
    expect(STOP_BOARD.color).toBe(TRANSIT_LIVERY);
  });

  it("keeps the speech ink out of the alarm band too", () => {
    // Two citizens talking is the calmest thing that happens in this city, and
    // the bubble used to draw its glyphs in the brand red — the same colour the
    // selection marker and the P0 alarm wear.
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    const ink = /export const BUBBLE_INK = "(#[0-9a-f]{6})"/i.exec(src);
    expect(ink, "the bubble no longer names its ink").not.toBeNull();
    for (const [name, alarm] of ALARM_COLORS) {
      expect(deltaE(ink![1]!, alarm), `the speech glyph reads as ${name}`).toBeGreaterThanOrEqual(
        SAME_COLOUR,
      );
    }
    expect(
      deltaE(ink![1]!, ENV.selection),
      "the speech glyph is the selection colour",
    ).toBeGreaterThanOrEqual(SAME_COLOUR);
    const bubble = src.slice(
      src.indexOf("function drawBubble"),
      src.indexOf("export function Pedestrians"),
    );
    expect(bubble, "the bubble painted itself red again").not.toContain(
      ENV.selection.toLowerCase(),
    );
  });

  it("leaves every vehicle part matte: no glow channel on the road", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    // A glowing vehicle competes with the alarm beacons, which are the only
    // thing in this city allowed to emit light as a signal.
    expect(src, "the crowd or its traffic grew an emissive channel").not.toMatch(/emissive/i);
  });
});

// ── the road runs out instead of ending in a cut ───────────────────────────

const world = buildOpenWorld();
describe("the painted road", () => {
  it("closes the grid: no carriageway has a free end", () => {
    // The blunt cut was the defect: a road that stops on bare ground reads as a
    // broken model. Every endpoint of every street now lands on another street.
    for (const s of world.streets) {
      const ends: Array<[number, number]> = [
        [s.x1, s.z1],
        [s.x2, s.z2],
      ];
      for (const [x, z] of ends) {
        const onward = world.streets.filter((o) => o !== s && distanceToSegment(x, z, o) < 0.01);
        expect(onward.length, `a road ends free at (${x}, ${z})`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps the beltway on the grid's reach, so bounds and parcels do not move", () => {
    const belt = world.streets.filter((s) =>
      Math.abs(s.z1 - s.z2) < 0.01
        ? Math.abs(s.z1) === OPEN_WORLD_REACH
        : Math.abs(s.x1) === OPEN_WORLD_REACH,
    );
    expect(belt.length, "the ring is not a closed square").toBe(4);
    expect(world.bounds).toBeCloseTo(OPEN_WORLD_REACH + CURB_OFFSET, 6);
  });

  it("never paints a plot pad under the beltway shoulder", () => {
    // Two curb bands do not fit in the 5 units between the last inner street and
    // the ring: that band is a shoulder, and a pad there would sit under paving.
    for (const p of world.parcels) {
      expect(p.x2 - p.x1, "a degenerate parcel").toBeGreaterThanOrEqual(2);
      expect(p.z2 - p.z1, "a degenerate parcel").toBeGreaterThanOrEqual(2);
      for (const q of world.parcels) {
        if (q === p) continue;
        const overlap =
          Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > 0 &&
          Math.min(p.z2, q.z2) - Math.max(p.z1, q.z1) > 0;
        expect(overlap, "two parcels overlap").toBe(false);
      }
    }
  });

  it("runs the kerb with the asphalt to the same end, on every street", () => {
    const kerbs = world.plates.filter((p) => p.color === ENV.curb);
    const asphalt = world.plates.filter((p) => p.color === ENV.road);
    expect(asphalt.length).toBe(world.streets.length);
    for (const a of asphalt) {
      // a carriageway alone, with no kerb beside it, is a runway
      const span = a.w - 3.4;
      const beside = kerbs.filter(
        (k) =>
          Math.abs(k.w - span) < 1e-6 &&
          Math.abs(Math.abs(k.rotY) - Math.abs(a.rotY)) < 1e-6 &&
          Math.abs(Math.hypot(k.x - a.x, k.z - a.z) - CURB_OFFSET) < 1e-3,
      );
      expect(beside.length, `a road of span ${span.toFixed(1)} has ${beside.length} kerbs`).toBe(2);
    }
  });
});

// ── the queue at the stop refills faster than the bus clears it ────────────

describe("the bus stop queue", () => {
  const crowd = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
    "utf-8",
  );
  const refill = /S\.tStopRefill = ([\d.]+) \+ Math\.random\(\) \* ([\d.]+)/.exec(crowd);

  it("refills on a tick short enough that the stop is rarely empty", () => {
    expect(refill, "the refill tick is no longer a plain interval").not.toBeNull();
    const lo = Number(refill![1]);
    const hi = lo + Number(refill![2]);
    // Measured: at 6–12 s somebody was waiting in 45.8% of frames — the bus
    // served an empty stop. The ceiling is what the browser measurement now
    // has to clear 90% occupancy with.
    expect(hi, "the stop empties between buses").toBeLessThanOrEqual(5);
    expect(lo).toBeGreaterThan(0);
  });

  it("still caps the queue at the three slots the kerb has", () => {
    expect(crowd).toContain("waiting < 3");
  });

  it("serves the stop from its own blocks", () => {
    // The mechanism behind the measured number: someone stood at the sign in
    // 45.8% of frames before the queue was tuned, 90.1% after the tick was
    // tightened AND the dispatch started picking the nearest walker. A stop
    // that draws its passengers from wherever the crowd happens to be spends
    // the whole dispatch walking, which the beltway made worse on purpose.
    const refill = crowd.slice(crowd.indexOf("// ── stop refill"));
    expect(refill.slice(0, 1400), "the queue stopped being fed by nearby walkers").toContain(
      "nearestWalker(",
    );
    expect(refill.slice(0, 1400)).not.toContain("randomVisibleWalker");
  });
});
