import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ENV, LANGUAGE_COLORS, THREAT_COLOR, UNCHECKED_COLOR } from "../src/city/palette";
import { overviewShot } from "../src/city/layout";
import { crowdFor, BUS_MIN_PLOTS } from "../src/components/Pedestrians";

/**
 * The picture guards.
 *
 * Lane WELT-BILD's brief was a measurement, not a taste: "the world should look
 * like a code floor plan, not a playground", with two numbers attached — the
 * share of the frame that carries data, and the smallest distance between two
 * language colours. This file pins the parts of those two that can be decided
 * without a GPU; the pixels themselves are in
 * `.qoder-scratch/devteam/WELT-BILD/shots/` (same camera, before/after).
 *
 * Colour is measured in CIEDE2000 — the distance formula that tracks perceived
 * difference far better than the RGB arithmetic it replaces — and every claim is
 * checked twice more under simulated protanopia and deuteranopia, because the
 * colorblind branch has to carry the same message and there is no second
 * palette to hide a collision in.
 */

// ── colour math ────────────────────────────────────────────────────────────
const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const srgbToLin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const linToSrgb = (v: number): number => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, s)) * 255);
};
export function lab(h: string): [number, number, number] {
  const [r, g, b] = hexRgb(h);
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const f = (t: number): number => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037 * t + 16 / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE00(l1: [number, number, number], l2: [number, number, number]): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const deg = (r: number): number => ((r * 180) / Math.PI + 360) % 360;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p));
  const h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p));
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else {
    const d = Math.abs(h1p - h2p);
    hbp =
      d <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}
const dE = (a: string, b: string): number => deltaE00(lab(a), lab(b));

/** Viénot/Brettel-Mollon: lineares RGB eines Dichromaten. */
const CVD_MATRIX = {
  protan: [
    [0.152286, 1.052585, -0.204876],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048119, 1.051999],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.042994, 0.968826],
  ],
} as const;
function simulate(hex: string, kind: keyof typeof CVD_MATRIX): [number, number, number] {
  const [r, g, b] = hexRgb(hex);
  const lr = [srgbToLin(r), srgbToLin(g), srgbToLin(b)];
  const m = CVD_MATRIX[kind];
  const o = m.map(([r0, g0, b0]) => r0 * lr[0]! + g0 * lr[1]! + b0 * lr[2]!);
  const hex2 = "#" + o.map((v) => linToSrgb(v).toString(16).padStart(2, "0")).join("");
  return lab(hex2);
}
function relLum(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

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
