import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  armSwing,
  footCycle,
  GAIT_RATE,
  PERSONAL_PUSH,
  PIVOT_STRIDE,
  pivotMarch,
  ramp,
  socialStep,
  strideAmplitude,
  strideBlend,
  UMSEHEN,
  umsehenBogen,
  WAVE,
  waveHeight,
  waveLateral,
  wrapPhase,
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

  /**
   * `pivotMarch` only ever scaled the scalar the body bob uses. The feet are
   * written from `footCycle`, whose amplitude is an argument, and the caller
   * handed it the walking one — so a resident stopped mid-corner to change kerb
   * took a full step on the spot. The fraction has to be a number the FOOT sees,
   * at the size a resident is actually seen: a 20 px resident is 19.05 screen px
   * per local unit across (and 14.82 up — the overview elevation foreshortens
   * the figure's height by cos 0.68 and not its width).
   */
  it("shortens the in-place step to the same fraction the march promised", () => {
    expect(PIVOT_STRIDE).toBeGreaterThan(0);
    expect(PIVOT_STRIDE).toBeLessThan(1);
    expect(PIVOT_STRIDE).toBeCloseTo(0.4, 5); // the amplitude pivotMarch carries
    const walking = strideAmplitude(1, 1);
    // 4.4 px of foot travel peak-to-peak rather than 10.9, on a figure that is
    // not going anywhere
    expect(walking * PIVOT_STRIDE).toBeLessThan(walking * 0.5);
    expect(walking * PIVOT_STRIDE * 2 * 19.053).toBeLessThan(4.5);
    expect(walking * 2 * 19.053).toBeGreaterThan(10);
  });
});

/**
 * The greeting hand is the one motion on a 20 px resident that has to read as
 * INTENT rather than as noise, so its shape lives here where it can be measured
 * against the band's small end instead of against an adjective.
 */
describe("the wave is an arc, not a slide", () => {
  it("swings the hand further than the hand is wide", () => {
    const travel = (WAVE.reach * 2 * 19.053) / (0.075 * 2 * 19.053);
    expect(travel).toBeGreaterThan(1.2);
    expect(WAVE.reach * 2 * 19.053).toBeGreaterThanOrEqual(3.5);
  });

  it("lifts the hand as it brings it in, so the path is not a straight line", () => {
    // Outward and downward are the same quarter of the beat: the correlation of
    // the lateral offset against the height is what distinguishes an arc from a
    // slide along a fixed line.
    const N = 720;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = (i / N) * Math.PI * 2;
      xs.push(waveLateral(p));
      ys.push(waveHeight(p));
    }
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
    const xm = mean(xs);
    const ym = mean(ys);
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < N; i++) {
      num += (xs[i]! - xm) * (ys[i]! - ym);
      dx += (xs[i]! - xm) ** 2;
      dy += (ys[i]! - ym) ** 2;
    }
    expect(num / Math.sqrt(dx * dy)).toBeLessThan(-0.95);
    // and the arc actually has a vertical extent, however small: 0.44 px at the
    // small end of the band, 0.67 px at the large end
    expect(WAVE.dip * 14.815).toBeGreaterThanOrEqual(0.35);
  });

  it("never lets the hand come back down onto the crown", () => {
    let lowest = Infinity;
    for (let i = 0; i < 720; i++) lowest = Math.min(lowest, waveHeight((i / 720) * Math.PI * 2));
    expect(lowest - 1.35).toBeGreaterThanOrEqual(0.08);
    expect(WAVE.centre - WAVE.reach).toBeGreaterThan(0);
  });
});

/**
 * A walk is contralateral: the right hand is back as the right foot comes
 * forward. The legs here are a planted triangle wave that peaks at gait 0 and
 * π, and the arms used to be driven by `sin(gait)`, which peaks at π/2 and 3π/2
 * — so the arms and the legs correlated at r = 0.0000 over a cycle. Not against
 * each other, not with each other: on two separate clocks, with the arms
 * reaching full swing exactly when the legs crossed. That is the number the
 * cosine exists to move.
 */
