import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AIRSHOW_LIVERY,
  ENV,
  SEVERITY_COLOR,
  SEVERITY_CVD_COLOR,
  THREAT_COLOR,
} from "../src/city/palette";
import { DICT } from "../src/i18n";
import { BANNER_ADDRESS } from "../src/city/airshowMotion";
import { contrast, dE } from "./colourMath";

/**
 * The airshow's coat, and the two ways a plane in the sky can go wrong here.
 *
 * (1) It must not read as an alarm. Every red, orange, yellow, gold and the
 * reviewed beacon are already meanings in this world; a vehicle wearing one of
 * them teaches the reader that a red thing in the sky is information. The
 * measured distance to the nearest colour in the frame is ΔE00 16,3 (the plate
 * to the calm heat level), and to the alarm family itself 49 and up.
 * (2) The copy must survive the sky. The same ink that reaches 13,37:1 on its
 * own plate manages 1,05:1 against the haze and 2,45:1 against the zenith, so
 * the cloth is opaque and its ground is part of the design — a banner without
 * its plate is a sentence written on weather.
 */

const SRC = path.resolve(import.meta.dirname, "../src");
const PLANE = readFileSync(path.join(SRC, "components/BannerPlane.tsx"), "utf8");

/** Every colour that already means something in the city. */
const TAKEN: Record<string, string> = {
  "P0 red": SEVERITY_COLOR.P0,
  "P1 orange": SEVERITY_COLOR.P1,
  "P2 yellow": SEVERITY_COLOR.P2,
  "P0 vermilion (CVD)": SEVERITY_COLOR.P0 && SEVERITY_CVD_COLOR.P0,
  "P1 (CVD)": SEVERITY_CVD_COLOR.P1,
  "P2 (CVD)": SEVERITY_CVD_COLOR.P2,
  selection: ENV.selection,
  "window alarm": ENV.windowAlarm,
  "calm heat": THREAT_COLOR.safe,
  "low heat": THREAT_COLOR.low,
};

describe("the airshow cannot be mistaken for an alarm", () => {
  for (const [name, hex] of Object.entries(TAKEN)) {
    it(`keeps its distance from ${name}`, () => {
      expect(dE(AIRSHOW_LIVERY.plate, hex), `plate vs ${name}`).toBeGreaterThanOrEqual(12);
      expect(dE(AIRSHOW_LIVERY.ink, hex), `ink vs ${name}`).toBeGreaterThanOrEqual(12);
    });
  }

  it("carries its own ground: the copy is ink on a plate, not ink on sky", () => {
    expect(contrast(AIRSHOW_LIVERY.ink, AIRSHOW_LIVERY.plate)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(AIRSHOW_LIVERY.plate, ENV.fog)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(AIRSHOW_LIVERY.plate, ENV.skyZenith)).toBeGreaterThanOrEqual(2.5);
    // The reason the cloth is not transparent, stated as a number.
    expect(contrast(AIRSHOW_LIVERY.ink, ENV.fog)).toBeLessThan(2);
  });
});

describe("the banner is drawn, not typed into the world", () => {
  it("uses four meshes and no instancing", () => {
    expect(PLANE.match(/<mesh[\s/>]/g) ?? []).toHaveLength(4);
    expect(PLANE).not.toContain("<instancedMesh");
    expect(PLANE.match(/raycast=\{\(\) => null\}/g) ?? []).toHaveLength(4);
  });

  it("takes every colour from the palette and glows with nothing", () => {
    expect(
      PLANE.match(/#[0-9a-fA-F]{6}\b/g) ?? [],
      "inline hex in a DOM-budgeted component",
    ).toEqual([]);
    expect(PLANE).not.toMatch(/emissive/i);
  });

  it("stops for the reader who asked for no motion, and for nobody else", () => {
    expect(PLANE).toContain("reducedSettle(");
    expect(PLANE).toContain("prefersReducedMotion()");
    expect(PLANE).toContain("Math.min(delta, 0.1)");
    // jsdom stubs `useThree` thinly; the frame loop's own state argument is the
    // only camera this file is allowed to look at.
    expect(PLANE).not.toContain("useThree(");
  });

  it("keeps the cloth opaque", () => {
    const materials = PLANE.match(/new THREE\.MeshBasicMaterial\(\{[^}]*\}\)/g) ?? [];
    const cloth = materials.find((m) => m.includes("map:")) ?? "";
    expect(cloth, "the banner material moved — re-read this guard").toContain("map:");
    expect(cloth).not.toContain("transparent");
  });

  it("writes copy that fits the cloth in both languages", () => {
    // JetBrains Mono advances 0,6 × its size, and the canvas is 640 px wide.
    const budget = (chars: number, px: number): number => chars * 0.6 * px;
    for (const lang of ["en", "de"] as const) {
      expect(
        budget(DICT["airshow.bannerLine"][lang].length, 26),
        `${lang} invitation`,
      ).toBeLessThanOrEqual(640);
    }
    expect(budget(BANNER_ADDRESS.length, 24), "address").toBeLessThanOrEqual(640);
    expect(DICT).not.toHaveProperty("airshow.bannerAddress");
  });
});
