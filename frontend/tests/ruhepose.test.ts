// @vitest-environment node
/**
 * MASTER-2027 §07.12 — the rest pose.
 *
 * A figure that stopped walking used to freeze: feet together, both arms
 * straight down. That is the same posture the city already shows for a resident
 * that has been called and is attending, so a pause read as attention and the
 * square's waiting crowd looked like an audience. A rest pose is the difference
 * between "stopped" and "waiting", and these tests hold the four things that
 * make it one:
 *
 *   1. it is asymmetric — weight on one leg, the other stepped out and forward,
 *      the hands answering each other rather than hanging in parallel;
 *   2. it arrives on a ramp and leaves on the same one, and at blend 0 it IS the
 *      standing pose, so nothing pops;
 *   3. it cannot be mistaken for the greeting or the point — the resting hand
 *      never leaves the hanging height;
 *   4. it costs the crowd nothing: eleven limb slots, eleven instanced passes,
 *      one frame loop, no new colour.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { LIMB_SLOTS, writeEpheLimbPose, type EpheLimbPose } from "../src/components/Pedestrians";
import { STRIDE_RAMP, ramp } from "../src/city/epheGait";

const PEDESTRIANS = readFileSync(
  new URL("../src/components/Pedestrians.tsx", import.meta.url),
  "utf-8",
);

const pose = (): EpheLimbPose => ({
  footX: 0,
  footY: 0,
  footZ: 0,
  handX: 0,
  handY: 0,
  handZ: 0,
  kneeForward: 0,
});

/** stride 0, no gait phase: the standing body the pause would otherwise freeze into. */
const stehend = (side: -1 | 1): EpheLimbPose => {
  const p = pose();
  writeEpheLimbPose(p, 0, side, "idle", 0);
  return p;
};

const ruhend = (side: -1 | 1, blend = 1): EpheLimbPose => {
  const p = pose();
  writeEpheLimbPose(p, 0, side, "rest", 0, undefined, 0.13, 0, blend);
  return p;
};

describe("the rest pose is a stance, not a stop", () => {
  it("puts the weight on one leg and steps the other out and forward", () => {
    const frei = ruhend(1);
    const stand = ruhend(-1);
    const freiVorher = stehend(1);
    // The free foot leaves the standing line sideways AND forward; the support
    // foot does not move, which is what keeps the figure on the ground it stands
    // on rather than sliding.
    expect(frei.footX).toBeGreaterThan(freiVorher.footX);
    expect(frei.footZ).toBeGreaterThan(0.1);
    expect(frei.kneeForward).toBeGreaterThan(stehend(1).kneeForward);
    expect(stand.footX).toBeCloseTo(stehend(-1).footX, 9);
    // -0 and +0 are the same place on the ground; Object.is is not the contract.
    expect(stand.footZ).toBeCloseTo(0, 9);
  });

  it("lets the arms answer each other instead of hanging in parallel", () => {
    const v = ruhend(1);
    const h = ruhend(-1);
    expect(v.handZ).toBeGreaterThan(0);
    expect(h.handZ).toBeLessThan(0);
    expect(v.handZ).not.toBeCloseTo(h.handZ, 6);
    // Both hands stay out of the coat they hang in front of.
    expect(v.handX).toBeGreaterThan(stehend(1).handX);
  });

  it("keeps the resting hand at the hanging height", () => {
    // The greeting raises the hand above the crown and the point levels it with
    // the shoulder. A rest that did either would be the same signal twice.
    for (const side of [-1, 1] as const) {
      expect(ruhend(side).handY).toBe(stehend(side).handY);
    }
    const winkend = pose();
    writeEpheLimbPose(winkend, 0, 1, "greet", 0.5);
    expect(winkend.handY).toBeGreaterThan(ruhend(1).handY);
  });
});

