import { describe, expect, it } from "vitest";
import {
  footCycle,
  GAIT_RATE,
  PERSONAL_PUSH,
  pivotMarch,
  ramp,
  socialStep,
  strideAmplitude,
  strideBlend,
  type SocialNeighbor,
  type SocialStep,
} from "../src/city/epheGait";

/**
 * The citizens already walk the sidewalk graph and their stride is driven by
 * DISTANCE travelled, not by a clock — so they never moonwalk. What gave them
 * away was the edges: a figure jumped from standing to mid-stride in one frame,
 * froze with its legs apart when it arrived, pivoted on stiff legs at a corner,
 * and reached full speed instantly. Four tells, all of them about change of
 * state rather than about the walk itself.
 */
describe("a stride eases in and out", () => {
  it("starts from the ground, not from the middle of a step", () => {
    // The first frame of walking may not carry more stride than one frame of
    // ramp allows — that jump is exactly what reads as a twitch.
    let blend = 0;
    const first = strideBlend(blend, true, 1 / 60);
    expect(first).toBeLessThan(0.1);
    blend = first;
    expect(blend).toBeGreaterThan(0);
  });

  it("reaches a full stride within a quarter second of walking", () => {
    let blend = 0;
    for (let i = 0; i < 15; i++) blend = strideBlend(blend, true, 1 / 60);
    expect(blend).toBeGreaterThanOrEqual(0.95);
  });

  it("brings the feet home when the figure stops, instead of freezing apart", () => {
    let blend = 1;
    for (let i = 0; i < 20; i++) blend = strideBlend(blend, false, 1 / 60);
    expect(blend).toBeCloseTo(0, 5);
  });

  it("does not care how the frames are cut", () => {
    const many = (() => {
      let b = 0;
      for (let i = 0; i < 30; i++) b = strideBlend(b, true, 1 / 120);
      return b;
    })();
    const few = (() => {
      let b = 0;
      for (let i = 0; i < 15; i++) b = strideBlend(b, true, 1 / 60);
      return b;
    })();
    expect(Math.abs(many - few)).toBeLessThan(0.08);
  });
});

describe("speed is reached, not switched on", () => {
  it("moves toward the target by at most its acceleration per second", () => {
    expect(ramp(0, 1, 6, 1 / 60)).toBeCloseTo(0.1, 5);
    expect(ramp(0, 1, 6, 1 / 60) * 60).toBeLessThanOrEqual(6.001);
  });

  it("never overshoots the target", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = ramp(v, 1, 6, 1 / 30);
    expect(v).toBe(1);
    let w = 1;
    for (let i = 0; i < 200; i++) w = ramp(w, 0, 8, 1 / 30);
    expect(w).toBe(0);
  });
});

describe("a turn on the spot still costs a step", () => {
  it("keeps the legs moving while the body pivots", () => {
    const a = pivotMarch(0);
    const b = pivotMarch(1.2);
    expect(a).not.toBe(b);
    expect(Math.abs(b)).toBeLessThanOrEqual(0.45);
    // smaller than a walking stride, so the pivot never looks like a sprint
    expect(Math.abs(b)).toBeLessThan(1);
  });
});

