import { describe, expect, it } from "vitest";
import {
  ALT_FLOOR,
  ALT_MIN_CLEARANCE,
  BANNER_W,
  BANK_MAX,
  CITY_TOP,
  CROWN_MAX,
  PASS_REST,
  SPEED,
  TRACK_GAP,
  airshowScaleFor,
  altitudeFor,
  bankFor,
  bannerPixelHeight,
  crownTop,
  lapLength,
  legHalfFor,
  onTrack,
  settledDistance,
  trackAxes,
} from "../src/city/airshowMotion";

/**
 * The airshow's arithmetic.
 *
 * The aircraft has one job — be read — and that makes two properties worth
 * pinning: it must stay above whatever skyline the level raised, and the path it
 * flies must be a track the banner can be read off. The second is the reason the
 * shape is a racetrack: a cloth towed behind an aircraft is read across its
 * flight line, so on a circle half of every lap shows the reader a mirrored
 * address or an edge.
 */

describe("the ceiling belongs to the level, not to one constant", () => {
  it("clears the crown when it flies over the city, and the frame otherwise", () => {
    // Over the skyline the towers win; outside it the show is free to sit where
    // the reader's sky actually is, which is the only way it can be seen at all
    // from a camera aimed down at a city.
    for (const tallest of [0, 4, 12, 34]) {
      expect(altitudeFor(tallest, 0, 0, true), `over city, tallest ${tallest}`).toBeGreaterThan(
        crownTop(tallest),
      );
    }
    expect(altitudeFor(34, 0, 0, true)).toBeGreaterThanOrEqual(CROWN_MAX + ALT_MIN_CLEARANCE);
    expect(altitudeFor(34, 0, 0, true)).toBeLessThan(CITY_TOP);
    expect(altitudeFor(0)).toBe(ALT_FLOOR);
  });

  it("rises with the skyline, and never below the floor", () => {
    // Monotone everywhere, strictly rising only past the floor: a folder with
    // one tall file and a folder with none both have to put the aircraft above
    // the streets, and below that line "higher" would only mean "further away".
    expect(altitudeFor(4, 0, 0, true)).toBeLessThanOrEqual(altitudeFor(12, 0, 0, true));
    expect(altitudeFor(12, 0, 0, true)).toBeLessThan(altitudeFor(34, 0, 0, true));
  });

  it("lengthens the straight as the reader stands further off", () => {
    expect(legHalfFor(200)).toBeGreaterThan(legHalfFor(60));
    // Outside the skyline the level, not the eye, sets the length.
    expect(legHalfFor(60, 200)).toBeGreaterThan(legHalfFor(60, 0));
    expect(legHalfFor(1)).toBeGreaterThanOrEqual(40);
    expect(legHalfFor(100_000)).toBeLessThanOrEqual(420);
  });
});

describe("the track is a straight, a turn, a straight, a turn", () => {
  const legHalf = 120;
  const lap = lapLength(legHalf);

  it("keeps the two straights apart by the gap and the nose along the path", () => {
    const out = onTrack(legHalf, legHalf);
    expect(out.n).toBeCloseTo(TRACK_GAP / 2, 6);
    expect(out.vt).toBeCloseTo(1, 6);
    expect(out.curvature).toBe(0);
    const back = onTrack(2 * legHalf + Math.PI * (TRACK_GAP / 2) + legHalf / 2, legHalf);
    expect(back.n).toBeCloseTo(-TRACK_GAP / 2, 6);
    expect(back.vt).toBeCloseTo(-1, 6);
  });

  it("rolls only where the path bends, and never past the ceiling", () => {
    expect(bankFor(SPEED, 0)).toBe(0);
    const lean = bankFor(SPEED, 1 / (TRACK_GAP / 2));
    expect(lean).toBeGreaterThan(0);
    expect(lean).toBeLessThanOrEqual(BANK_MAX);
  });

  it("returns to where it started, and is continuous across the seam", () => {
    const a = onTrack(0, legHalf);
    const b = onTrack(lap, legHalf);
    expect(a.t).toBeCloseTo(b.t, 6);
    expect(a.n).toBeCloseTo(b.n, 6);
    for (const s of [0, lap / 3, lap * 0.51, lap * 0.9]) {
      const p = onTrack(s, legHalf);
      expect(Math.abs(p.t)).toBeLessThanOrEqual(legHalf + TRACK_GAP / 2 + 0.001);
      expect(Math.abs(p.n)).toBeLessThanOrEqual(TRACK_GAP / 2 + 0.001);
    }
  });

  it("leaves a rest between passes, so nothing circles for an empty room", () => {
    // The lap is the flight; the cycle adds the pause the aircraft spends out of
    // the picture. A lap that filled the whole cycle would be a spinner.
    expect(PASS_REST).toBeGreaterThan(0);
    expect(lapLength(legHalf)).toBeLessThan(lapLength(legHalf) + PASS_REST);
    // The pause is written in travelled units, so a slower aircraft stretches it:
    // at 140 units and 13 u/s the sky would be empty for eleven seconds.
    expect(PASS_REST / SPEED).toBeLessThan(8);
  });

  it("gives a reader the two seconds a towed banner needs", () => {
    // The one number the show exists for: how long the address is in front of a
    // fixed point of the screen. At the speed the first cut shipped with (34)
    // this was 0,76 s — a flicker, not an invitation.
    expect(BANNER_W / SPEED).toBeGreaterThanOrEqual(1.5);
  });
});

describe("the track turns to face the reader", () => {
  it("points the cloth at the camera and runs the straights across it", () => {
    const axes = trackAxes(90, 0, 0, 0);
    expect(axes.nx).toBeCloseTo(1, 6);
    expect(axes.nz).toBeCloseTo(0, 6);
    // Normal and tangent are perpendicular and both unit length.
    expect(axes.nx * axes.tx + axes.nz * axes.tz).toBeCloseTo(0, 9);
    expect(Math.hypot(axes.tx, axes.tz)).toBeCloseTo(1, 9);
  });

  it("keeps a sane frame when the camera stands on the pivot", () => {
    const axes = trackAxes(0, 0, 0, 0);
    expect(Number.isFinite(axes.nx)).toBe(true);
    expect(Math.hypot(axes.nx, axes.nz)).toBeCloseTo(1, 9);
  });

  it("parks the reduced-motion pose mid-leg, not mid-turn", () => {
    const p = onTrack(settledDistance(120), 120);
    expect(p.curvature).toBe(0);
    expect(Math.abs(p.n)).toBeCloseTo(TRACK_GAP / 2, 6);
  });
});

describe("the cloth is big enough to read", () => {
  it("holds its share of the frame at every distance a reader flies", () => {
    // The show scales with the eye distance, so the cloth lands at roughly one
    // height on screen wherever the reader stands — never a wall up close, never
    // a speck in the wide view. That constant is the whole point of EYE_REF.
    const heights = [60, 91, 150, 240].map((d) => bannerPixelHeight(900, d) * airshowScaleFor(d));
    for (const h of heights) expect(h, "apparent height").toBeGreaterThanOrEqual(40);
    expect(Math.max(...heights) / Math.min(...heights)).toBeLessThan(1.25);
  });
});