describe("the arms answer the legs", () => {
  const amp = strideAmplitude(1, 1);

  it("puts each hand back at the instant that side's foot is forward", () => {
    for (const side of [1, -1] as const) {
      const forward = side === 1 ? 0 : Math.PI;
      expect(footCycle(forward, side, amp).z).toBeGreaterThan(amp * 0.99);
      expect(armSwing(forward, side)).toBeLessThan(-0.99);
      const back = forward + Math.PI;
      expect(footCycle(wrapPhase(back), side, amp).z).toBeLessThan(-amp * 0.99);
      expect(armSwing(back, side)).toBeGreaterThan(0.99);
    }
  });

  it("swings the two arms against each other, never together", () => {
    for (let i = 0; i < 24; i++) {
      const p = (i / 24) * Math.PI * 2;
      expect(armSwing(p, 1)).toBeCloseTo(-armSwing(p, -1), 12);
    }
  });

  it("correlates with the planted foot at better than −0.95", () => {
    const N = 3600;
    const sample = (hand: (p: number) => number) => {
      const hs: number[] = [];
      const fs: number[] = [];
      for (let i = 0; i < N; i++) {
        const p = (i / N) * Math.PI * 2;
        hs.push(hand(p));
        fs.push(footCycle(p, 1, amp).z / amp);
      }
      const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      const hm = mean(hs);
      const fm = mean(fs);
      let num = 0;
      let dh = 0;
      let df = 0;
      for (let i = 0; i < N; i++) {
        num += (hs[i]! - hm) * (fs[i]! - fm);
        dh += (hs[i]! - hm) ** 2;
        df += (fs[i]! - fm) ** 2;
      }
      return num / Math.sqrt(dh * df);
    };
    expect(sample((p) => armSwing(p, 1))).toBeLessThan(-0.95);
    // The control: the same measurement on the sine the arms used to run on.
    // It is not "slightly out of phase", it is unrelated to the legs at all.
    expect(Math.abs(sample((p) => -Math.sin(p)))).toBeLessThan(0.02);
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

/**
 * MASTER-2027 §07.11 — the look-around at the end of an errand.
 *
 * The claim being defended is narrow and checkable: one sweep, of an amplitude
 * this world can actually show, that starts when the target is in front of the
 * figure, ends by itself, and does not exist at all when the simulation clock
 * is stopped.
 */
describe("umsehenBogen — the arrival sweep", () => {
  it("starts and ends at exactly zero, and nowhere in between", () => {
    expect(umsehenBogen(0)).toBe(0);
    expect(umsehenBogen(1)).toBe(0);
    // A stopped clock (reduced motion) never leaves progress, and a nonsense
    // progress must not become a nonsense pose.
    for (const f of [-0.4, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 40])
      expect(umsehenBogen(f), `progress ${f}`).toBe(0);
    let ruhe = 0;
    for (let i = 1; i < 1000; i++) if (umsehenBogen(i / 1000) === 0) ruhe += 1;
    expect(ruhe).toBe(0);
  });

  it("turns far enough to be seen at the size a resident is", () => {
    // The face band moves 1,08 px for the ±0,3 rad idle glance, which is why a
    // glance is not the feature. A 0,7 rad shoulder turn takes a silhouette of
    // width w down to w·cos(0,7) = 0,76·w — a quarter of the figure's own width
    // in one frame, at every size the district camera uses.
    const werte = Array.from({ length: 2001 }, (_, i) => umsehenBogen(i / 2000));
    const peak = Math.max(...werte);
    expect(peak).toBeGreaterThanOrEqual(0.7);
    expect(peak).toBeLessThanOrEqual(UMSEHEN.bogen);
    expect(1 - Math.cos(peak)).toBeGreaterThanOrEqual(0.25);
  });

  it("looks left and right by the same amount, and settles without a jolt", () => {
    for (let i = 1; i < 100; i++) {
      const f = i / 100;
      expect(umsehenBogen(f)).toBeCloseTo(-umsehenBogen(1 - f), 9);
    }
    let sprung = 0;
    let vorher = umsehenBogen(0);
    // 60 Hz over the whole sweep: the largest step one frame can take.
    for (let i = 1; i <= Math.round(UMSEHEN.dauer * 60); i++) {
      const jetzt = umsehenBogen(i / (UMSEHEN.dauer * 60));
      sprung = Math.max(sprung, Math.abs(jetzt - vorher));
      vorher = jetzt;
    }
    expect(sprung).toBeLessThan(0.06);
  });

  it("is over: the figure faces its target again", () => {
    expect(umsehenBogen(1 - 1e-9)).toBeLessThan(0.01);
    expect(Math.abs(umsehenBogen(0.999))).toBeLessThan(0.02);
  });
});

describe("the wiring of the arrival sweep", () => {
  const crowd = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
    "utf-8",
  );

  it("runs on simulation time, never on the wall clock", () => {
    // §04.12 learned this the hard way: a loop that reads `Date.now()` keeps
    // moving a scene that reduced motion asked to hold.
    expect(crowd).toContain("e.umsehenSeit = now;");
    const von = crowd.indexOf("§07.11 — arrival is not a full stop");
    const zweig = crowd.slice(von, crowd.indexOf('} else if (e.mode === "enter")'));
    expect(von).toBeGreaterThan(-1);
    expect(zweig.length).toBeGreaterThan(200);
    expect(zweig).not.toContain("Date.now()");
  });

  it("reports the panel on the target, not on the sweep", () => {
    // The sentence must not wait for the look-around to finish, so the arrival
    // test still compares against `want`, and only the turn uses the swept aim.
    expect(crowd).toMatch(/let dreh = want \+ kehr - e\.angle;/);
    expect(crowd).toMatch(
      /if \(Math\.abs\(diff\) < 0\.14\) \{\n\s+const st = useStore\.getState\(\);/,
    );
  });

  it("clears the sweep so a new errand never inherits an old phase", () => {
    expect(crowd).toMatch(
      /\(now - e\.umsehenSeit\) \/ UMSEHEN\.dauer >= 1\)\n?\s*e\.umsehenSeit = null;/,
    );
  });
});
