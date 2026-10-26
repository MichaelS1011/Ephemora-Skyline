import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { calledGesture, owesWave, WAVE_REPEAT_S, WAVE_HOLD_S } from "../src/city/residentGreeting";
import { calledSnapAngle } from "../src/components/Pedestrians";
import * as THREE from "three";

/**
 * The rule behind the wave. `Pedestrians` asks it once a second and waves when
 * it says yes, so this file holds the arithmetic — the offer, the stage and the
 * twenty seconds — and the crowd file holds the projection that decides *which*
 * resident is visible enough to wave at.
 */
describe("how long the crowd waves for an unanswered offer", () => {
  it("owes a wave after twenty idle seconds, and not before", () => {
    expect(owesWave("open", false, 20, 0)).toBe(true);
    expect(owesWave("open", false, 19.9, 0)).toBe(false);
  });

  it("counts the interval from the last wave, not from the arrival", () => {
    expect(owesWave("open", false, 34, 20)).toBe(false);
    expect(owesWave("open", false, 40, 20)).toBe(true);
  });

  it("stops when the reader takes the offer or closes the card", () => {
    for (const offer of ["taken", "closed"] as const) {
      expect(owesWave(offer, false, 10_000, 0), offer).toBe(false);
    }
  });

  it("stops while a guided flow, an open file or a called resident owns the stage", () => {
    expect(owesWave("open", true, 10_000, 0)).toBe(false);
  });

  it("waves for less than a twentieth of the repeat, so two never overlap", () => {
    expect(WAVE_HOLD_S).toBeLessThan(WAVE_REPEAT_S);
  });
});

/**
 * MASTER-2027 §04.08 — the greeting the reader starts by clicking.
 *
 * Before this step a called resident greeted for as long as their card stayed
 * open: a wave on a timer nobody set. The rule now holds it to `WAVE_HOLD_S`, the
 * same hold the crowd's autonomous wave already uses, and hands the arms back to
 * the finding when the reader points at one.
 */
describe("how long a called resident greets", () => {
  // A click at second 10 puts the deadline at 10 + WAVE_HOLD_S, which is what
  // the caller in `Pedestrians` writes.
  const START = 10;
  const UNTIL = START + WAVE_HOLD_S;

  it("greets while the hold lasts and stops when it is over", () => {
    expect(calledGesture(false, UNTIL, START)).toBe("greet");
    expect(calledGesture(false, UNTIL, UNTIL - 0.01)).toBe("greet");
    expect(calledGesture(false, UNTIL, UNTIL)).toBe("idle");
    expect(calledGesture(false, UNTIL, 400)).toBe("idle");
  });

  it("is exactly the crowd's own hold, not a second number for the same gesture", () => {
    expect(calledGesture(false, UNTIL, START + WAVE_HOLD_S)).toBe("idle");
    expect(calledGesture(false, UNTIL, START + WAVE_HOLD_S - 0.01)).toBe("greet");
  });

  it("points at an open finding before it greets — the card asked for the arm", () => {
    expect(calledGesture(true, UNTIL, START)).toBe("point");
    expect(calledGesture(true, UNTIL, 400)).toBe("point");
  });

  it("never greets on its own when reduced motion left the deadline at zero", () => {
    // The simulation clock does not run there, so a deadline set on it would
    // never pass. The caller leaves the field at 0, and 0 has already passed.
    expect(calledGesture(false, 0, 0)).toBe("idle");
    expect(calledGesture(false, 0, 12_000)).toBe("idle");
  });
});