describe("it arrives on a ramp and leaves on the same one", () => {
  it("is the standing pose at blend 0, exactly", () => {
    for (const side of [-1, 1] as const) {
      const a = ruhend(side, 0);
      const b = stehend(side);
      expect(a.footX).toBeCloseTo(b.footX, 9);
      expect(a.footZ).toBeCloseTo(b.footZ, 9);
      expect(a.kneeForward).toBeCloseTo(b.kneeForward, 9);
      expect(a.handZ).toBeCloseTo(b.handZ, 9);
    }
  });

  it("grows with the blend and never overshoots", () => {
    const halbe = ruhend(1, 0.5).footX - stehend(1).footX;
    const ganze = ruhend(1, 1).footX - stehend(1).footX;
    expect(halbe).toBeGreaterThan(0);
    expect(ganze).toBeGreaterThan(halbe);
    // A blend above 1 is the caller's mistake to avoid, but the pose must not
    // fold the foot back through the body if it happens.
    expect(ruhend(1, 1).footX).toBeLessThan(0.5);
  });

  it("takes a quarter of a second at the stride's own rate", () => {
    // The same `ramp` the stride uses, so the pose and the step cannot disagree
    // about how fast a figure changes shape.
    let b = 0;
    let sekunden = 0;
    const dt = 1 / 60;
    while (b < 0.99 && sekunden < 5) {
      b = ramp(b, 1, STRIDE_RAMP, dt);
      sekunden += dt;
    }
    expect(sekunden).toBeLessThanOrEqual(1.2);
    expect(sekunden).toBeGreaterThan(0.2);
  });
});

describe("the gate keeps it a walker's pose", () => {
  it("asks for walk, standstill, no pivot and a pause", () => {
    expect(PEDESTRIANS).toContain(
      'const resting = RUHE_AN && e.mode === "walk" && !moving && !turning && e.pause > 0;',
    );
  });

  it("is on unless the address says otherwise", () => {
    // The switch exists for the measurement, not for the reader: the shipped
    // default is the pose.
    expect(PEDESTRIANS).toContain('get("ruhe") !== "0"');
    expect(PEDESTRIANS).toContain('if (typeof window === "undefined") return true;');
  });

  it("never overrides a greeting, a call, a chat, a job or a guide", () => {
    // `rest` is the last branch of the gesture chain, behind every named mode.
    const zeile = PEDESTRIANS.indexOf(': resting\n                      ? "rest"');
    const kette = PEDESTRIANS.slice(PEDESTRIANS.indexOf("const gesture: EpheGesture ="), zeile);
    for (const andere of ["guide", "called", "greet", "chat", "work", "toSite"]) {
      expect(kette, `${andere} is decided before rest`).toContain(andere);
    }
    expect(zeile).toBeGreaterThan(PEDESTRIANS.indexOf("const resting ="));
  });

  it("ramps the blend in the crowd's own frame loop", () => {
    expect(PEDESTRIANS).toContain(
      "e.restBlend = ramp(e.restBlend, resting ? 1 : 0, STRIDE_RAMP, dt);",
    );
    expect(PEDESTRIANS.match(/useFrame\(/g) ?? []).toHaveLength(1);
  });
});

describe("how wide the stance is, in units and in pixels", () => {
  // The plate could not settle this: with the crowd's pauses drawn from
  // `Math.random()`, the difference between two loads of the SAME build
  // (267…950 px in the figure belt) is larger than the difference between the
  // build with the pose and the build without it (431…1309, ratio 1,13). That
  // is recorded in `ruhe-messung.json` and the step is NOT called proven on the
  // plate. What can be settled without noise is the geometry the renderer is
  // handed, and the pixels it has to arrive in.
  const WEIT = [15.05, 22.0]; // px per world unit at 20 px and 30 px residents

  it("widens the boot pair by 0,16 units", () => {
    const vorher = stehend(1).footX - stehend(-1).footX;
    const nachher = ruhend(1).footX - ruhend(-1).footX;
    expect(vorher).toBeCloseTo(0.24, 6);
    expect(nachher).toBeCloseTo(0.4, 6);
    expect(nachher - vorher).toBeCloseTo(0.16, 6);
  });

  it("lands as at least two pixels of extra width at both ends of the band", () => {
    for (const px of WEIT) expect(0.16 * px).toBeGreaterThanOrEqual(2);
    // …and the free foot forward is the other half of the signal.
    for (const px of WEIT) expect(0.12 * px).toBeGreaterThanOrEqual(1.5);
  });
});

describe("it costs the crowd nothing", () => {
  it("keeps eleven limb slots and eleven instanced passes", () => {
    expect(LIMB_SLOTS).toBe(11);
    expect(PEDESTRIANS.match(/<instancedMesh/g) ?? []).toHaveLength(11);
  });

  it("adds no colour and no allocation per frame", () => {
    const rest = PEDESTRIANS.slice(
      PEDESTRIANS.indexOf('} else if (gesture === "rest") {'),
      PEDESTRIANS.indexOf("  }\n}\n\n/**\n * How many Ephe"),
    );
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(rest).not.toMatch(/new THREE\.|\.push\(/);
  });
});
