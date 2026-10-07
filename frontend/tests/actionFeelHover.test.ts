// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  HOVER,
  HOVER_INK,
  SEAM_COLOUR,
  claimHover,
  colourSpread,
  easeGlow,
  hairlineOpacity,
  inkOpacity,
  pointerOwnerIs,
  pointerTarget,
  releaseHover,
  resetPointerOwnership,
  type HoverWrite,
} from "../src/interaction/hover";
import {
  ENV,
  SEVERITY_COLOR,
  SEVERITY_CVD_COLOR,
  REVIEWED_BEACON_COLOR,
} from "../src/city/palette";
import { prefersReducedMotion, refreshReducedMotion } from "../src/city/motion";

/**
 * Action feel, part 1: the pointer's answer.
 *
 * Measured before this contract existed (1440×900, real Chrome @60 fps): a
 * pointer move onto a file building changed the 240 px field around it by
 * +0.28/255 mean luminance, and a move onto a district plot by -0.03. The world
 * did not answer the hand. These tests pin what the answer is made of — the
 * shape of the ease, the two channels it drives, and the one thing it must
 * never look like.
 */

const SRC = path.resolve(import.meta.dirname, "../src");

describe("the hover ease", () => {
  it("lands inside one frame when motion is reduced", () => {
    expect(easeGlow(0, 1, true)).toBe(1);
    expect(easeGlow(0.31, 0, true)).toBe(0);
  });

  it("travels monotonically and never overshoots its target", () => {
    let g = 0;
    let prev = -1;
    for (let i = 0; i < 40; i++) {
      g = easeGlow(g, 1, false);
      expect(g).toBeGreaterThanOrEqual(prev);
      expect(g).toBeLessThanOrEqual(1);
      prev = g;
    }
    expect(g).toBe(1);
  });

  it("reaches 95 % of the target in at most 8 frames (≈133 ms at 60 fps)", () => {
    let g = 0;
    let frames = 0;
    while (g < 0.95 && frames < 60) {
      g = easeGlow(g, 1, false);
      frames++;
    }
    expect(frames).toBeLessThanOrEqual(8);
  });

  it("stops writing once it has arrived, in both directions", () => {
    let up = 0;
    for (let i = 0; i < 60; i++) up = easeGlow(up, 1, false);
    expect(easeGlow(up, 1, false)).toBe(1);
    let down = 1;
    for (let i = 0; i < 60; i++) down = easeGlow(down, 0, false);
    expect(easeGlow(down, 0, false)).toBe(0);
  });

  it("follows the shared signal, not a copy of it", () => {
    // The module default reads city/motion's cached answer — the one signal
    // every render loop in the city already agrees on.
    expect(prefersReducedMotion()).toBe(false); // jsdom default in this suite
    expect(easeGlow(0, 1)).toBe(easeGlow(0, 1, prefersReducedMotion()));
  });
});

describe("the hover channels", () => {
  it("draws no ink at all while nothing is hovered", () => {
    expect(inkOpacity(0)).toBe(0);
    expect(inkOpacity(0.5)).toBeCloseTo(HOVER.inkLift * 0.5, 5);
    expect(inkOpacity(1)).toBeCloseTo(HOVER.inkLift, 5);
  });

  it("is monotone in the glow and bounded to a legal opacity", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const o = inkOpacity(i / 20);
      expect(o).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
      prev = o;
    }
  });

  it("stays strong over a dimmed backdrop — the pointer is not dimmed", () => {
    // The ink is an annotation about the HAND, not about the file's rank in the
    // depth of field, so it does not fade with the focus/filter factor.
    expect(inkOpacity(1)).toBeGreaterThan(0.5);
  });

  it("leaves the resting seam alone: hairline scaled by the body's own dim", () => {
    expect(hairlineOpacity(1)).toBeCloseTo(HOVER.seamRest, 5);
    expect(hairlineOpacity(0.3)).toBeCloseTo(HOVER.seamRest * 0.3, 5);
    expect(hairlineOpacity(1, true)).toBeLessThan(0.05);
    expect(hairlineOpacity(1), "the hover must out-shout the rest").toBeLessThan(inkOpacity(1));
  });
});

