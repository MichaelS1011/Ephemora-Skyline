// @vitest-environment node
/**
 * Everything a resident has to say, measured at the only sizes it is ever said.
 *
 * Round 1 of this lane derived one scale from a 30 px premise and quoted it for
 * every feature. That premise had an arithmetic hole in it, and the operator's
 * second measurement found it: the district camera does not look at a resident
 * from the front, it looks DOWN at `WORLD_OVERVIEW_ELEVATION` = 0.68 rad, so
 * the figure's own height is foreshortened by cos(0.68) = 0.7776 while its width
 * is not. One px/unit cannot describe both, and the number round 1 called
 * "30 px" was the camera range at which a resident is 23.3 px tall.
 *
 * So this file carries TWO scales and BOTH ends of the measured band:
 *
 *   resident height on the plate   px per local unit, UP   px per unit, ACROSS
 *   20 px (the static luminance profile)      14.815                 19.053
 *   30 px (the top of the motion-diff band)   22.222                 28.579
 *
 * and every floor below is checked at 20 px as well as at 30 px, because a
 * change that only pays off at the wide end is a change made for a camera the
 * district shot does not use.
 *
 * Selecting a resident does not bring the camera nearer (`called` stops the
 * walker and turns it), so there is no close-up state in which finer detail
 * would ever be visible. That is the whole brief: a feature that needs more
 * resolution than 20 px is not a feature, it is a cost.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as THREE from "three";
import {
  CONTACT_PATCH_Y,
  FIGURE,
  LIMB_SLOTS,
  SELECTION_RING,
  SWAY,
  writeEpheLimbPose,
  type EpheLimbPose,
} from "../src/components/Pedestrians";
import { ENV, EPHE_PALETTE } from "../src/city/palette";
import { buildOpenWorld } from "../src/city/openWorldStreets";
import { WORLD_FOV_DEG, WORLD_OVERVIEW_ELEVATION } from "../src/city/worldFraming";

const VIEW = { w: 1600, h: 1000 };
/** The measured band: a resident is 20 px tall at the far end of a district and
 *  30 px at the near end. Both ends are checked; neither is a "typical". */
const BAND = [20, 30] as const;
const COS = Math.cos(WORLD_OVERVIEW_ELEVATION);
/** Ground-plane features are seen at the overview's elevation, so a circle
 *  lands on screen as an ellipse squashed by this factor. */
const SQUASH = Math.sin(WORLD_OVERVIEW_ELEVATION);

/** Screen pixels per world unit at a camera `range` units from the subject,
 *  measured along the camera's own right axis — the HORIZONTAL scale. */
function pxPerUnitAcross(range: number): number {
  const cam = new THREE.PerspectiveCamera(WORLD_FOV_DEG, VIEW.w / VIEW.h, 0.5, 1600);
  cam.position.set(0, 0, range);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const o = new THREE.Vector3(0, 0, 0).project(cam);
  const r = new THREE.Vector3(1, 0, 0).project(cam);
  return Math.abs(r.x - o.x) * 0.5 * VIEW.w;
}

/**
 * The two scales one measured figure height implies. `up` is what a vertical
 * world unit costs on the plate; `across` is what a horizontal one costs. The
 * ratio between them is the overview elevation's cosine and nothing else, so
 * this is derived from the camera, not fitted to a frame.
 */
function scales(heightPx: number): { up: number; across: number; range: number } {
  const up = heightPx / FIGURE.crown;
  const across = up / COS;
  return {
    up,
    across,
    range: 1 / (across / (VIEW.h / (2 * Math.tan(THREE.MathUtils.degToRad(WORLD_FOV_DEG) / 2)))),
  };
}
const S = scales;

