import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { writeEpheLimbPose, FIGURE, type EpheLimbPose } from "../src/components/Pedestrians";
import { ENV, EPHE_PALETTE, SEVERITY_COLOR, SEVERITY_CVD_COLOR } from "../src/city/palette";
import {
  makeWorldSurface,
  surfaceMatrix,
  surfaceNormal,
  surfacePoint,
} from "../src/city/worldSurface";
import { SKY_CLOUD_GAIN, skyCloudBand } from "../src/render/sky";

const pose = (): EpheLimbPose => ({
  footX: 0,
  footY: 0,
  footZ: 0,
  handX: 0,
  handY: 0,
  handZ: 0,
  kneeForward: 0,
});
const luminance = (hex: string): number => {
  const rgb = [1, 3, 5].map((offset) => {
    const s = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
const contrast = (a: string, b: string): number => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("inhabited architectural model", () => {
  /**
   * The figure used to be a torso that reached the floor with a head on top: no
   * leg to bend, so the gait could not read and the silhouette was one blob.
   * These are the numbers a person needs, and the crown is the height
   * `openCityLifeFraming.test.ts` budgets its ≥3 px rule against.
   */
  it("gives a resident a leg, and the leg a knee that leads", () => {
    expect(FIGURE.hipY).toBeGreaterThan(FIGURE.kneeY);
    expect(FIGURE.kneeY).toBeGreaterThan(FIGURE.ankleY);
    // the leg is the lower half of the body, not a stub under a coat
    expect(FIGURE.hipY / FIGURE.crown).toBeGreaterThanOrEqual(0.3);
    expect(FIGURE.headY + FIGURE.headR).toBeCloseTo(FIGURE.crown, 3);
    // the torso ends where the leg begins: no gap, no overlap into the floor
    expect(FIGURE.bodyY - FIGURE.bodyHalf).toBeGreaterThan(FIGURE.hipY - 0.06);
    expect(FIGURE.bodyY - FIGURE.bodyHalf).toBeLessThan(FIGURE.hipY + 0.02);
  });

  it("bends the knee forward on the striding leg and never backwards", () => {
    const p = pose();
    let previous = -1;
    for (let frame = 0; frame < 40; frame++) {
      const stride = Math.sin((frame / 40) * Math.PI * 2);
      writeEpheLimbPose(p, stride, 1, "idle");
      expect(p.kneeForward).toBeGreaterThan(0);
      if (stride > 0.99) {
        expect(p.kneeForward).toBeGreaterThan(previous);
        previous = p.kneeForward;
      }
    }
    const standing = pose();
    writeEpheLimbPose(standing, 0, 1, "idle");
    const striding = pose();
    writeEpheLimbPose(striding, 1, 1, "idle");
    expect(striding.kneeForward).toBeGreaterThan(standing.kneeForward);
  });

  it("keeps the leg a step darker than the coat, so it reads as its own mass", () => {
    const lum = (hex: string) => luminance(hex);
    for (const trousers of EPHE_PALETTE.trousers) {
      for (const jacket of EPHE_PALETTE.jackets) {
        expect(lum(trousers)).toBeLessThan(lum(jacket));
      }
      // and never one of the six grades, in either palette
      for (const severity of [
        ...Object.values(SEVERITY_COLOR),
        ...Object.values(SEVERITY_CVD_COLOR),
      ]) {
        expect(trousers.toLowerCase()).not.toBe(String(severity).toLowerCase());
      }
    }
  });

  it("keeps a planted foot through every stride without sinking the other one", () => {
    const left = pose(),
      right = pose();
    for (let frame = 0; frame < 100; frame++) {
      const stride = Math.sin((frame / 100) * Math.PI * 2);
      writeEpheLimbPose(left, stride, -1, "idle");
      writeEpheLimbPose(right, stride, 1, "idle");
      expect(Math.min(left.footY, right.footY) - 0.075).toBeCloseTo(0.003, 8);
      expect(left.footY - 0.075).toBeGreaterThan(0);
      expect(right.footY - 0.075).toBeGreaterThan(0);
      expect(left.footZ).toBeCloseTo(-right.footZ);
    }
  });

  it("keeps boots planted on the strongest surface at every resident size", () => {
    const surface = makeWorldSurface(240);
    const foot = pose();
    const local = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const ground = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (const size of [0.78, 1, 1.28]) {
      for (const yaw of [0, Math.PI / 2, Math.PI]) {
        writeEpheLimbPose(foot, 0, -1, "idle");
        const x = 130 + foot.footX,
          z = 90 + foot.footZ;
        local.compose(
          new THREE.Vector3(x, foot.footY * size, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
          new THREE.Vector3(0.1, 0.075 * size, 0.17),
        );
        point.set(0, -1, 0).applyMatrix4(surfaceMatrix(surface, local));
        surfacePoint(surface, x, 0, z, ground);
        surfaceNormal(surface, x, z, normal);
        expect(point.sub(ground).dot(normal)).toBeCloseTo(0.003 * size, 6);
      }
    }
  });

  it("distinguishes a conversation from carrying and lifting a building block", () => {
    const idle = pose(),
      chat = pose(),
      carry = pose(),
      lift = pose();
    writeEpheLimbPose(idle, 0, 1, "idle");
    writeEpheLimbPose(chat, 0, 1, "chat");
    writeEpheLimbPose(carry, 0, 1, "carry");
    writeEpheLimbPose(lift, 0, 1, "lift");
    expect(chat.handY).toBeGreaterThan(idle.handY);
    expect(carry.handZ).toBeGreaterThan(chat.handZ);
    expect(lift.handY).toBeGreaterThan(1.1);
    expect(lift.handY).toBeLessThan(1.46); // supports the raised block
    const other = pose();
    writeEpheLimbPose(other, 0, -1, "carry");
    expect(other.handX).toBe(-carry.handX);
    expect(other.handY).toBe(carry.handY);
    expect(other.handZ).toBe(carry.handZ);
  });

  it("raises the greeting hand clear of the head, and only on one side", () => {
    const idle = pose();
    writeEpheLimbPose(idle, 0, 1, "idle");
    const greet = pose();
    writeEpheLimbPose(greet, 0, 1, "greet", 0.4);
    expect(greet.handY).toBeGreaterThan(idle.handY + 0.5);
    expect(greet.handZ).toBeGreaterThan(0); // in front of the body, not behind
    expect(greet.handX).toBeGreaterThan(0);
    // The other arm keeps hanging: a wave, not a jumping jack
    const other = pose();
    writeEpheLimbPose(other, 0, -1, "greet", 0.4);
    expect(other.handY).toBe(idle.handY);
  });

  /**
   * A wave that stays inside the head's own column is not a wave. Round 1
   * measured this at a single scale and reported the raised hand as clearing the
   * crown by 1.1 px; the district camera looks down at 0.68 rad, so a vertical
   * clearance of 0.05 units is 0.86 px there, and the hand SPHERE's near edge
   * sat 0.025 units BELOW the crown line — the hand overlapped the head at every
   * phase. It now clears the crown at every phase of the arc.
   */
  it("puts the waving hand above the crown and gives it a visible swing", () => {
    const crown = pose();
    writeEpheLimbPose(crown, 0, 1, "greet", 0);
    let lowest = Infinity;
    let leftmost = Infinity;
    let rightmost = -Infinity;
    for (let f = 0; f < 200; f++) {
      const p = pose();
      writeEpheLimbPose(p, 0, 1, "greet", (f / 200) * 4);
      lowest = Math.min(lowest, p.handY);
      leftmost = Math.min(leftmost, p.handX);
      rightmost = Math.max(rightmost, p.handX);
      // the hand never crosses to the other side of the body
      expect(p.handX).toBeGreaterThan(0);
    }
    // clears the top of the head even at the bottom of its arc, and even for the
    // sphere's near edge: 1.46 − 0.075 against a 1.35 crown
    expect(lowest - 0.075 - FIGURE.crown).toBeGreaterThanOrEqual(0.03);
    // and travels far enough to be a motion and not a rounding error. The
    // sample grid does not land exactly on the extremes of the arc, so the
    // measured 0.19 is 0.19 units of travel to two decimal places.
    expect(rightmost - leftmost).toBeGreaterThanOrEqual(0.185);
    // the hand clears the shoulder line and the head beside it, so the arm is
    // its own mass rather than a bump on the skull
    expect(crown.handX).toBeGreaterThanOrEqual(FIGURE.headR + FIGURE.shoulderWidth);
    // and at the inner end of its travel it still does not touch the skull
    expect(leftmost - 0.075).toBeGreaterThan(FIGURE.headR);
  });

  it("keeps faces and jackets visible without assigning residents a finding colour", () => {
    // The skull is the dark mass and the skin band the light face inside it.
    // Both directions are pinned: the head has to separate from the pale world
    // (see `ephe-readability.test.ts` for those numbers) and the face from the
    // head it is set into, or the resident has no front. The floor moved from 7
    // to 9 with the hair tones, because the two edges are one ratio apart, not
    // a trade-off.
    for (const shell of EPHE_PALETTE.shells) {
      for (const hair of EPHE_PALETTE.hair) {
        expect(contrast(shell, hair)).toBeGreaterThan(9);
      }
    }
    for (const jacket of EPHE_PALETTE.jackets) {
      expect(contrast(jacket, ENV.ground)).toBeGreaterThan(2);
    }
    const paints: readonly string[] = [
      ...EPHE_PALETTE.jackets,
      ...EPHE_PALETTE.sleeves,
      ...EPHE_PALETTE.shells,
      ...EPHE_PALETTE.hair,
      ...EPHE_PALETTE.trousers,
      EPHE_PALETTE.helmet,
      EPHE_PALETTE.eyes,
      EPHE_PALETTE.boots,
    ];
    for (const alarm of [...Object.values(SEVERITY_COLOR), ...Object.values(SEVERITY_CVD_COLOR)]) {
      expect(paints).not.toContain(alarm);
    }
  });

  /**
   * The coat is a lathe profile, not a capsule, and the profile is the waist.
   * Two rules keep it honest: it has to end on a FLAT hem (otherwise the coat
   * fades into the legs over its own radius and the hem is a gradient), and it
   * has to be widest at that hem and narrow all the way to the collar (otherwise
   * it is a ball again).
   */
  it("tapers the coat from a flat hem to a collar the head can sit on", () => {
    const profile = FIGURE.coat;
    expect(profile[0]![1]).toBe(-FIGURE.bodyHalf);
    expect(profile[profile.length - 1]![1]).toBe(FIGURE.bodyHalf);
    expect(profile[0]![0]).toBe(0); // closed at the centre line
    expect(profile[profile.length - 1]![0]).toBe(0);
    // the hem is a flat face: two consecutive points at the same height
    expect(profile[1]![1]).toBe(profile[0]![1]);
    // and from the hem up, every step is narrower than the one below it
    for (let i = 1; i < profile.length - 1; i++) {
      expect(profile[i + 1]![0]).toBeLessThanOrEqual(profile[i]![0]);
    }
    // the widest point is the hem, and it is the value the readability floors use
    expect(Math.max(...profile.map((p) => p[0]))).toBe(FIGURE.bodyR);
    // the collar is narrow enough that the head reads as a head on a body
    expect(profile[profile.length - 2]![0]).toBeLessThan(FIGURE.headR);
    // and the legs clear it: hip joint plus thigh sits inside the hem's radius
    expect(FIGURE.hipWidth + 0.075).toBeLessThan(FIGURE.bodyR - 0.04);
  });

  /**
   * The cap is the same hair family as the skull it covers — one value for the
   * figure's identity mass — and it is drawn in the crowd's existing limb pass.
   * A second hair colour would split the head into two values inside a 3.8 px
   * column, which is the mistake the previous block of this palette made.
   */
  it("keeps the cap one value with the skull and under the crown", () => {
    expect(FIGURE.headY + FIGURE.capY + FIGURE.capUp).toBeLessThanOrEqual(FIGURE.crown);
    // the face band is the only light thing on the head, and it is below the cap
    expect(FIGURE.faceY + FIGURE.faceUp).toBeLessThan(FIGURE.capY + FIGURE.capUp);
    expect(FIGURE.faceY - FIGURE.faceUp).toBeGreaterThan(-FIGURE.headR - 0.01);
  });
});

describe("quiet daylight cloud banks", () => {
  it("keeps the horizon seam and zenith clear", () => {
    expect(skyCloudBand(-1)).toBe(0);
    expect(skyCloudBand(0)).toBe(0);
    expect(skyCloudBand(1)).toBe(0);
    expect(skyCloudBand(0.3)).toBe(1);
  });

  it("limits the cloud contribution to a soft, continuous band", () => {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const value = skyCloudBand(i / 1000) * SKY_CLOUD_GAIN;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.12);
      expect(Math.abs(value - previous)).toBeLessThan(0.002);
      previous = value;
    }
  });
});