describe("personal space", () => {
  const step = (): SocialStep => ({ pushX: 0, pushZ: 0, pace: 1 });
  const at = (x: number, z: number, angle = 0, moving = false): SocialNeighbor => ({
    x,
    z,
    angle,
    moving,
  });

  it("leaves a lone walker alone", () => {
    const out = socialStep(0, 0, 0, [], step());
    expect(out.pushX).toBe(0);
    expect(out.pushZ).toBe(0);
    expect(out.pace).toBe(1);
  });

  it("sends two people meeting head-on to opposite sides", () => {
    const a = socialStep(0, 0, 0, [at(0, 0.5, Math.PI, true)], step());
    const b = socialStep(0, 0.5, Math.PI, [at(0, 0, 0, true)], step());
    expect(a.pushX, "the walker facing +z steps to its right, +x").toBeGreaterThan(0);
    expect(b.pushX, "the walker facing -z steps to its right, -x").toBeLessThan(0);
    // Oncoming is a pass, not a queue: neither is slowed.
    expect(a.pace).toBe(1);
    expect(b.pace).toBe(1);
  });

  it("eases behind a resident walking the same way, but the leader keeps pace", () => {
    const rear = socialStep(0, 0, 0, [at(0, 0.5, 0, true)], step());
    const leader = socialStep(0, 0.5, 0, [at(0, 0, 0, true)], step());
    expect(rear.pace).toBeLessThan(1);
    expect(leader.pace).toBe(1);
  });

  it("slows and steps around someone standing in the way", () => {
    const out = socialStep(0, 0, 0, [at(0, 0.4, 0, false)], step());
    expect(out.pace).toBeLessThan(1);
    expect(out.pushX).toBeGreaterThan(0);
  });

  it("steps away from a standing resident on either side", () => {
    const right = socialStep(0, 0, 0, [at(0.3, 0.4, 0, false)], step());
    const left = socialStep(0, 0, 0, [at(-0.3, 0.4, 0, false)], step());
    expect(right.pushX, "someone on the right pushes the walker left").toBeLessThan(0);
    expect(left.pushX, "someone on the left pushes the walker right").toBeGreaterThan(0);
  });

  it("does not shove the leader for a follower behind", () => {
    const leader = socialStep(0, 0.5, 0, [at(0, 0, 0, true)], step());
    expect(leader.pushX).toBe(0);
    expect(leader.pushZ).toBe(0);
    expect(leader.pace).toBe(1);
  });

  it("caps the side-step when several residents surround a walker", () => {
    const crowd = [at(0.2, 0, 0, false), at(-0.2, 0, 0, false), at(0, 0.3, 0, false)];
    const out = socialStep(0, 0, 0, crowd, step());
    expect(Math.hypot(out.pushX, out.pushZ)).toBeLessThanOrEqual(PERSONAL_PUSH + 1e-9);
    expect(out.pace).toBeLessThan(1);
  });
});

describe("a planted foot holds its ground", () => {
  const tall = 1;
  const width = 1;
  const amp = strideAmplitude(tall, width);

  it("moves back exactly as far as the body moves forward during stance", () => {
    // gait advances `distance * GAIT_RATE / tall`, so a half cycle covers
    // π · tall / GAIT_RATE of ground. The foot has to cancel all of it.
    let worst = 0;
    for (let i = 0; i <= 100; i++) {
      const phase = (i / 100) * Math.PI;
      const body = (phase * tall) / GAIT_RATE;
      const foot = footCycle(phase, 1, amp).z * width;
      worst = Math.max(worst, Math.abs(body + foot - amp));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("keeps the stance foot down and lifts the swing foot", () => {
    const stance = footCycle(Math.PI / 2, 1, amp);
    const swing = footCycle(Math.PI / 2, -1, amp);
    expect(stance.lift).toBe(0);
    expect(swing.lift).toBeGreaterThan(0.05);
    // the knee leads only the leg that is in the air
    expect(swing.kneeLead).toBeGreaterThan(stance.kneeLead);
    // both feet are down at the handover, the way a walk has double support
    expect(footCycle(0, 1, amp).lift).toBe(0);
    expect(footCycle(0, -1, amp).lift).toBe(0);
  });

  it("crosses the handover without a jump in the foot position", () => {
    const a = footCycle(Math.PI - 1e-6, 1, amp);
    const b = footCycle(Math.PI + 1e-6, 1, amp);
    const c = footCycle(Math.PI * 2 - 1e-6, 1, amp);
    const d = footCycle(0, 1, amp);
    expect(Math.abs(a.z - b.z)).toBeLessThan(1e-5);
    expect(Math.abs(c.z - d.z)).toBeLessThan(1e-5);
  });

  it("scales the local step with height and width", () => {
    expect(strideAmplitude(1.2, 1)).toBeGreaterThan(strideAmplitude(0.8, 1));
    expect(strideAmplitude(1, 1.5)).toBeLessThan(strideAmplitude(1, 0.8));
  });
});