/** The pose helper's scratch object. */
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
  const c = [1, 3, 5].map((o) => {
    const s = parseInt(hex.slice(o, o + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
};
const contrast = (a: string, b: string): number => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Worst case across two families — a crowd draws from all of them. */
const worst = (a: readonly string[], b: readonly string[]): number =>
  Math.min(...a.flatMap((x) => b.map((y) => contrast(x, y))));

describe("the measurement basis", () => {
  it("puts the horizontal scale where the camera's own projection puts it", () => {
    // The analytic scale and three.js's projection have to agree at the range
    // each end of the band implies; if they do not, this file is describing a
    // camera the app does not build.
    for (const h of BAND) {
      expect(pxPerUnitAcross(S(h).range)).toBeGreaterThan(S(h).across * 0.99);
      expect(pxPerUnitAcross(S(h).range)).toBeLessThan(S(h).across * 1.01);
    }
  });

  it("keeps both ends of the band inside the ranges the district camera flies to", () => {
    // `fitWorldPoints` starts at 24 units and grows with the plot cloud, so a
    // range below 24 would describe a camera nobody uses and one far above 80
    // would describe an overview in which no resident is legible at all.
    expect(S(20).range).toBeGreaterThan(45);
    expect(S(20).range).toBeLessThan(65);
    expect(S(30).range).toBeGreaterThan(28);
    expect(S(30).range).toBeLessThan(45);
  });

  it("states the two scales the round-1 report collapsed into one", () => {
    expect(S(20).up).toBeCloseTo(14.815, 2);
    expect(S(20).across).toBeCloseTo(19.053, 2);
    expect(S(30).up).toBeCloseTo(22.222, 2);
    expect(S(30).across).toBeCloseTo(28.579, 2);
    // The number round 1 quoted as "22.2 px per unit, from the 30 px
    // measurement" is the HORIZONTAL scale of a camera whose resident is 23.3 px
    // tall — neither end of the real band.
    expect(23.3 / FIGURE.crown / COS).toBeCloseTo(22.19, 1);
  });

  /**
   * The operator's static luminance profile of one resident at middle depth:
   * the figure occupies rows 362-381 (20 px) and shows internal value steps at
   * 363, 370-373 and 376. Projected through the scales above, the body plan
   * lands on those rows — which is the cross-check that the thing in the frame
   * is this figure and that 20 px is its real height.
   */
  it("lands the profile's internal steps on the body plan's own landmark rows", () => {
    const feet = 382; // the figure's last row is 381, its bottom edge 382
    const row = (units: number): number => feet - units * S(20).up;
    const measured = [363, 371.5, 376];
    const landmarks: [string, number][] = [
      ["hairline", FIGURE.headY + FIGURE.faceY + FIGURE.faceUp],
      ["coat hem", FIGURE.bodyY - FIGURE.bodyHalf],
      ["knee", FIGURE.kneeY],
      ["shoulder line", FIGURE.bodyY + FIGURE.shoulderY],
      ["chin", FIGURE.headY - FIGURE.headR],
      ["boot cuff", FIGURE.ankleY],
    ];
    for (const step of measured) {
      const nearest = landmarks.reduce((a, b) =>
        Math.abs(row(b[1]) - step) < Math.abs(row(a[1]) - step) ? b : a,
      );
      expect(
        Math.abs(row(nearest[1]) - step),
        `row ${step} is nearest the ${nearest[0]} at ${row(nearest[1]).toFixed(1)}`,
      ).toBeLessThan(1);
    }
    // And the reading that goes with it: the third step is the KNEE (376.1),
    // not the boot cuff, which sits at 380.5 — one row off the ground.
    expect(row(FIGURE.kneeY)).toBeCloseTo(376.1, 1);
    expect(row(FIGURE.ankleY)).toBeCloseTo(380.5, 1);
  });
});

for (const h of BAND) {
  const PX = S(h).across;
  const PY = S(h).up;
  describe(`silhouette masses at a ${h} px resident`, () => {
    it("gives the head a mass of its own and the face room to sit in", () => {
      const skull = 2 * FIGURE.headR * PX;
      expect(skull).toBeGreaterThanOrEqual(4);
      // The face band is 69% of the skull's width — the reference image's own
      // ratio is 66% — and it is now the LOWER part of the head, not a belt
      // around its middle.
      expect(2 * FIGURE.faceR * PX).toBeGreaterThanOrEqual(3);
      expect((2 * FIGURE.faceR) / (2 * FIGURE.headR)).toBeGreaterThan(0.6);
      expect((2 * FIGURE.faceR) / (2 * FIGURE.headR)).toBeLessThan(0.8);
      expect(2 * FIGURE.faceUp * PY).toBeGreaterThanOrEqual(2);
    });

    it("splits the head the way the reference image splits it", () => {
      const hairline = FIGURE.headY + FIGURE.faceY + FIGURE.faceUp;
      const head = 2 * FIGURE.headR;
      const hair = (FIGURE.crown - hairline) / head;
      expect(hair).toBeGreaterThan(0.3);
      expect(hair).toBeLessThan(0.45);
      // The hair band is a mass, not a rounding error: 1.41 px at the small end.
      expect((FIGURE.crown - hairline) * PY).toBeGreaterThanOrEqual(1.2);
    });

    it("lets the cap overhang the face band and the skull", () => {
      const bandTop = FIGURE.headY + FIGURE.faceY + FIGURE.faceUp;
      const capBottom = FIGURE.headY + FIGURE.capY - FIGURE.capUp;
      // The cap's lower edge is BELOW the face band's upper edge, so the
      // hairline is an occlusion of the skin and not an adjacency to it.
      expect(bandTop - capBottom).toBeGreaterThan(0.01);
      expect((bandTop - capBottom) * PY).toBeGreaterThanOrEqual(0.25);
      // It is wider than the skull, so the head's silhouette shows a brim.
      expect(FIGURE.capR).toBeGreaterThan(FIGURE.headR);
      expect((FIGURE.capR - FIGURE.headR) * PX).toBeGreaterThanOrEqual(0.3);
      // It stays under the crown: the 1.35 the framing test budgets is a
      // contract, and a hair mesh may not raise it.
      expect(FIGURE.headY + FIGURE.capY + FIGURE.capUp).toBeLessThanOrEqual(FIGURE.crown);
      // And it sits behind the face band's own surface, so the face stays lit.
      expect(FIGURE.capAt + FIGURE.capDip).toBeLessThan(FIGURE.faceAt + FIGURE.faceDip + 0.02);
    });

    it("keeps the coat wider than either arm, and both wider than a pixel", () => {
      expect(2 * FIGURE.bodyR * PX).toBeGreaterThanOrEqual(7);
      // sleeve bone and hand sphere are both 0.15 across
      expect(0.15 * PX).toBeGreaterThanOrEqual(2.8);
    });

    it("gives the hem a ledge in the silhouette, not only in value", () => {
      // The coat's widest point is its hem; the legs' outer edge under it is the
      // hip joint plus the thigh's radius. The step between them is the waist.
      const ledge = (fat: number): number => (FIGURE.bodyR - (FIGURE.hipWidth + 0.075)) * fat * PX;
      expect(ledge(1)).toBeGreaterThanOrEqual(0.9);
      // even the slimmest resident in the population keeps a visible step
      expect(ledge(0.82)).toBeGreaterThanOrEqual(0.7);
      // and the flat hem means the coat does not fade into the legs over its own
      // radius, which is what turned the old hem into a 3-row gradient
      expect(FIGURE.coat[0][1]).toBe(FIGURE.coat[1][1]);
      expect(FIGURE.bodyR - FIGURE.coat[1][0]).toBeLessThan(1e-9);
    });

    it("leaves a gap between the legs a standing figure can show", () => {
      const p = pose();
      writeEpheLimbPose(p, 0, 1, "idle");
      // 0.07 is the shin radius the frame loop writes beside this call
      const gap = 2 * (p.footX - 0.07);
      expect(gap * PX).toBeGreaterThanOrEqual(1.5);
      // The reference image's own inseam gap, scaled to this band, is 0.5 px, so
      // a 2 px floor here was never the bar; 1.5 px still separates two columns.
      expect(gap * PX).toBeLessThan(3.5);
    });

    it("swings an arm far enough to be seen swinging", () => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 64; i++) {
        const p = pose();
        writeEpheLimbPose(p, 0, 1, "idle", 0, (i / 64) * Math.PI * 2, 0.286, 1);
        min = Math.min(min, p.handZ);
        max = Math.max(max, p.handZ);
      }
      expect((max - min) * PX).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe(`the guide gesture at a ${h} px resident`, () => {
    it("holds the waving hand clear of the crown for the whole arc", () => {
      let lowest = Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (let f = 0; f < 240; f++) {
        const p = pose();
        writeEpheLimbPose(p, 0, 1, "greet", (f / 240) * Math.PI * 2);
        lowest = Math.min(lowest, p.handY);
        left = Math.min(left, p.handX);
        right = Math.max(right, p.handX);
      }
      // The hand sphere is 0.075 across, so its NEAR edge — not its centre — has
      // to clear the crown. Round 1 put the centre 0.05 above it, which left the
      // sphere overlapping the head at every phase.
      expect((lowest - 0.075 - FIGURE.crown) * PY).toBeGreaterThanOrEqual(0.5);
      // Sideways travel is the signal: it has to be a multiple of the hand's own
      // width, and it is (3.62 px against a 2.86 px blob at the small end).
      expect((right - left) * PX).toBeGreaterThanOrEqual(3.5);
      expect((right - left) / (0.075 * 2)).toBeGreaterThan(1.2);
      // The arc: the hand also comes DOWN as it goes out, so the path is not a
      // straight slide.
      let high = -Infinity;
      for (let f = 0; f < 240; f++) {
        const p = pose();
        writeEpheLimbPose(p, 0, 1, "greet", (f / 240) * Math.PI * 2);
        high = Math.max(high, p.handY);
      }
      expect((high - lowest) * PY).toBeGreaterThanOrEqual(0.35);
      // And the hand never touches the skull, at the inner end of its travel.
      expect((left - 0.075 - FIGURE.headR) * PX).toBeGreaterThanOrEqual(0.8);
    });

    it("points UP at the tower, not level with the shoulder", () => {
      const p = pose();
      writeEpheLimbPose(p, 0, 1, "point", 0);
      const shoulder = FIGURE.bodyY + FIGURE.shoulderY;
      expect((p.handY - shoulder) * PY).toBeGreaterThanOrEqual(2.5);
      // The reach is fore-aft, so the overview elevation eats it: the worst
      // heading (straight at the camera) keeps only sin(0.68) of it.
      expect(p.handZ * PX * SQUASH).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe(`value edges at a ${h} px resident`, () => {
    /**
     * The arm is the only mass that OVERLAPS another — it hangs in front of the
     * coat — so its edge cannot come from the silhouette and has to come from
     * value. It used to be the jacket's own hex: contrast exactly 1.000, an arm
     * that was not there.
     */
    it("separates each sleeve from the coat it hangs in front of", () => {
      EPHE_PALETTE.sleeves.forEach((sleeve, i) => {
        expect(
          contrast(sleeve, EPHE_PALETTE.jackets[i % EPHE_PALETTE.jackets.length]!),
          `sleeve ${sleeve} against its own jacket`,
        ).toBeGreaterThanOrEqual(1.7);
      });
      expect(worst(EPHE_PALETTE.sleeves, EPHE_PALETTE.jackets)).toBeGreaterThanOrEqual(1.5);
    });

    it("keeps the arm inside the figure without merging it with the leg", () => {
      expect(worst(EPHE_PALETTE.sleeves, [ENV.ground, ENV.plot, ENV.fog])).toBeGreaterThanOrEqual(
        1.7,
      );
      expect(worst(EPHE_PALETTE.sleeves, EPHE_PALETTE.trousers)).toBeGreaterThanOrEqual(2.5);
      expect(worst(EPHE_PALETTE.sleeves, [EPHE_PALETTE.boots])).toBeGreaterThanOrEqual(2.5);
    });

    it("breaks the waist and the ankle, not just the outline", () => {
      expect(worst(EPHE_PALETTE.trousers, EPHE_PALETTE.jackets)).toBeGreaterThanOrEqual(1.4);
      expect(worst(EPHE_PALETTE.trousers, [EPHE_PALETTE.boots])).toBeGreaterThanOrEqual(1.35);
      for (const trouser of EPHE_PALETTE.trousers) {
        expect(luminance(trouser)).toBeGreaterThan(luminance(EPHE_PALETTE.boots));
        for (const jacket of EPHE_PALETTE.jackets) {
          expect(luminance(trouser)).toBeLessThan(luminance(jacket));
        }
      }
    });

    /**
     * Round 1 reported 1.91:1 over asphalt as the honest price of a dark head
     * and left it there. The price was an arithmetic mistake, not a trade: the
     * plaza (0.705) and the asphalt (0.138) are a fixed ratio apart, so for any
     * head tone darker than the road the plaza edge is exactly
     * (ENV.ground+0.05)/(ENV.road+0.05) times the road edge. Darkening the hair
     * therefore moves BOTH edges the same way, and the tones now sit at ≥10.9:1
     * on the plaza and ≥2.73:1 over the road where the old ones sat at 7.7 and
     * 1.91.
     *
     * The road floor is 2.5, the number `worldPicture` and `hudLegibility`
     * demand of every other edge in this world. It read 2.3 until this line was
     * written to the measurement instead of to the rule — a guard set one point
     * below its own subject measures the defect, not the standard.
     */
    it("gives the head an edge with every surface it can float on", () => {
      const ratio = (luminance(ENV.ground) + 0.05) / (luminance(ENV.road) + 0.05);
      expect(ratio).toBeGreaterThan(3.9);
      expect(ratio).toBeLessThan(4.1);
      const skyAndGround = [ENV.ground, ENV.plot, ENV.fog, ENV.crosswalk, ENV.curb];
      expect(worst(EPHE_PALETTE.hair, skyAndGround)).toBeGreaterThanOrEqual(4.9);
      expect(worst(EPHE_PALETTE.hair, [ENV.ground, ENV.plot, ENV.fog])).toBeGreaterThanOrEqual(9);
      expect(worst(EPHE_PALETTE.hair, EPHE_PALETTE.shells)).toBeGreaterThanOrEqual(9);
      expect(worst(EPHE_PALETTE.hair, [ENV.road])).toBeGreaterThanOrEqual(2.5);
      expect(worst([EPHE_PALETTE.eyes], EPHE_PALETTE.shells)).toBeGreaterThanOrEqual(8);
      // The coat is the figure's biggest mass and its weakest edge over asphalt.
      // Pinned here because round 1 asserted the opposite without measuring it.
      expect(worst(EPHE_PALETTE.jackets, [ENV.road])).toBeLessThan(1.1);
    });
  });
}

describe("the figure meets the ground", () => {
  /**
   * The contact patch was drawn at y = 0.016. The kerb boxes are 0.08 tall at
   * y = 0.04 — top 0.08 — and they are painted ON `CURB_OFFSET`, the very line
   * the sidewalk graph puts its nodes on, and the zebra tops out at 0.07. So the
   * patch was depth-clipped by the stone under the figure's own feet.
   */
  it("lifts the patch above every flat thing a resident stands on", () => {
    const plates = buildOpenWorld().plates ?? [];
    expect(plates.length).toBeGreaterThan(0);
    const highest = Math.max(...plates.map((p) => p.y + p.h / 2));
    expect(highest).toBeGreaterThanOrEqual(0.08); // the kerb, not a guess
    expect(CONTACT_PATCH_Y).toBeGreaterThan(highest);
    // and it stays a ground mark: 1.33 px of a 20 px resident
    expect(CONTACT_PATCH_Y * S(20).up).toBeLessThan(2.5);
  });

  it("keeps the patch the width of the stance it sits under", () => {
    const p = pose();
    writeEpheLimbPose(p, 0, 1, "idle");
    const footSpan = 2 * (p.footX + 0.17); // stance half-width plus the boot
    const patch = 2 * 0.3 * 0.95;
    expect(patch / footSpan).toBeGreaterThan(0.9);
    expect(patch / footSpan).toBeLessThan(1.1);
    // even the slimmest resident (fat 0.82) keeps a disc that is not a dot
    expect(0.57 * 0.82 * S(20).across).toBeGreaterThanOrEqual(8);
  });

  it("keeps the selection mark thick enough on the squashed ground plane", () => {
    const band = (SELECTION_RING.outer - SELECTION_RING.inner) * S(20).across;
    expect(band).toBeGreaterThanOrEqual(3);
    // the near and far edges are the ones the elevation foreshortens
    expect(band * SQUASH).toBeGreaterThanOrEqual(2);
    // and the ring stays the size of a person rather than of a block
    expect(2 * SELECTION_RING.outer * S(20).across).toBeLessThan(20);
  });
});

describe("a standing resident is still, not frozen", () => {
  it("moves the head by a third of its own width", () => {
    for (const h of BAND) {
      const head = 2 * FIGURE.headR * S(h).across;
      const drift = 2 * SWAY.idleAmp * SWAY.headGain * S(h).across;
      const torso = 2 * SWAY.idleAmp * S(h).across;
      expect(drift).toBeGreaterThanOrEqual(1.5);
      expect(drift / head).toBeGreaterThan(0.33);
      // The torso alone stays a fraction of the head's travel: the head carries
      // the cue because on a body the sway is a lean over the weight-bearing hip.
      expect(torso).toBeLessThan(drift * 0.7);
      expect(torso).toBeLessThan(1.8);
    }
  });

  it("turns the head far enough for the face to move on the plate", () => {
    // The idle glance used to be ±0.12 rad: 0.37 px of face-band travel at the
    // small end, which is a third of a pixel and therefore not a glance. The
    // band now hangs 0.0475 below the skull's centre and the skull is wider, so
    // the same swing carries 1.07 px, and a corner glance carries 2.2 px.
    const travel = (yaw: number): number => 2 * FIGURE.faceAt * Math.sin(yaw) * S(20).across;
    expect(travel(0.3)).toBeGreaterThanOrEqual(1);
    expect(travel(0.36 + 0.3)).toBeGreaterThanOrEqual(2);
    // and the face never turns so far that the band leaves the skull
    expect(FIGURE.faceAt * Math.sin(0.66) + FIGURE.faceR).toBeLessThan(FIGURE.capR + 0.03);
  });

  it("takes its time doing it", () => {
    expect((2 * Math.PI) / SWAY.idleRate).toBeGreaterThan(9);
  });
});

describe("render cost", () => {
  /**
   * Every change in this pass is a colour, a constant, a profile, or one extra
   * instance in a pass the figure already paid for. The crowd's draw budget is
   * the guard against the next one that is not: a per-figure mesh here would
   * multiply by the whole population, and the hair cap in particular is only
   * allowed because it rides in the limb pass.
   */
  it("keeps the crowd at its eleven instanced draws", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/Pedestrians.tsx"),
      "utf-8",
    );
    expect((src.match(/<instancedMesh/g) ?? []).length).toBe(11);
    expect(LIMB_SLOTS).toBe(11);
    // the cap is a slot, not a mesh: no new <instancedMesh> may name it
    expect(src.match(/<instancedMesh[^>]*ref=\{capRef/g)).toBe(null);
  });
});
