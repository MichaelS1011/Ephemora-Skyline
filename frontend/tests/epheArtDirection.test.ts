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

  it("raises the greeting hand above the stroll, and only on one side", () => {
    const idle = pose();
    writeEpheLimbPose(idle, 0, 1, "idle");
    const greet = pose();
    writeEpheLimbPose(greet, 0, 1, "greet", 0.4);
    expect(greet.handY).toBeGreaterThan(idle.handY + 0.5);
    expect(greet.handZ).toBeGreaterThan(0); // in front of the body, not behind
    expect(greet.handX).toBeGreaterThan(0);
    // the other arm keeps hanging: a wave, not a jumping jack
    const other = pose();
    writeEpheLimbPose(other, 0, -1, "greet", 0.4);
    expect(other.handY).toBe(idle.handY);
  });

  it("keeps faces and jackets visible without assigning residents a finding colour", () => {
    for (const shell of EPHE_PALETTE.shells) {
      expect(contrast(shell, EPHE_PALETTE.visor)).toBeGreaterThan(7);
    }
    for (const jacket of EPHE_PALETTE.jackets) {
      expect(contrast(jacket, ENV.ground)).toBeGreaterThan(2);
    }
    const paints: readonly string[] = [
      ...EPHE_PALETTE.jackets,
      ...EPHE_PALETTE.shells,
      EPHE_PALETTE.helmet,
      EPHE_PALETTE.visor,
      EPHE_PALETTE.boots,
    ];
    for (const alarm of [...Object.values(SEVERITY_COLOR), ...Object.values(SEVERITY_CVD_COLOR)]) {
      expect(paints).not.toContain(alarm);
    }
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
