import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ENV, LANGUAGE_COLORS, THREAT_COLOR, UNCHECKED_COLOR } from "../src/city/palette";
import { overviewShot } from "../src/city/layout";
import { crowdFor, BUS_MIN_PLOTS } from "../src/components/Pedestrians";
import { dE, deltaE00, lab, relLum, simulate } from "./colourMath";

/**
 * The picture guards.
 *
 * Lane WELT-BILD's brief was a measurement, not a taste: "the world should look
 * like a code floor plan, not a playground", with two numbers attached — the
 * share of the frame that carries data, and the smallest distance between two
 * language colours. This file pins the parts of those two that can be decided
 * without a GPU; the pixels themselves are in
 * a local measurement script that is not shipped (same camera, before/after).
 *
 * Colour is measured in CIEDE2000 — the distance formula that tracks perceived
 * difference far better than the RGB arithmetic it replaces — and every claim is
 * checked twice more under simulated protanopia and deuteranopia, because the
 * colorblind branch has to carry the same message and there is no second
 * palette to hide a collision in.
 */

// Colour math (ΔE00, dichromacy simulation, WCAG luminance) lives in
// `tests/colourMath.ts` — the same formulas the alarm-band guard measures with.

/** The ten languages a reader scans first. They carry the frame's colour
 *  argument, so they hold the highest floor and keep their conventional hues. */
const MAJOR = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Ruby",
  "CSharp",
  "HTML",
  "CSS",
] as const;

/** Everything the world is made of that is NOT a measurement. */
const DECO = [
  ENV.ground,
  ENV.plot,
  ENV.plotEdge,
  ENV.road,
  ENV.curb,
  ENV.crosswalk,
  ENV.fog,
] as const;
// Der Zenit gehört nicht dazu: er liegt im Bild nie neben einer Fassade — er
// ist der Himmel über der sichtbaren Kante, die Haze dagegen steht direkt
// hinter ihr. Die beiden Fassaden, die gegen ihn kollidierten (TypeScript 6.3,
// YAML 8.1 ΔE00), halten 12 bzw. 15 gegen die Haze.

function worstPair(names: string[], kinds: Record<string, [number, number, number][]>) {
  let worst = Infinity;
  let pair = "";
  for (const [kind, arr] of Object.entries(kinds)) {
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const d = deltaE00(arr[i]!, arr[j]!);
        if (d < worst) {
          worst = d;
          pair = `${names[i]}/${names[j]} (${kind})`;
        }
      }
  }
  return { worst, pair };
}

describe("world picture: language colours are a measurement", () => {
  const names = Object.keys(LANGUAGE_COLORS);
  const colors = names.map((n) => LANGUAGE_COLORS[n]!);
  const sets: Record<string, [number, number, number][]> = {
    normal: colors.map(lab),
    protan: colors.map((c) => simulate(c, "protan")),
    deutan: colors.map((c) => simulate(c, "deutan")),
  };

  it("tells every pair of the 24 categories apart, in all three vision types", () => {
    const { worst, pair } = worstPair(names, sets);
    // The set this replaces measured 1.29 / 1.09 / 1.28 — pairs drawn in what
    // is one colour on screen. 6.5 is the floor the search was held to; the
    // shipped set sits at 8.28 and a regression past this line means a hue was
    // edited by hand without re-running the measurement.
    expect(worst, `schwächstes Paar: ${pair}`).toBeGreaterThanOrEqual(6.5);
  });

  it("gives the ten languages a reader scans first the widest floor", () => {
    const majors = [...MAJOR];
    const sets: Record<string, [number, number, number][]> = {
      normal: majors.map((n) => lab(LANGUAGE_COLORS[n]!)),
      protan: majors.map((n) => simulate(LANGUAGE_COLORS[n]!, "protan")),
      deutan: majors.map((n) => simulate(LANGUAGE_COLORS[n]!, "deutan")),
    };
    const { worst, pair } = worstPair(majors, sets);
    expect(worst, `schwächstes Hauptpaar: ${pair}`).toBeGreaterThanOrEqual(8);
  });

  it("keeps the document pair that used to be one colour apart by 1.29 apart", () => {
    // Markdown `#8fa3b8` against JSON `#93a7bd` was the worst case of the old
    // palette and the clearest proof that "colorblind-safe hues" in a header
    // comment was a claim and not a measurement.
    expect(dE(LANGUAGE_COLORS.Markdown!, LANGUAGE_COLORS.JSON!)).toBeGreaterThanOrEqual(20);
  });

  it("stands every facade off the world it is drawn on", () => {
    // A tone that matches the asphalt or the haze is not a measurement, it is
    // camouflage. This is the constraint that stopped the search from solving
    // separation with pale washes.
    for (const name of names) {
      const color = LANGUAGE_COLORS[name]!;
      const nearest = Math.min(...DECO.map((d) => dE(color, d)));
      expect(nearest, `${name} (${color}) versinkt in der Deko`).toBeGreaterThanOrEqual(11);
    }
  });
});