/**
 * K1 — what the call still does when the clock is frozen.
 *
 * `Pedestrians` holds `dt` at 0 under `prefers-reduced-motion`
 * (frontend/src/components/Pedestrians.tsx:1947), and the called figure's turn
 * is a ramp over `dt` (:2602). With the wave already off (:1071) that left the
 * resident the reader picked showing the back of its head, so the only cue that
 * a call had landed was the gold ring — 1.39:1 on the plaza, measured in
 * `SELECTION_RING`. The answer is not to animate anything there: it is to set
 * the azimuth the ramp was aiming at, once, at the moment the reader clicks.
 *
 * No browser and no clock: the azimuth is arithmetic on the figure's and the
 * lens's ground position, and the direction convention is the one the loop
 * already uses (`atan2(dx, dz)`, forward = (sin a, cos a)), so a figure's own
 * forward vector says whether it looks at the lens.
 */
describe("the called figure faces the lens when reduced motion froze its turn", () => {
  const FIGURE_AT = { x: 3, z: -4 };
  const LENS = { x: 0, z: 10 };
  /** The azimuth the loop's `called` branch already computes as `want`. */
  const want = Math.atan2(LENS.x - FIGURE_AT.x, LENS.z - FIGURE_AT.z);

  it("lands the forward vector on the lens, not 90 degrees past it", () => {
    const angle = calledSnapAngle(true, want - Math.PI, FIGURE_AT, LENS);
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);
    const toLensX = LENS.x - FIGURE_AT.x;
    const toLensZ = LENS.z - FIGURE_AT.z;
    const len = Math.hypot(toLensX, toLensZ);
    expect((fwdX * toLensX + fwdZ * toLensZ) / len).toBeCloseTo(1, 12);
  });

  it("is the whole turn in one step from any starting azimuth", () => {
    // The ramp would close 4·dt rad per frame; at dt = 0 that is nothing, and a
    // half-measure would leave the same unreadable back of the head.
    for (const before of [0, Math.PI, -Math.PI / 2, want + 2.6, want - Math.PI]) {
      expect(calledSnapAngle(true, before, FIGURE_AT, LENS)).toBeCloseTo(want, 12);
    }
  });

  it("is a fixed point, so repeating the call moves nothing", () => {
    // No interpolation term exists in the result: the frame after the snap holds
    // the same number, which is what makes this a snap and not an animation.
    const once = calledSnapAngle(true, 0, FIGURE_AT, LENS);
    expect(calledSnapAngle(true, once, FIGURE_AT, LENS)).toBe(once);
  });

  it("leaves the angle alone while motion is allowed — the ramp owns that turn", () => {
    // Writing the target here would teleport a body the reader can see walking.
    for (const before of [0, 1.2, -2.9, want]) {
      expect(calledSnapAngle(false, before, FIGURE_AT, LENS)).toBe(before);
    }
  });

  it("stays a figure facing a lens when the lens is behind the figure", () => {
    const behind = calledSnapAngle(true, 0, { x: 0, z: 0 }, { x: 0, z: -5 });
    expect(behind).toBeCloseTo(Math.PI, 12);
    // and the result is always a plain azimuth
    expect(Math.abs(behind)).toBeLessThanOrEqual(Math.PI);
  });

  it("happens at the call, never in the frame loop", () => {
    const src = readFileSync(
      new URL("../src/components/Pedestrians.tsx", import.meta.url),
      "utf-8",
    );
    // the select effect is the one-shot home: it runs on the reader's click
    const effect = src.slice(
      src.indexOf("const previousSelected"),
      src.indexOf("previousSelected.current = selectedResident"),
    );
    expect(effect).toContain("calledSnapAngle(");
    // ...and the signal is the gate: only the frozen clock gets the snap
    expect(effect).toMatch(/calledSnapAngle\(\s*prefersReducedMotion\(\)/);
    // no per-frame write: the loop keeps ramping, nothing snaps forever
    expect(src.slice(src.indexOf("useFrame((state, delta)"))).not.toContain("calledSnapAngle(");
    expect(src).toMatch(/e\.angle \+= Math\.max\(-4 \* dt, Math\.min\(4 \* dt, diff\)\);/);
  });
});