describe("a hover must not look like a finding", () => {
  /** Every colour the city uses to MEAN something alarming or chosen. */
  const SIGNAL = [
    ...Object.values(SEVERITY_COLOR),
    ...Object.values(SEVERITY_CVD_COLOR),
    ENV.windowAlarm,
    ENV.selection,
    REVIEWED_BEACON_COLOR,
  ];

  it("names every signal colour as saturated, and the hover colours as neutral", () => {
    // The severity ramp, the alarm windows and the selection marker are all
    // saturated lights; the pointer's answer is ink and paper. That gap is the
    // whole reason a hover cannot be read as a finding.
    for (const hex of new Set(SIGNAL))
      expect(colourSpread(hex), `${hex} carries meaning`).toBeGreaterThan(40);
    expect(colourSpread(HOVER_INK)).toBeLessThan(25);
    expect(colourSpread(SEAM_COLOUR)).toBeLessThan(25);
  });

  it("borrows no signal colour, in either palette", () => {
    const hover = [HOVER_INK.toUpperCase(), SEAM_COLOUR.toUpperCase()];
    for (const hex of SIGNAL) expect(hover).not.toContain(hex.toUpperCase());
  });

  it("uses no light at all for the pointer: line materials, not emission", () => {
    // The channels the hover drives are line materials. A hover that emitted
    // would compete with the alarm windows it is supposed to sit next to.
    const building = readFileSync(path.join(SRC, "components/Building.tsx"), "utf-8");
    expect(building).toContain("FOOTPRINT_EDGES");
    expect(building).toMatch(/new THREE\.LineBasicMaterial\(\{\s*\n?\s*color: SEAM_COLOUR/);
  });
});

describe("pointer ownership", () => {
  const writes: Array<string | null> = [];
  const write: HoverWrite = (id) => writes.push(id);
  const a = { name: "a" };
  const b = { name: "b" };

  beforeEach(() => {
    resetPointerOwnership();
    writes.length = 0;
    document.body.style.cursor = "";
  });
  afterEach(() => {
    resetPointerOwnership();
    document.body.style.cursor = "";
  });

  it("lets the last claimer hold the cursor when the first one leaves", () => {
    claimHover(a, "file-a", write);
    claimHover(b, "file-b", write);
    expect(releaseHover(a, write)).toBe(false);
    expect(writes, "a stale release must not blank the tooltip").toEqual(["file-a", "file-b"]);
    expect(pointerOwnerIs(b)).toBe(true);
    expect(pointerTarget()).toBe("file-b");
    expect(document.body.style.cursor).toBe("pointer");
  });

  it("gives the slot back exactly once its owner leaves", () => {
    claimHover(a, "file-a", write);
    expect(releaseHover(a, write)).toBe(true);
    expect(pointerTarget()).toBeNull();
    expect(document.body.style.cursor).toBe("");
    expect(releaseHover(a, write)).toBe(false);
  });

  it("re-targets in place when the same owner moves across one district", () => {
    claimHover(a, "block:src", write);
    claimHover(a, "block:src/deep", write);
    expect(writes).toEqual(["block:src", "block:src/deep"]);
    expect(pointerOwnerIs(a)).toBe(true);
  });
});

describe("the wiring the measurement depends on", () => {
  const building = readFileSync(path.join(SRC, "components/Building.tsx"), "utf-8");
  const district = readFileSync(path.join(SRC, "components/District.tsx"), "utf-8");

  it("routes every hoverable object through the one contract", () => {
    for (const [name, text] of [
      ["Building.tsx", building],
      ["District.tsx", district],
    ]) {
      expect(text, `${name} must claim the pointer`).toContain("claimHover(");
      expect(text, `${name} must release the pointer`).toContain("releaseHover(");
      expect(text, `${name} must ease, not jump`).toContain("easeGlow(");
      expect(
        text,
        `${name} writing body.style.cursor directly is the race this replaces`,
      ).not.toMatch(/document\.body\.style\.cursor\s*=/);
    }
  });

  it("answers the pointer on every body type, not only the lit ones", () => {
    // The old emissive-only hover skipped glass (dead code) bodies entirely.
    // The ink annotation is written before that gate, so it reaches them.
    const ink = building.indexOf("inkMaterial.opacity = inkOpacity(next)");
    const emissive = building.indexOf('matState !== "glass"');
    expect(ink).toBeGreaterThan(-1);
    expect(ink, "the ink must not sit behind the glass gate").toBeLessThan(emissive);
  });

  it("draws the ink on the envelope the building already computed", () => {
    // No second geometry per building: the contour reuses the voxel outline for
    // block stacks and the body's own edge buffer for silhouettes.
    expect(building).toMatch(/geometry=\{\(voxelBody \? outlineEdges : edgeGeometries\[0\]\)/);
    expect(building).toMatch(/<group ref=\{inkRef\} visible=\{false\}>/);
  });

  it("lets the decorative skyline towers answer the hand but not the click", () => {
    expect(district).toMatch(/hoverOnly/);
    expect(district).toMatch(/interactive=\{false\}/);
    expect(building).toMatch(
      /hoverOnly\s*\?\s*\{\s*onPointerOver: handleOver,\s*onPointerOut: handleOut,?\s*\}/,
    );
  });

  it("keeps the city's own motion signal as the switch for all of it", () => {
    expect(building).toContain("../city/motion");
    expect(district).toContain("../city/motion");
    expect(readFileSync(path.join(SRC, "interaction/hover.ts"), "utf-8")).toContain(
      "../city/motion",
    );
  });
});

describe("reduced motion still reaches the hover", () => {
  it("lands the glow in one frame when the system asks for stillness", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        media: q,
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    try {
      expect(refreshReducedMotion()).toBe(true);
      expect(easeGlow(0, 1)).toBe(1);
      expect(easeGlow(0.2, 0)).toBe(0);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: original,
      });
      refreshReducedMotion();
    }
    expect(easeGlow(0, 1)).toBeLessThan(1);
  });
});