describe("world picture: the atmosphere stops where the measurement starts", () => {
  /**
   * This whole block is the record of a direction that was built, measured, and
   * taken back.
   *
   * The world was first moved to late afternoon: haze down to a relative
   * luminance of 0.065, so the floor the city stands on and the distance behind
   * it were 45 ΔE00 apart instead of 8. The frame gained exactly the depth the
   * brief asked for. It also deleted a metric: the far-zoom heat grid is drawn
   * UNLIT on that floor, and its two calmest levels (`safe` #3b4a63,
   * `unchecked` #6b6a63) are darker than a dusk haze. Measured in pixels at the
   * far view, `safe` stood at 1.64:1 against the ground under it and
   * `unchecked` at 2.07:1, where `hudLegibility.test.ts` asks for 2.5:1 — and
   * no re-tuning of the tiles fixes it, because lifting `safe` to clear the haze
   * collapses its lightness ordering against `unchecked`, the pair "looked,
   * found nothing" / "nobody looked". A light floor and a dark distance cannot
   * both hold the grid.
   *
   * So the haze stays lighter than every calm heat level, and the depth of the
   * frame is carried by the three places that do not touch the grid: the zenith
   * (0.278 against the horizon's 0.707 — a full stop and a half of sky, where
   * the shipped world had 0.678 of a ratio and no gradient to speak of), the
   * asphalt (29.4 ΔE00 below the plaza floor, so the street network reads as
   * the ground's negative instead of as a third facade colour), and the frame's
   * own corners.
   */
  const contrast = (a: string, b: string) => {
    const l = (h: string) => relLum(h);
    return (Math.max(l(a), l(b)) + 0.05) / (Math.min(l(a), l(b)) + 0.05);
  };

  it("keeps the haze lighter than the calmest thing drawn on it", () => {
    for (const [name, hex] of [
      ["safe", THREAT_COLOR.safe],
      ["unchecked", UNCHECKED_COLOR],
    ] as const) {
      expect(contrast(ENV.fog, hex), `${name} gegen die Ferne`).toBeGreaterThanOrEqual(2.5);
      expect(contrast(ENV.ground, hex), `${name} gegen den Grund`).toBeGreaterThanOrEqual(2.5);
    }
    expect(relLum(ENV.fog)).toBeGreaterThan(0.6);
  });

  it("still has a sky that goes somewhere", () => {
    expect(dE(ENV.fog, ENV.skyZenith)).toBeGreaterThanOrEqual(20);
    expect(relLum(ENV.skyZenith) / relLum(ENV.fog)).toBeLessThanOrEqual(0.45);
    expect(ENV.skyTop).toBe(ENV.fog);
  });

  it("keeps the floor light enough for the far-zoom heat grid", () => {
    // The floor did not move with the atmosphere, and it may not: the heat
    // cells are unlit and sit directly on this value.
    expect(relLum(ENV.ground)).toBeGreaterThanOrEqual(0.45);
  });

  it("takes the street furniture out of the competition", () => {
    // The crossing was the brightest thing in the frame at 0.914 relative
    // luminance and 31.6 ΔE00 from its own asphalt. It carries no measurement.
    expect(relLum(ENV.crosswalk)).toBeLessThanOrEqual(0.5);
    expect(dE(ENV.crosswalk, ENV.road)).toBeLessThanOrEqual(28);
    expect(dE(ENV.road, ENV.ground)).toBeGreaterThanOrEqual(25);
  });
});