/**
 * G3 follow-up — the body row turns with the head.
 *
 * The browser round that accepted the snap read "the body mesh" as the first
 * instanced mesh whose material carries roughness 0.85. That mesh had 665
 * instances (item4b's own inventory: `665/24v/0.85`, a 24-vertex box) while the
 * crowd it was probing was six figures deep (`6/117v/0.85` body, `6/117v/0.78`
 * head). The 665-row box is street paint — the zebra of `RoadSystem.tsx`, which
 * `CityTree.tsx` renders before `<Pedestrians>` so a scene-wide `find` lands on
 * it first — and road paint never turns: yaw -90 in both modes, rowsTurned 0,
 * and a figure "position" (106.6, 0.58) that is not the selected resident's
 * (63.64, 108.97). The 73.3° that "never closes" is the angle of a crosswalk
 * stripe to the lens.
 *
 * The crowd's own body row is written from the very field the snap and the ramp
 * own: `Pedestrians.tsx` composes the body matrix with `e.angle` in the yaw
 * channel (:2786-2801) and writes the head with the same, untouched rotation
 * two lines later (:2801-2811). So the head reading that DID land (0.2° in the
 * click frame) is the body reading, row for row. This block re-measures that as
 * instance arithmetic and guards the write sites, so the next probe cannot read
 * a stripe and call it a citizen.
 */
describe("the called figure's body row faces the lens with its head", () => {
  const deg = (rad: number) => (rad * 180) / Math.PI;
  const rad = (d: number) => (d * Math.PI) / 180;
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  /** The azimuth stored in an instance matrix, the way three.js lays a Y
   *  rotation out (te[0] = cos, te[8] = sin) — the extraction item4c used. */
  const matrixYawDeg = (m: THREE.Matrix4) => deg(Math.atan2(m.elements[8], m.elements[0]));
  /** The body write (:2786-2801): posture tilt, yaw = e.angle, and the figure's
   *  own fat-uneven scale. x and z carry the same `fat`, so the column scales
   *  cancel in atan2 and the extraction returns the yaw itself. */
  const bodyRowYawDeg = (angle: number, fat: number, tall: number) => {
    const dummy = new THREE.Object3D();
    dummy.rotation.set(Math.sin(1.1 + 0.4) * 0.02, angle, 0);
    dummy.scale.set(fat, tall, fat);
    dummy.updateMatrix();
    return matrixYawDeg(dummy.matrix);
  };
  // The probe's own numbers, rebuilt as instance arithmetic: resident index 3
  // at want -16.7°, a row pointing -90° — the 73.3° error the round reported.
  const AT = { x: 0, z: 0 };
  const WANT_DEG = -16.7;
  const LENS = { x: Math.sin(rad(WANT_DEG)), z: Math.cos(rad(WANT_DEG)) };
  const START_DEG = -90;

  it("re-measures the finding: the before-frame error is the reported 73.3 deg", () => {
    expect(wrap(WANT_DEG - START_DEG)).toBeCloseTo(73.3, 1);
  });

  it("under reduce the body row sits on the lens azimuth in the click frame", () => {
    // The write line the click runs (:1077): the snap owns the reduced case.
    const angle = calledSnapAngle(true, rad(START_DEG), AT, LENS);
    expect(wrap(deg(angle) - WANT_DEG)).toBeCloseTo(0, 6);
    // ...and the same field, composed by the body write site, arrives at the
    // matrix the camera sees: zero error in the click frame, no ramp frame yet.
    expect(wrap(bodyRowYawDeg(angle, 1.2, 0.9) - WANT_DEG)).toBeCloseTo(0, 6);
  });

  it("with motion allowed the body row reaches the lens on the loop's ramp", () => {
    // :1077 hands the turn to the ramp — the snap returns the angle untouched.
    let angle = calledSnapAngle(false, rad(START_DEG), AT, LENS);
    expect(deg(angle)).toBeCloseTo(START_DEG, 9);
    // The `called` branch (:2596-2602) verbatim: same want convention (:2598)
    // as the snap, 4 rad/s over dt = 1/60. 73.3° = 1.280 rad ⇒ 20 frames.
    const want = Math.atan2(LENS.x - AT.x, LENS.z - AT.z);
    const dt = 1 / 60;
    const step = () => {
      let diff = want - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
    };
    for (let f = 0; f < 19; f++) step();
    expect(Math.abs(wrap(bodyRowYawDeg(angle, 1.2, 0.9) - WANT_DEG))).toBeGreaterThan(0.5);
    step();
    expect(Math.abs(wrap(bodyRowYawDeg(angle, 1.2, 0.9) - WANT_DEG))).toBeLessThan(0.01);
    // a fixed point: the ramp keeps writing the same angle, so it holds there
    const held = angle;
    for (let f = 0; f < 60; f++) step();
    expect(angle).toBe(held);
  });

  it("guards the body write site: e.angle is the yaw channel of the row", () => {
    const src = readFileSync(
      new URL("../src/components/Pedestrians.tsx", import.meta.url),
      "utf-8",
    );
    // dt = 0 under reduce freezes the ramp but the matrices keep being written
    expect(src).toMatch(/const dt = prefersReducedMotion\(\) \? 0 : Math\.min\(delta, 0\.1\);/);
    // the click writes the snap into the same field the body row reads (:1077)
    expect(src).toContain(
      "e.angle = calledSnapAngle(prefersReducedMotion(), e.angle, e, camera.position);",
    );
    // the body instance matrix carries e.angle in the yaw slot: the
    // rotation.set whose third argument list ends in `e.angle, 0,` before the
    // bodies write, and nothing re-rotates the dummy between that write and
    // the head write — one angle drives both rows, row for row.
    const bodyWrite = src.indexOf("bodies.setMatrixAt(i,");
    const headWrite = src.indexOf("heads.setMatrixAt(i,");
    expect(bodyWrite).toBeGreaterThan(-1);
    expect(headWrite).toBeGreaterThan(bodyWrite);
    const rotStart = src.lastIndexOf("dummy.rotation.set(", bodyWrite);
    expect(rotStart).toBeLessThan(bodyWrite);
    expect(src.slice(rotStart, bodyWrite)).toMatch(/e\.angle,\n\s+0,\n\s+\);/);
    expect(src.slice(bodyWrite, headWrite)).not.toContain("dummy.rotation.set(");
    // the ramp owns the allowed turn (:2596-2602), aiming at the same lens
    const called = src.slice(
      src.indexOf('else if (e.mode === "called") {'),
      src.indexOf('else if (e.mode === "guide") {'),
    );
    expect(called).toContain("e.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));");
    expect(called).toContain("Math.atan2(camera.position.x - e.x, camera.position.z - e.z)");
    // no second mechanism was added for the body: the snap is called once
    expect(src.match(/calledSnapAngle\(/g)).toHaveLength(2); // definition + call
  });

  it("names the mesh the probe actually read: 0.85 hits street paint first", () => {
    const crowd = readFileSync(
      new URL("../src/components/Pedestrians.tsx", import.meta.url),
      "utf-8",
    );
    const streets = readFileSync(
      new URL("../src/components/RoadSystem.tsx", import.meta.url),
      "utf-8",
    );
    const tree = readFileSync(new URL("../src/components/CityTree.tsx", import.meta.url), "utf-8");
    // the crowd's coat is the ONE 0.85 material inside Pedestrians (bodyRef),
    expect(crowd.match(/roughness=\{0\.85\}/g)).toHaveLength(1);
    // while RoadSystem ships two box paints at 0.85 (the zebra and the wheels)
    // whose box geometry has 24 vertices — the 665-instance mesh of the inventory —
    expect(streets.match(/roughness=\{0\.85\}/g)).toHaveLength(2);
    // and CityTree renders the street before the crowd, so a scene-wide
    // "first mesh with roughness 0.85" walks into the crosswalk, not the figure.
    expect(tree.indexOf("<RoadSystem")).toBeLessThan(tree.indexOf("<Pedestrians"));
  });
});