describe("world picture: the frame is sized to the city in it", () => {
  const scene = readFileSync(
    path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
    "utf-8",
  );

  it("reveals with the shot the overview flight already uses", () => {
    // The reveal had its own distance floor of 130 units. On the two-file repo
    // that put the entire town in a handful of pixels — the audit's "no
    // building in the picture" — while the store's own Overview button had
    // been framing the same level with `overviewShot` all along.
    expect(scene).toContain("overviewShot(");
    expect(scene).not.toMatch(/distance:\s*Math\.max\([^)]*130/);
  });

  it("keeps the fog off the ground the heat grid sits on", () => {
    // Die Ferne ist nicht die Aufgabe dieses Nebels: `render/ground.ts` trägt
    // den Grund in die Haze, und die Rampe macht den Horizont. Der Nebel darf
    // deshalb auf der Distanz, auf der die Heat-Raste steht, und selbst am
    // äußeren Kamerakragen nur ein dünner Auftrag sein.
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
      "utf-8",
    );
    const body = src.slice(
      src.indexOf("export function fogRange"),
      src.indexOf("}", src.indexOf("return [bounds")),
    );
    const [, nearK, farK, farAdd] = body.match(
      /return \[bounds \* ([\d.]+), bounds \* ([\d.]+) \+ (\d+)\]/,
    )!;
    const fogAt = (bounds: number, d: number): number => {
      const near = bounds * Number(nearK);
      const far = bounds * Number(farK) + Number(farAdd);
      return Math.max(0, Math.min(1, (d - near) / (far - near)));
    };
    for (const bounds of [24, 60, 120, 240]) {
      // Die Distanz, ab der der Renderer auf die Raste umschaltet, und die,
      // bis wohin `clampToCity` den Piloten lässt.
      expect(fogAt(bounds, Math.max(119, bounds * 1.8)), `LOD-Schwelle @${bounds}`).toBeLessThan(
        0.1,
      );
      expect(fogAt(bounds, bounds * 4 + 220), `Kragen @${bounds}`).toBeLessThan(0.35);
    }
    expect(Number(nearK)).toBeGreaterThan(1.8);
  });

  it("frames a small level tight, and a wide one no tighter than before", () => {
    // bounds 24 is roughly the two-file plaza. 130 was the old floor.
    expect(overviewShot(24, 8).dist).toBeLessThan(60);
    // A level wide enough for the floor to be irrelevant keeps its shot.
    expect(overviewShot(120, 30).dist).toBeCloseTo(120 * 1.6, 6);
  });
});

describe("world picture: decoration follows the data", () => {
  it("gives a city one figure per building it lives in", () => {
    // 72 on every level was the shipped rule: 2.1 citizens per rendered file
    // on the 900-file city and 36 on the two-file repo.
    expect(crowdFor(35, 72)).toBe(35);
    expect(crowdFor(72, 72)).toBe(72);
    expect(crowdFor(200, 72)).toBe(72);
  });

  it("never lets the crowd outgrow the city", () => {
    for (const plots of [6, 12, 40, 90, 400]) {
      expect(crowdFor(plots, 72)).toBeLessThanOrEqual(Math.max(plots, 6));
    }
  });

  it("keeps a floor small enough that a hamlet is not a parade", () => {
    expect(crowdFor(2, 72)).toBe(6);
    // A scanned level can have an EMPTY plaza — the two-file repo is one, its
    // files live in a sub-district — and that must not read as "no city yet".
    expect(crowdFor(0, 72)).toBe(6);
  });

  it("keeps the empty world's own crowd", () => {
    // The one place where the figures are the subject and there is no data to
    // sit under them: the world before the first scan.
    expect(crowdFor(0, 46, true)).toBe(46);
    expect(crowdFor(0, 46, false)).toBe(6);
  });

  it("runs a bus line only where there are plots to serve", () => {
    expect(BUS_MIN_PLOTS).toBeGreaterThan(6);
    expect(crowdFor(BUS_MIN_PLOTS - 1, 72)).toBeLessThan(BUS_MIN_PLOTS);
  });
});

describe("world picture: the grade does not depend on the renderer", () => {
  it("is one CSS layer, painted between the world and the HUD", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../src/design/world.css"), "utf-8");
    // `gfxLite` drops the bloom pass and takes another tone-mapping route; the
    // frame grade has to be identical in both, so it lives in DOM, not in a
    // post-processing effect.
    expect(css).toMatch(/\.world-grade\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/position:\s*absolute/);
    const scene = readFileSync(
      path.resolve(import.meta.dirname, "../src/components/CityScene.tsx"),
      "utf-8",
    );
    expect(scene).toContain('import "../design/world.css"');
    expect(scene).toContain("<WorldGrade />");
  });
});
