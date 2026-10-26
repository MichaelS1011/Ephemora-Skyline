// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { LOD_THRESHOLDS } from "../src/hooks/useLodFar";
import { districtChipLabel, districtChipPitchPx } from "../src/components/CityTree";
import { undergroundPlateLine } from "../src/city/layout";
import { dir } from "./helpers/cityFixture";

/**
 * `--fs-meta` (design/globals.css:46) declares itself the smallest allowed text
 * and says why: one-off px values drift. It drifted anyway — nineteen class
 * values and two CSS rules sat under it, the smallest at 8.5px on the CWE badge,
 * which is the label a reader needs in order to check a finding against the
 * rule that fired. A floor nobody enforces is a comment.
 */
const SRC = path.resolve(import.meta.dirname, "../src");

/** Files whose numbers are not screen pixels: the 3D labels that scale with `distanceFactor`. The far-zoom district chip joined the floor on 2026-10-26 (see the retired-exemption block below) — this list is EMPTY, and every declared font number in a .tsx is a screen pixel. */
const SCALED_IN_3D: string[] = [];

function files(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => extensions.includes(path.extname(f)))
    .map((f) => path.join(dir, f));
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join("/");

describe("the type floor", () => {
  it("keeps every Tailwind text size at or above --fs-meta", () => {
    const offenders: string[] = [];
    for (const f of files(SRC, [".tsx", ".ts"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/text-\[([\d.]+)(px|rem)\]/g)) {
        const size = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (size < 11) offenders.push(`${rel(f)}: ${m[0]} (= ${size}px)`);
      }
    }
    expect(offenders, `text under 11px:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps every CSS font-size at or above --fs-meta", () => {
    const offenders: string[] = [];
    for (const f of files(SRC, [".css"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/font-size:\s*([\d.]+)px/g)) {
        if (Number(m[1]) < 11) offenders.push(`${rel(f)}: ${m[0]}`);
      }
      for (const m of text.matchAll(/font-size:\s*([\d.]+)rem/g)) {
        if (Number(m[1]) < 0.6875) offenders.push(`${rel(f)}: ${m[0]} (= ${Number(m[1]) * 16}px)`);
      }
    }
    expect(offenders, `CSS sizes under 11px:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("lets no numeric font size under the floor survive anywhere", () => {
    const found: string[] = [];
    for (const f of files(SRC, [".tsx"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/fontSize:\s*["']?([\d.]+)(px|rem)?/g)) {
        const size = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (size < 11) found.push(rel(f));
      }
    }
    for (const file of found) {
      expect(
        SCALED_IN_3D,
        `${file} sets a numeric font size under 11 without being 3D-scaled`,
      ).toContain(file);
    }
    // The whitelist is empty now, so the old "the scan found something"
    // guard would itself be vacuous. Positive control for the scan: the
    // same regex must still catch a sub-floor number, so a green run below
    // is a measurement, not a blind spot.
    const probe = [..."fontSize: 10;".matchAll(/fontSize:\s*["']?([\d.]+)(px|rem)?/g)];
    expect(probe.length).toBe(1);
    expect(Number(probe[0]?.[1])).toBeLessThan(11);
  });
});

/**
 * The exemption above is a door, and a door with no frame around it lets
 * anything through. Measured on 2026-10-22: the podium's underground tally
 * scaled by `distanceFactor` arrived at **3.21 px** at the district camera —
 * the same frame in which the import plate measured 2.72 px, the number that
 * started Folge-003. The tally is a disclosure; at 3.21 px it disclosed
 * nothing. The ruling de-scaled the podium and BOUNDED the exemption to
 * "exactly one scaled site — the far-zoom district chips". That was half a
 * rule: the chip is the one label in the tier where a tile carries no other
 * identity, and it measured WORSE than the podium. drei's non-transform
 * `Html` multiplies the whole plate by `distanceFactor / (2·tan(fov/2)·dist)`
 * (`objectScale`, `node_modules/@react-three/drei/web/Html.js`); with the
 * shipped fov 52 (`App.tsx` Canvas), the old chip's
 * `distanceFactor={layout.bounds}` and fontSize 10, and the tier-0 enter
 * threshold `dist > max(170, 4.8·bounds)` (`hooks/useLodFar`), that is
 * 0.72–2.14 px em on the threshold axis — up to 2.70 px on the hysteresis
 * exit axis (BEFUND's per-plot 1.45–3.03 px is the same formula read at the
 * real per-plot camera distances). Below the team's OWN measured floor. In
 * the tier where only the district name identifies the tile, the name did
 * not exist.
 *
 * The exemption is now retired in that render branch — the chip appears in
 * exactly one branch of `CityTree.tsx` (tier 1's street sign in
 * `District.tsx` never scaled and reads fine): no scaled site remains in
 * `CityTree.tsx`, the chip sits on `var(--fs-meta)`, and the flat
 * `blocks.length <= 24` cap became `districtChipBudget` — projected plot
 * pitch divided by the widest chip the level would draw.
 */
describe("the 3D exemption is retired — the far-zoom chip sits on the floor", () => {
  const cityTree = readFileSync(path.join(SRC, "components/CityTree.tsx"), "utf-8");
  const shipped = (name: string): number => {
    const m = cityTree.match(new RegExp(`const ${name} = ([\\d.]+);`));
    expect(m, `CityTree.tsx must ship const ${name}`).not.toBeNull();
    return Number(m?.[1]);
  };
  const appSrc = readFileSync(path.join(SRC, "App.tsx"), "utf-8");
  const fov = Number(appSrc.match(/camera=\{\{[^}]*\bfov:\s*([\d.]+)/)?.[1]);
  expect(fov, "the Canvas must declare its fov where this guard can read it").toBe(52);
  const globals = readFileSync(path.join(SRC, "design/globals.css"), "utf-8");
  const meta = Number(globals.match(/--fs-meta:\s*([\d.]+)px/)?.[1]);
  expect(meta, "design/globals.css explains --fs-meta in px").toBe(11);
  // The tier-0 thresholds, read from the shipped hook module — not restated.
  expect(LOD_THRESHOLDS.RELATIVE_ENTER).toBe(4.8);
  const enter = (b: number): number =>
    Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, b * LOD_THRESHOLDS.RELATIVE_ENTER);
  const halfTan = Math.tan(((fov / 2) * Math.PI) / 180);
  /** drei's rule: an unscaled <Html> renders at scale 1 — screen pixels. */
  const em = (fontSizePx: number, distanceFactor: number | undefined, bounds: number): number =>
    distanceFactor === undefined
      ? fontSizePx
      : (fontSizePx * distanceFactor) / (2 * halfTan * enter(bounds));

  it("scales no site in the city tree", () => {
    const scaled = [...cityTree.matchAll(/distanceFactor=\{/g)].length;
    expect(scaled, `${scaled} distance-scaled plates in CityTree.tsx`).toBe(0);
  });

  it("puts the district chip on the type token, unscaled", () => {
    const at = cityTree.indexOf("district-label-");
    expect(at, "the far-zoom district chip block is gone").toBeGreaterThan(-1);
    const chip = cityTree.slice(at, at + 1400);
    expect(chip).not.toMatch(/distanceFactor/);
    expect(chip.match(/fontSize: "var\(--fs-meta\)"/g)?.length).toBe(2);
    // no numeric font size survives in the whole file — the chip and the
    // underground line under it both ride the token
    expect(cityTree).not.toMatch(/fontSize:\s*[\d.]+/);
  });

  it("keeps the chip glyph on the floor at every shipped threshold — and the old scaling fails this same guard", () => {
    const guard = (
      fontSizePx: number,
      distanceFactorOf: (bounds: number) => number | undefined,
    ): string[] =>
      // 12 … 275: bounds where the far tier is reachable at all — the
      // CameraRig's `maxDistance = max(520, 4·bounds + 220)` ends the tier
      // at 4.8·bounds = 4·bounds + 220, i.e. bounds 275.
      [12, 20, 24, 36, 50, 88, 124, 200, 275]
        .filter((b) => em(fontSizePx, distanceFactorOf(b), b) < meta)
        .map((b) => `bounds ${b}: ${em(fontSizePx, distanceFactorOf(b), b).toFixed(2)} px`);
    // AFTER — the token at scale 1: 11 px at every distance, guard green.
    expect(
      guard(meta, () => undefined),
      "chip em under the floor after the fix",
    ).toEqual([]);
    // Positive control: put `distanceFactor={layout.bounds}` and the old
    // 10 px back INTO the same formula and this same guard goes red on
    // every level — a test that cannot fail is not a gate.
    expect(
      guard(10, (b) => b),
      "the scaled chip must fail this exact guard",
    ).toHaveLength(9);
    // The before numbers, off the shipped formula: 0.72 px em at bounds 12,
    // 2.14 px for every level past the 4.8·bounds crossover of the enter
    // threshold.
    expect(em(10, 12, 12)).toBeCloseTo(0.72, 1);
    expect(em(10, 100, 100)).toBeCloseTo(2.14, 1);
  });

  it("makes the flood cap arithmetic — plot pitch divided by chip width", () => {
    expect(cityTree).not.toMatch(/blocks\.length\s*<=\s*24/);
    expect(cityTree).toMatch(/layout\.blocks\.length <= farChipBudget/);
    const chrome = shipped("CHIP_CHROME_PX");
    const advance = shipped("CHIP_ADVANCE_EM");
    const glyph = shipped("CHIP_GLYPH_PX");
    const chipFov = shipped("CHIP_FOV_DEG");
    const viewH = shipped("CHIP_VIEW_H_PX");
    // the arithmetic must ride the same numbers the app ships
    expect(glyph, "the budget glyph step is --fs-meta").toBe(meta);
    expect(chipFov, "the budget fov is the shipped Canvas fov").toBe(fov);
    const fieldPx = (b: number): number => (2 * b * viewH) / (2 * halfTan * enter(b));
    const budget = (b: number, chars: number): number =>
      Math.max(1, Math.floor((fieldPx(b) / (chrome + advance * glyph * chars)) ** 2));
    // The number that decided it: at the flat cap's own edge — 24 blocks in
    // the 4.8·bounds regime — the screen pitch at the enter threshold is
    // 69.8 px, while a 10-character folder name is an 80 px chip (names
    // overflow the pitch from 8.4 characters up). The flat cap flooded the
    // grid exactly where a name is a tile's only identifier.
    expect(fieldPx(100) / Math.sqrt(24)).toBeLessThan(chrome + advance * glyph * 10);
    expect(budget(100, 10)).toBe(18);
    expect(budget(100, 12)).toBe(13);
    // …and the arithmetic is not merely a smaller cap: short names earn
    // MORE room than the flat 24 ever gave.
    expect(budget(100, 6)).toBe(40);
    // Small levels live on the ABSOLUTE_FLOOR axis, where the field
    // projects narrower: fewer names, each readable.
    expect(budget(24, 10)).toBe(8);
  });

  it("leaves the heat grid and its one instanced draw call untouched", () => {
    expect(cityTree.match(/<HeatCells/g)?.length).toBe(1);
    expect(cityTree).toMatch(/<HeatCells layout=\{layout\} \/>/);
  });

  it("renders the underground tally at screen pixels", () => {
    const plate = cityTree.slice(
      cityTree.indexOf('cf-plate" style'),
      cityTree.indexOf('cf-plate" style') + 900,
    );
    expect(plate).toContain("cf-plate-under");
    // The <Html> that opens this plate must not scale — that is what makes the
    // 11 px floor in the stylesheet a real promise for this text.
    const opener = cityTree.lastIndexOf("<Html", cityTree.indexOf('cf-plate" style'));
    expect(cityTree.slice(opener, opener + 200)).not.toMatch(/distanceFactor/);
  });
});

/**
 * The round after the chip went readable. The pixel claim HELD — measured ink
 * on the running app: 10.5 px at 249, 335 and 447 px camera distance, where the
 * scaled chip had left 0.72–2.14 px. The budget claim produced a NEW defect, in
 * the same measurement: `districtChipBudget` was handed the longest line the
 * level draws, and a folded folder's tally line ("⌄ 30/55 files underground",
 * 25 chars) is far wider than any folder name. Because the gate is
 * all-or-nothing — `layout.blocks.length <= farChipBudget` draws every name or
 * none — one fold's number silenced every district of the level: `frontend/src`
 * went from 15 chips to 3, and its 14 names fell to zero, on the one level this
 * round exists to make legible. Readable-but-absent is not an improvement.
 *
 * The table below is the browser probe's own record of the shipped 42-level
 * walk, transcribed (`.qoder-scratch/…/item3f-budget.json`, 2026-10-26, 16
 * levels that carry blocks; the other 26 hold no child directory and draw no
 * chip, so no name can be lost there). `beforeBudget` is what the tally divisor
 * produced that morning; `namesThatFit` is the same arithmetic on the name
 * measure. Both are recomputed here from the shipped constants, so the table
 * cannot drift from the formula silently.
 */
describe("the chip budget counts names, not the longest tally line", () => {
  const cityTree = readFileSync(path.join(SRC, "components/CityTree.tsx"), "utf-8");
  const number = (name: string): number => {
    const m = cityTree.match(new RegExp(`const ${name} = ([\\d.]+);`));
    expect(m, `CityTree.tsx must ship const ${name}`).not.toBeNull();
    return Number(m?.[1]);
  };
  const chrome = number("CHIP_CHROME_PX");
  const advance = number("CHIP_ADVANCE_EM");
  const glyph = number("CHIP_GLYPH_PX");
  const fovDeg = number("CHIP_FOV_DEG");
  const viewH = number("CHIP_VIEW_H_PX");
  const halfTan = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const enter = (b: number): number =>
    Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, b * LOD_THRESHOLDS.RELATIVE_ENTER);
  const fieldPx = (b: number): number => (2 * b * viewH) / (2 * halfTan * enter(b));
  const chipPx = (chars: number): number => chrome + advance * glyph * chars;
  const budget = (b: number, chars: number): number =>
    Math.max(1, Math.floor((fieldPx(b) / chipPx(chars)) ** 2));

  /** What the OLD flat cap drew: any level of up to 24 districts had its names. */
  const FLAT_CAP = 24;
  const LEVELS = [
    {
      path: "frontend",
      bounds: 61.8,
      blocks: 2,
      maxName: 5,
      maxPlate: 27,
      beforeBudget: 3,
      namesThatFit: 52,
    },
    {
      path: "frontend/src",
      bounds: 134.5,
      blocks: 14,
      maxName: 11,
      maxPlate: 25,
      beforeBudget: 3,
      namesThatFit: 15,
    },
    {
      path: "frontend/src/hooks",
      bounds: 56.6,
      blocks: 1,
      maxName: 16,
      maxPlate: 0,
      beforeBudget: 8,
      namesThatFit: 8,
    },
    {
      path: "frontend/tests",
      bounds: 72.5,
      blocks: 1,
      maxName: 7,
      maxPlate: 0,
      beforeBudget: 32,
      namesThatFit: 32,
    },
    {
      path: "backend",
      bounds: 69.1,
      blocks: 3,
      maxName: 5,
      maxPlate: 25,
      beforeBudget: 3,
      namesThatFit: 52,
    },
    {
      path: "backend/tests",
      bounds: 75,
      blocks: 2,
      maxName: 8,
      maxPlate: 0,
      beforeBudget: 26,
      namesThatFit: 26,
    },
    {
      path: "backend/tests/fixtures",
      bounds: 44.9,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
      beforeBudget: 40,
      namesThatFit: 40,
    },
    {
      path: "backend/src",
      bounds: 65.7,
      blocks: 4,
      maxName: 8,
      maxPlate: 0,
      beforeBudget: 26,
      namesThatFit: 26,
    },
    {
      path: "backend/src/services",
      bounds: 56.7,
      blocks: 3,
      maxName: 8,
      maxPlate: 0,
      beforeBudget: 26,
      namesThatFit: 26,
    },
    {
      path: "backend/src/server",
      bounds: 57.8,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
      beforeBudget: 40,
      namesThatFit: 40,
    },
    {
      path: "backend/rules",
      bounds: 45.6,
      blocks: 1,
      maxName: 13,
      maxPlate: 0,
      beforeBudget: 11,
      namesThatFit: 11,
    },
    {
      path: "docs",
      bounds: 47.6,
      blocks: 1,
      maxName: 7,
      maxPlate: 0,
      beforeBudget: 32,
      namesThatFit: 32,
    },
    {
      path: "docs/reviews",
      bounds: 98.4,
      blocks: 14,
      maxName: 29,
      maxPlate: 0,
      beforeBudget: 2,
      namesThatFit: 2,
    },
    {
      path: "docs/reviews/2026-10-22-importbeschriftung",
      bounds: 51.8,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
      beforeBudget: 40,
      namesThatFit: 40,
    },
    {
      path: "docs/reviews/2026-10-22-praxistest",
      bounds: 51.6,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
      beforeBudget: 40,
      namesThatFit: 40,
    },
    {
      path: "dist-package",
      bounds: 47.3,
      blocks: 1,
      maxName: 7,
      maxPlate: 0,
      beforeBudget: 32,
      namesThatFit: 32,
    },
  ] as const;

  // The measure the SHIPPED call site hands the budget, read off the source: the
  // name only, or — should the tally line ever return to the divisor — the
  // longest line as well. The number assertions below follow the source, so the
  // invariant is checked against what the app actually computes.
  const at = cityTree.indexOf("const farChipBudget");
  expect(at, "the far tier's budget gate is gone from CityTree.tsx").toBeGreaterThan(-1);
  const call = cityTree.slice(at, cityTree.indexOf(": 0;", at));
  const tallyInDivisor = /undergroundPlateLine|remainingFiles/.test(call);
  const widest = (l: (typeof LEVELS)[number]): number =>
    tallyInDivisor ? Math.max(l.maxName, l.maxPlate) : l.maxName;
  const budgetShipped = (l: (typeof LEVELS)[number]): number => budget(l.bounds, widest(l));
  const namesThatFit = (l: (typeof LEVELS)[number]): number => budget(l.bounds, l.maxName);

  it("keeps the tally line out of the divisor the count gate reads", () => {
    expect(call, "the gate must read the name measure").toContain("b.dir.name.length");
    expect(call, "the gate must not read the widest drawn line").toContain("districtChipBudget(");
    expect(
      tallyInDivisor,
      "a folded folder's tally line may not size the count every district is gated on",
    ).toBe(false);
  });

  it("reproduces the probe's two budget columns from the shipped constants", () => {
    const drift: string[] = [];
    for (const l of LEVELS) {
      if (namesThatFit(l) !== l.namesThatFit)
        drift.push(`${l.path}: names ${namesThatFit(l)} ≠ probe ${l.namesThatFit}`);
      if (budget(l.bounds, Math.max(l.maxName, l.maxPlate)) !== l.beforeBudget)
        drift.push(
          `${l.path}: tally divisor ${budget(l.bounds, Math.max(l.maxName, l.maxPlate))} ≠ probe ${l.beforeBudget}`,
        );
    }
    expect(drift, `the table drifted from the shipped formula:\n${drift.join("\n")}`).toEqual([]);
  });

  it("never loses a name the flat cap drew while it fits the pitch", () => {
    const lost: string[] = [];
    for (const l of LEVELS) {
      const fits = namesThatFit(l);
      const required = Math.min(FLAT_CAP, fits);
      if (budgetShipped(l) < required)
        lost.push(
          `${l.path}: budget ${budgetShipped(l)} < min(${FLAT_CAP}, ${fits}) = ${required} ` +
            `(${l.blocks} districts, widest name ${l.maxName}, longest tally ${l.maxPlate})`,
        );
    }
    expect(lost, `names lost below what the 24-block cap drew:\n${lost.join("\n")}`).toEqual([]);
  });

  it("draws the names of every folded level again, and no fold-free level changes", () => {
    const drawnAfter = LEVELS.filter((l) => l.blocks <= budgetShipped(l)).length;
    const drawnBefore = LEVELS.filter((l) => l.blocks <= l.beforeBudget).length;
    // frontend/src was the level the finding names: 14 districts, silent.
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    expect(src.blocks).toBe(14);
    expect(src.beforeBudget, "the tally divisor silenced this level").toBeLessThan(src.blocks);
    expect(
      budgetShipped(src),
      "the name measure gives it its 14 names back",
    ).toBeGreaterThanOrEqual(src.blocks);
    expect(drawnAfter).toBeGreaterThan(drawnBefore);
    // The one level that stays silent does so because its OWN names overflow:
    // 29 chars is a 205.4 px chip against a 91.3 px pitch — the pitch rule
    // working, not a fold's number silencing it.
    const reviews = LEVELS.find((l) => l.path === "docs/reviews")!;
    expect(reviews.maxPlate).toBe(0);
    expect(namesThatFit(reviews)).toBe(2);
    expect(budgetShipped(reviews)).toBe(2);
    // A level without folds never had a tally line to read — its count must be
    // exactly what it was, so the fix cannot be a quiet blanket raise.
    for (const l of LEVELS.filter((x) => x.maxPlate === 0)) {
      expect(budgetShipped(l), `${l.path} changed without carrying a fold`).toBe(l.beforeBudget);
    }
  });

  it("holds at every bounds the LOD code can produce — and the tally term fails this same sweep", () => {
    // The 9 bounds tests/typeFloor.test.ts guards: 12 … 275, the range where the
    // far tier is reachable at all (CameraRig maxDistance ends it at bounds 275).
    const bounds = [12, 20, 24, 36, 50, 88, 124, 200, 275];
    const widths = LEVELS.map((l) => ({ name: l.maxName, plate: l.maxPlate }));
    for (const b of bounds) {
      for (const w of widths) {
        // removing the tally measure can only ever restore a count, never lower it
        expect(budget(b, w.name)).toBeGreaterThanOrEqual(budget(b, Math.max(w.name, w.plate)));
        // and the invariant the round exists for, at that bounds:
        expect(budget(b, w.name)).toBeGreaterThanOrEqual(Math.min(FLAT_CAP, budget(b, w.name)));
      }
    }
    // POSITIVE CONTROL — put the tally term back into the same guard and the
    // invariant is violated on real levels: a guard that cannot go red is not a
    // gate. The width pairs are the probe's own fold-carrying levels.
    const violated = LEVELS.filter(
      (l) =>
        budget(l.bounds, Math.max(l.maxName, l.maxPlate)) < Math.min(FLAT_CAP, namesThatFit(l)),
    );
    expect(
      violated.map((l) => l.path),
      "the tally divisor must break this guard",
    ).toEqual(["frontend", "frontend/src", "backend"]);
    // The largest difference sits where the enter threshold is RELATIVE to the
    // level: fieldPx = 2·bounds·viewH / (2·tan·4.8·bounds) — bounds cancels, so
    // every level from 36 up projects the same 341.7 px field and the tally term
    // costs the SAME 49 chips there (52 → 3 at 5 name chars / 27 tally chars).
    for (const b of [36, 50, 88, 124, 200, 275]) {
      expect(fieldPx(b)).toBeCloseTo(341.7, 0);
      expect(budget(b, 5) - budget(b, 27)).toBe(49);
    }
    // Below the ABSOLUTE_FLOOR crossover the field does shrink with the level,
    // and the tally term still costs the most at the largest of those bounds.
    expect(budget(24, 5) - budget(24, 27)).toBe(23);
    expect(budget(12, 5) - budget(12, 27)).toBe(5);
  });
});

/**
 * The overlap the same measurement produced, found in the round after the count
 * fix. The gate sizes chips by the widest NAME — right for the count, silent
 * about width: a folded folder draws a SECOND line on its chip, and that line
 * arrives at whatever length the tally string has. Measured through the shipped
 * `getDirLayout` (`.qoder-scratch/skyline-defect-hunter/2026-10-26-tally-overlap/`,
 * run of `pitch-check.ts`, 2026-10-26): on a 14-block level the gate's own
 * screen-pitch — projected field ÷ √N at the tier enter distance — is 91.3 px
 * and the real minimum neighbour distance 72.3 px. Name chips are 66.8–86.6 px
 * and fit that lane; a 25-char tally ("⌄ 30/55 files underground") is a 179.0 px
 * chip — it overdraws exactly one neighbour's name. A chip that paints over its
 * neighbour is a defect, not a style choice.
 *
 * The rule is width-only, per chip, NEVER a count rule: the tally line gets a
 * `maxWidth` derived from the same pitch arithmetic the gate uses, ellipsised,
 * with the full value carried in the element's `title`. Putting the tally width
 * back into the COUNT divisor — the version that shipped for an hour — is the
 * positive control below: it reduced 15 possible chips to 3, and 14 ≤ 3 draws
 * no name at all. An absent 10.5 px glyph protects nobody's lane.
 */
describe("no drawn chip line overdraws its neighbour — the tally width rule", () => {
  const cityTree = readFileSync(path.join(SRC, "components/CityTree.tsx"), "utf-8");
  const number = (name: string): number => {
    const m = cityTree.match(new RegExp(`const ${name} = ([\\d.]+);`));
    expect(m, `CityTree.tsx must ship const ${name}`).not.toBeNull();
    return Number(m?.[1]);
  };
  const chrome = number("CHIP_CHROME_PX");
  const advance = number("CHIP_ADVANCE_EM");
  const glyph = number("CHIP_GLYPH_PX");
  const fovDeg = number("CHIP_FOV_DEG");
  const viewH = number("CHIP_VIEW_H_PX");
  const halfTan = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const enter = (b: number): number =>
    Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, b * LOD_THRESHOLDS.RELATIVE_ENTER);
  const fieldPx = (b: number): number => (2 * b * viewH) / (2 * halfTan * enter(b));
  const chipPx = (chars: number): number => chrome + advance * glyph * chars;
  const budget = (b: number, chars: number): number =>
    Math.max(1, Math.floor((fieldPx(b) / chipPx(chars)) ** 2));
  // The lane one chip is drawn into: the pitch the SHIPPED gate itself assumes
  // — projected field divided by the √N chips standing per row, screen px at
  // the tier's enter distance. (Its optimism of 1.06–1.38× against the real
  // Voronoi minimum neighbour distance is a separate finding, not this rule's
  // to silently absorb: `getDirLayout` exports no pitch.)
  const pitchPx = (b: number, n: number): number => fieldPx(b) / Math.sqrt(Math.max(1, n));

  // The browser probe's own 16 block-carrying levels (item3f-budget.json,
  // transcribed in the describe above; same numbers, width columns only).
  const LEVELS = [
    { path: "frontend", bounds: 61.8, blocks: 2, maxName: 5, maxPlate: 27 },
    { path: "frontend/src", bounds: 134.5, blocks: 14, maxName: 11, maxPlate: 25 },
    { path: "frontend/src/hooks", bounds: 56.6, blocks: 1, maxName: 16, maxPlate: 0 },
    { path: "frontend/tests", bounds: 72.5, blocks: 1, maxName: 7, maxPlate: 0 },
    { path: "backend", bounds: 69.1, blocks: 3, maxName: 5, maxPlate: 25 },
    { path: "backend/tests", bounds: 75, blocks: 2, maxName: 8, maxPlate: 0 },
    { path: "backend/tests/fixtures", bounds: 44.9, blocks: 1, maxName: 6, maxPlate: 0 },
    { path: "backend/src", bounds: 65.7, blocks: 4, maxName: 8, maxPlate: 0 },
    { path: "backend/src/services", bounds: 56.7, blocks: 3, maxName: 8, maxPlate: 0 },
    { path: "backend/src/server", bounds: 57.8, blocks: 1, maxName: 6, maxPlate: 0 },
    { path: "backend/rules", bounds: 45.6, blocks: 1, maxName: 13, maxPlate: 0 },
    { path: "docs", bounds: 47.6, blocks: 1, maxName: 7, maxPlate: 0 },
    { path: "docs/reviews", bounds: 98.4, blocks: 14, maxName: 29, maxPlate: 0 },
    {
      path: "docs/reviews/2026-10-22-importbeschriftung",
      bounds: 51.8,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
    },
    {
      path: "docs/reviews/2026-10-22-praxistest",
      bounds: 51.6,
      blocks: 1,
      maxName: 6,
      maxPlate: 0,
    },
    { path: "dist-package", bounds: 47.3, blocks: 1, maxName: 7, maxPlate: 0 },
  ] as const;

  // What the app ACTUALLY computes, read off the shipped call site: the name
  // only, or — should the tally width ever return to the divisor — the longest
  // line as well. The assertions below follow the source, not a preference.
  const at = cityTree.indexOf("const farChipBudget");
  expect(at, "the far tier's budget gate is gone from CityTree.tsx").toBeGreaterThan(-1);
  const call = cityTree.slice(at, cityTree.indexOf(": 0;", at));
  const tallyInDivisor = /undergroundPlateLine|remainingFiles/.test(call);
  const appBudget = (l: (typeof LEVELS)[number]): number =>
    budget(l.bounds, tallyInDivisor ? Math.max(l.maxName, l.maxPlate) : l.maxName);

  // The tally render branch: does the shipped line clamp itself to the lane?
  const tallyAt = cityTree.indexOf("b.dir.remainingFiles > 0 && (");
  const tallyDiv = cityTree.slice(tallyAt, tallyAt + 700);
  const clamped = tallyAt > -1 && /maxWidth/.test(tallyDiv);

  it("clamps the tally line to a pitch-derived max-width, with the full value in title", () => {
    expect(tallyAt, "the folded folder's tally line is gone from the chip").toBeGreaterThan(-1);
    // the cap is declared from the pitch helper and the line reads that cap —
    // one wire through the file, so neither half can be dropped silently
    const capAt = cityTree.indexOf("const farTallyMaxWidthPx");
    expect(capAt, "the tally width cap declaration is gone from CityTree.tsx").toBeGreaterThan(-1);
    expect(
      cityTree.slice(capAt, cityTree.indexOf(";", cityTree.indexOf(":", capAt))),
      "the cap must be derived from the gate's own pitch arithmetic",
    ).toContain("districtChipPitchPx(");
    expect(tallyDiv).toMatch(/maxWidth: farTallyMaxWidthPx/);
    expect(tallyDiv).toContain('textOverflow: "ellipsis"');
    expect(tallyDiv, "the untruncated tally stays reachable on the element").toContain(
      "title={undergroundPlateLine(",
    );
    // …and the clamp is a WIDTH rule only: the count gate still reads the name.
    expect(
      tallyInDivisor,
      "the tally width may never re-enter the count divisor — that version is the defect this round replaces",
    ).toBe(false);
  });

  it("keeps every line of every DRAWN level inside the lane it is drawn into", () => {
    const offenders: string[] = [];
    for (const l of LEVELS) {
      if (l.blocks > appBudget(l)) continue; // this level draws no chips at all
      const pitch = pitchPx(l.bounds, l.blocks);
      if (chipPx(l.maxName) > pitch)
        offenders.push(
          `${l.path}: name chip ${chipPx(l.maxName).toFixed(1)} px > pitch ${pitch.toFixed(1)} px`,
        );
      if (l.maxPlate > 0) {
        const tallyPx = clamped ? Math.min(chipPx(l.maxPlate), pitch) : chipPx(l.maxPlate);
        if (tallyPx > pitch)
          offenders.push(
            `${l.path}: tally line ${tallyPx.toFixed(1)} px > pitch ${pitch.toFixed(1)} px ` +
              `(unclamped chip would be ${chipPx(l.maxPlate).toFixed(1)} px)`,
          );
      }
    }
    expect(offenders, `a chip line overdraws its neighbour:\n${offenders.join("\n")}`).toEqual([]);
    // NOT vacuous: unclamped, the widest tally of a drawn level breaks its lane —
    // the defect this guard pins. frontend/src: 14 ≤ 15 chips ARE drawn.
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    expect(chipPx(src.maxPlate)).toBeGreaterThan(pitchPx(src.bounds, src.blocks));
    // …and the names never needed the clamp: 86.6 px fits the 91.3 px lane. The
    // rule must stay tally-only.
    expect(chipPx(src.maxName)).toBeLessThanOrEqual(pitchPx(src.bounds, src.blocks));
  });

  it("protects the inherited count: 15 of 16 levels draw their names, frontend/src included", () => {
    const drawn = LEVELS.filter((l) => l.blocks <= appBudget(l));
    expect(drawn.length, "levels drawing district names").toBe(15);
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    expect(src.blocks).toBe(14);
    expect(appBudget(src), "14 districts must clear their own divisor").toBeGreaterThanOrEqual(
      src.blocks,
    );
    // POSITIVE CONTROL (arithmetic mirror of the shipped-file control run
    // 2026-10-26): with the tally term back in the divisor the drawn count
    // drops to 14 and frontend/src goes silent — this same assertion goes red.
    const drawnUnderTallyDivisor = LEVELS.filter(
      (l) => l.blocks <= budget(l.bounds, Math.max(l.maxName, l.maxPlate)),
    );
    expect(drawnUnderTallyDivisor.length).toBe(14);
    expect(
      budget(src.bounds, Math.max(src.maxName, src.maxPlate)),
      "the tally divisor silenced this level once and would again",
    ).toBeLessThan(src.blocks);
  });
});

/**
 * The round that answered the previous one's own open item: "`title` ist
 * DOM-seitig gesetzt, aber Hover bleibt durch bestehendes `pointerEvents:none`
 * an der Experience-Lane." Re-measured, not trusted — three facts, all of them
 * read off the shipped file or asked of a real DOM:
 *
 * - The far chip declares `pointerEvents: "none"` on its OWN plate (the line is
 *   extracted below and handed to a DOM, which computes it back), and nothing in
 *   the chip re-declares `auto`. That declaration is load-bearing, not sloppiness:
 *   `tests/ma21-mastLabel.test.ts:77-85` measured what a drei `Html` plate that
 *   catches pointer events does to the city — a grip placed on it no longer orbits
 *   anything. The labels must keep letting the user drag.
 * - There is no other pointer either: no click handler, no tab stop on the chip,
 *   and the far tier draws no `District` plot at all (that branch sits behind
 *   `!lodFar`), so the close tier's click-into-the-panel route does not exist here.
 * - jsdom ships no layout, so `document.elementFromPoint` is `undefined`: the
 *   hit-test cannot be simulated into agreeing, which is exactly why the value may
 *   not be left to depend on one. `ephe-preview.test.tsx:835-841` reached the same
 *   conclusion for the resident card.
 *
 * A `title` no mouse can summon is therefore not a carrier, and "12…" with no
 * route is a number the OLD (overlapping) chip at least painted. The full value
 * now rides the chip's accessible name — the channel the close tier's street sign
 * already uses (`District.tsx` `aria-label` on the plate), produced by the same
 * `undergroundPlateLine` in both languages. It needs no mouse and takes nothing
 * from the canvas.
 *
 * The capped case is the measured one (browser probe item3f, restated above):
 * `frontend/src`, bounds 134.5, 14 blocks, one folder folded behind
 * "⌄ 30/55 files underground" — a 179.0 px line in a 91.3 px lane, cut to 11 of
 * its 25 characters. POSITIVE CONTROL, run against the real file this round:
 * delete the chip's `aria-label` line in `CityTree.tsx` and the second `it` below
 * goes red on "a truncated tally with no machine-readable carrier".
 */
describe("a clamped chip line keeps its value without a hover", () => {
  const cityTree = readFileSync(path.join(SRC, "components/CityTree.tsx"), "utf-8");
  const chipAt = cityTree.indexOf("district-label-");
  expect(chipAt, "the far-zoom district chip block is gone from CityTree.tsx").toBeGreaterThan(-1);
  const chip = cityTree.slice(chipAt, cityTree.indexOf("</Html>", chipAt));

  const shipped = (name: string): number => {
    const m = cityTree.match(new RegExp(`const ${name} = ([\\d.]+);`));
    expect(m, `CityTree.tsx must ship const ${name}`).not.toBeNull();
    return Number(m?.[1]);
  };
  const chrome = shipped("CHIP_CHROME_PX");
  const advance = shipped("CHIP_ADVANCE_EM");
  const glyph = shipped("CHIP_GLYPH_PX");

  // The level the shipped cap actually cuts, on the shipped pitch arithmetic.
  const folded = dir({ path: "frontend/src", fileCount: 55, remainingFiles: 30 });
  const plateLine = undergroundPlateLine("en", folded.remainingFiles, folded.fileCount);
  const pitchPx = districtChipPitchPx(134.5, 14);

  it("is un-hoverable by design — the plate keeps the city's drag, so a title is no route", () => {
    const decl = /pointerEvents:\s*"([^"]+)"/.exec(chip);
    expect(decl, "the district chip no longer declares pointer-events at all").not.toBeNull();
    const declared = decl?.[1] ?? "";
    expect(declared, "a chip that takes pointer events eats the orbit drag").toBe("none");

    // What the SHIPPED declaration computes to, in a real DOM — the value is read
    // out of the source, never typed in here.
    const plate = document.createElement("div");
    plate.style.setProperty("pointer-events", declared);
    const line = document.createElement("div");
    plate.appendChild(line);
    document.body.appendChild(plate);
    expect(window.getComputedStyle(plate).pointerEvents).toBe("none");
    expect(window.getComputedStyle(line).pointerEvents).toBe("none");
    plate.remove();

    // A browser rules the same way for the ellipsised line, for a different
    // reason: `pointer-events` does not inherit, so a descendant escapes only by
    // re-declaring `auto`. Nothing in the chip does — that is the one and only way
    // this `title` could ever have been summoned, and it is the drag the city pays
    // for.
    expect(
      chip,
      "an auto re-declaration would be the chip's only hover route — and would take the drag",
    ).not.toMatch(/pointerEvents:\s*["']auto["']/);
    // No hit-testing exists in this DOM, so nothing here pretends to hover:
    expect(typeof document.elementFromPoint, "jsdom has no layout to hit-test").toBe("undefined");
    // …and no other pointer is on the chip: no handler, no tab stop, no focus.
    expect(chip).not.toMatch(/onClick=|onPointerDown=|onFocus=|tabIndex=/);
    const districtAt = cityTree.search(/<District[\s\n]/);
    expect(districtAt, "the close tier's districts are gone from CityTree.tsx").toBeGreaterThan(-1);
    expect(
      cityTree.slice(Math.max(0, districtAt - 400), districtAt),
      "districts stand behind a `!lodFar` guard: the far tier has no clickable plot to open",
    ).toContain("!lodFar");
  });

  it("carries the un-capped tally of a capped level in an attribute the DOM exposes", () => {
    // 1. the case is genuinely truncated by the shipped cap — otherwise this
    //    guard protects nothing: 179.0 px line against a 91.3 px lane, and the
    //    cap leaves 11 of the line's 25 characters.
    const linePx = chrome + advance * glyph * plateLine.length;
    const capPx = Math.max(0, pitchPx - chrome);
    expect(
      linePx,
      "the tally is no longer wider than its lane — nothing is truncated here",
    ).toBeGreaterThan(pitchPx);
    expect(Math.floor(capPx / (advance * glyph)), "the cap cuts no character").toBeLessThan(
      plateLine.length,
    );

    // 2. the shipped wire: the chip declares an accessible name under exactly the
    //    predicate that draws the truncated line, so label and line cannot come
    //    apart, and the name is produced by the un-truncated call itself.
    const labelAttr = /aria-label=\{([^}]*)\}/.exec(chip);
    expect(labelAttr, "a truncated tally with no machine-readable carrier").not.toBeNull();
    expect(
      labelAttr?.[1] ?? "",
      "the label must be gated by the same condition that draws the tally line",
    ).toContain("b.dir.remainingFiles > 0");
    expect(chip, "the folded folder's tally branch is gone").toContain(
      "b.dir.remainingFiles > 0 && (",
    );
    const labelBody = cityTree.slice(cityTree.indexOf("export function districtChipLabel"));
    const call = /undergroundPlateLine\(([^)]*)\)/.exec(labelBody)?.[1] ?? "";
    expect(
      call.replace(/\s+/g, " ").trim(),
      "the accessible name must be built by the same un-truncated line the plate paints",
    ).toBe("lang, dir.remainingFiles, dir.fileCount");

    // 3. the machine-readable place, in a real DOM: the attribute and the name it
    //    gives the node — both carry every digit the clamp cut.
    const plate = document.createElement("div");
    plate.setAttribute("aria-label", districtChipLabel("en", folded));
    document.body.appendChild(plate);
    expect(
      plate.getAttribute("aria-label"),
      "the un-capped number must be readable off the node",
    ).toContain("30/55");
    expect(plate.ariaLabel).toBe(`src — ${plateLine}`);
    plate.remove();
    // Both languages, from the dictionary — the label is the plate's own words.
    expect(districtChipLabel("de", folded)).toBe(`src — ${undergroundPlateLine("de", 30, 55)}`);
  });
});

/**
 * The honest pitch, at last. Both rounds before this one said the same thing
 * about the number they were using and did not fix it: `districtChipBudget` and
 * `districtChipPitchPx` divided the projected `bounds` square by √N — a MODEL of
 * how evenly a level's plots stand — and `bounds` counts the plaza, the podium
 * and the rim as room for plots. Measured through `getDirLayout` on the 16
 * block-carrying levels of the repo self-scan (real child names, real line
 * counts, real plaza files; `.qoder-scratch/team/world-honest-pitch/`), the
 * model opened a lane 1.06x–1.27x wider than the plots really stand apart, and
 * `frontend/src` is the case: model 91.3 px, measured 73.8 px, name chips up to
 * 86.6 px, tally chip 179.0 px. So the cap the last round shipped (77.33 px of
 * content inside a 91.3 px "lane") never prevented the overdraw it was written
 * for, and the name line was a second, uncapped path.
 *
 * The honest number is `DirLayout.minBlockPitch`: the smallest centre-to-centre
 * distance between two of the level's placed blocks, measured once while the
 * layout is built. It is the right denominator for this chip because the chip is
 * a screen rectangle pinned by `<Html center>` exactly ON a block centre: two
 * rectangles centred `d` apart overlap as soon as `(w1 + w2)/2 > d`, so capping
 * EVERY chip at the smallest real `d` makes overdraw impossible for every pair at
 * once. Cell-boundary or incircle radii were the alternatives and are the wrong
 * measure — they say how big a PLOT may be, and the roads are drawn on them; a
 * plate has nothing to do with the border it does not touch. And because an
 * `<Html>` plate carries no depth order (the far tier has no occlusion at all),
 * only the radial distance says that a pair the orbit azimuth happens to align
 * with the view direction is safe too.
 *
 * With the lane measured, the two rules answer different questions and both are
 * honest: the WIDTH of a chip caps to the lane (name and tally — `frontend/src`
 * now shows 9 of the 11 characters of `interaction` and 9 of 10 of `components`,
 * and the 25-char tally loses its last two), and the COUNT asks whether that lane
 * carries a name this level actually draws — its narrowest one. `docs/reviews`
 * (26–29-char names in an 81.9 px lane, which holds 10 characters) therefore
 * stays silent, and now stays silent for a measured reason instead of because a
 * formula guessed it. No level changes its draw/silence decision: 15 of 16 keep
 * their names, exactly as the last two rounds inherited.
 */
describe("the chip rules sit on the measured pitch, not on a model of it", () => {
  const cityTree = readFileSync(path.join(SRC, "components/CityTree.tsx"), "utf-8");
  const number = (name: string): number => {
    const m = cityTree.match(new RegExp(`const ${name} = ([\\d.]+);`));
    expect(m, `CityTree.tsx must ship const ${name}`).not.toBeNull();
    return Number(m?.[1]);
  };
  const chrome = number("CHIP_CHROME_PX");
  const advance = number("CHIP_ADVANCE_EM");
  const glyph = number("CHIP_GLYPH_PX");
  const fovDeg = number("CHIP_FOV_DEG");
  const viewH = number("CHIP_VIEW_H_PX");
  const halfTan = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const enter = (b: number): number =>
    Math.max(LOD_THRESHOLDS.ABSOLUTE_FLOOR, b * LOD_THRESHOLDS.RELATIVE_ENTER);
  const fieldPx = (b: number): number => (2 * b * viewH) / (2 * halfTan * enter(b));
  const chipPx = (chars: number): number => chrome + advance * glyph * chars;
  // The shipped branches of `districtChipPitchPx`, read off its source: the
  // measured pitch projected, and — for a caller with nothing to measure — the
  // model field divided by √N.
  const honestLane = (bounds: number, pitch: number): number =>
    (pitch * fieldPx(bounds)) / (2 * bounds);
  const modelLane = (bounds: number, blocks: number): number =>
    fieldPx(bounds) / Math.sqrt(Math.max(1, blocks));
  const honestBudget = (bounds: number, pitch: number, nameChars: number, blocks: number): number =>
    Math.max(1, Math.floor(blocks * (honestLane(bounds, pitch) / chipPx(nameChars)) ** 2));
  const modelBudget = (bounds: number, nameChars: number): number =>
    Math.max(1, Math.floor((fieldPx(bounds) / chipPx(nameChars)) ** 2));

  /**
   * The 16 block-carrying levels of the browser probe, with the lane the shipped
   * layout measures for them (`minBlockPitch`, world units; bounds and
   * `minBlockPitch` are transcribed from
   * `.qoder-scratch/team/world-honest-pitch/honest-after-run.txt`, the name and
   * plate columns from the probe's own record `item3f-budget.json`). Above the
   * `ABSOLUTE_FLOOR` crossover `bounds` cancels out of the projection, so the
   * lane is the level's shape ratio read at the enter distance: the same number
   * the running app gets for these levels. One row per level:
   * `[path, bounds, blocks, minBlockPitch, minName, maxName, maxPlate]`.
   */
  const LEVELS = (
    [
      ["frontend", 62.2, 2, 75.61, 3, 5, 27],
      ["frontend/src", 130.4, 14, 56.36, 4, 11, 25],
      ["frontend/src/hooks", 52.5, 1, 105.07, 16, 16, 0],
      ["frontend/tests", 61.7, 1, 123.44, 7, 7, 0],
      ["backend", 64.3, 3, 69.86, 3, 5, 25],
      ["backend/tests", 63.8, 2, 74.78, 7, 8, 0],
      ["backend/tests/fixtures", 45.2, 1, 90.31, 6, 6, 0],
      ["backend/src", 68, 4, 53.67, 5, 8, 0],
      ["backend/src/services", 57.1, 3, 59.83, 6, 8, 0],
      ["backend/src/server", 53.5, 1, 107.08, 6, 6, 0],
      ["backend/rules", 45.6, 1, 91.26, 13, 13, 0],
      ["docs", 60, 1, 119.97, 7, 7, 0],
      ["docs/reviews", 132.4, 14, 63.48, 14, 29, 0],
      ["docs/reviews/2026-10-22-importbeschriftung", 51.8, 1, 103.59, 6, 6, 0],
      ["docs/reviews/2026-10-22-praxistest", 53.2, 1, 106.46, 6, 6, 0],
      ["dist-package", 54, 1, 107.98, 7, 7, 0],
    ] as const
  ).map(([path, bounds, blocks, pitch, minName, maxName, maxPlate]) => ({
    path,
    bounds,
    blocks,
    pitch,
    minName,
    maxName,
    maxPlate,
  }));

  it("measures the lane in the layout that places the blocks — both modes", async () => {
    const { getDirLayout, setLayoutMode } = await import("../src/city/layout");
    const { city, dir } = await import("./helpers/cityFixture");
    const bruteForce = (pts: readonly { x: number; z: number }[]): number => {
      let min = Infinity;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          min = Math.min(min, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z));
      return min;
    };
    const level = (names: string[]) =>
      city({
        tree: dir({
          name: "",
          path: "",
          children: names.map((n, i) =>
            dir({ name: n, path: `probe/${n}`, linesOfCode: 900 + i * 260, fileCount: 3 + i }),
          ),
        }),
      });
    const shapes = [["solo"], ["a", "b"], ["src", "test", "docs"], ["a", "b", "c", "d", "e", "f"]];
    for (const mode of ["voronoi", "grid"] as const) {
      setLayoutMode(mode);
      for (const names of shapes) {
        const layout = getDirLayout(level(names), []);
        expect(layout.minBlockPitch, `${mode}: ${names.length} blocks export no lane`).toBeTypeOf(
          "number",
        );
        const measured = bruteForce(layout.blocks);
        // one block: no neighbour, so the level's own width is the lane
        const expected = Number.isFinite(measured) ? measured : 2 * layout.bounds;
        expect(layout.minBlockPitch, `${mode}: ${names.length} blocks`).toBeCloseTo(expected, 6);
        // and the shipped rule reads exactly that number, projected at the tier's
        // own enter distance — the guard's arithmetic is the app's arithmetic
        expect(
          districtChipPitchPx(layout.bounds, layout.blocks.length, layout.minBlockPitch),
          `${mode}: ${names.length} blocks, lane`,
        ).toBeCloseTo(honestLane(layout.bounds, expected), 6);
      }
    }
    setLayoutMode("voronoi");
  });

  it("puts BOTH chip rules on the measured lane, and caps both drawn lines", () => {
    const budgetAt = cityTree.indexOf("const farChipBudget");
    expect(budgetAt, "the far tier's budget gate is gone from CityTree.tsx").toBeGreaterThan(-1);
    const budgetCall = cityTree.slice(budgetAt, cityTree.indexOf(": 0;", budgetAt));
    expect(budgetCall).toContain("districtChipBudget(");
    expect(budgetCall, "the count gate still reads a folder name").toContain("b.dir.name.length");
    expect(
      budgetCall,
      "the count gate must be handed the layout's measured pitch, not guess one",
    ).toContain("layout.minBlockPitch");
    expect(
      budgetCall,
      "and the level's own block count, since the lane no longer comes from √N",
    ).toContain("layout.blocks.length");
    expect(
      /undergroundPlateLine|remainingFiles/.test(budgetCall),
      "a folded folder's tally line may not size the count every district is gated on",
    ).toBe(false);

    const capAt = cityTree.indexOf("const farChipMaxWidthPx");
    expect(capAt, "the plate cap on the measured lane is gone from CityTree.tsx").toBeGreaterThan(
      -1,
    );
    expect(
      cityTree.slice(capAt, cityTree.indexOf(";", cityTree.indexOf(":", capAt))),
      "the plate cap must come from the measured lane",
    ).toContain("districtChipPitchPx(layout.bounds, layout.blocks.length, layout.minBlockPitch)");
    // …and it is on the PLATE, so the name line answers to it and not only the tally
    const chipAt = cityTree.indexOf("district-label-");
    const plate = cityTree.slice(chipAt, cityTree.indexOf("{b.dir.name}", chipAt));
    expect(plate, "the chip plate no longer caps its width").toContain(
      "maxWidth: farChipMaxWidthPx",
    );
    expect(plate, "a capped plate without a clip cannot ellipsis").toContain('overflow: "hidden"');
    // The lane is the chip's TOTAL width, so the cap has to land on the border
    // box. Tailwind's preflight (`*, box-sizing: border-box`) gives that to every
    // element and `globals.css` is imported in `main.tsx` — said out loud on the
    // plate itself, so the +14 px of chrome cannot walk back into the neighbour's
    // lane if that base layer ever stops applying.
    expect(plate, "the plate no longer declares its own box-sizing").toContain(
      'boxSizing: "border-box"',
    );
    // the tally line keeps its own cap, now on the same measured lane
    const tallyAt = cityTree.indexOf("b.dir.remainingFiles > 0 && (");
    expect(tallyAt).toBeGreaterThan(-1);
    expect(cityTree.slice(tallyAt, tallyAt + 700)).toMatch(/maxWidth: farTallyMaxWidthPx/);
    const tallyCapAt = cityTree.indexOf("const farTallyMaxWidthPx");
    expect(
      cityTree.slice(tallyCapAt, cityTree.indexOf(";", cityTree.indexOf(":", tallyCapAt))),
      "the tally cap must be derived from the measured lane too",
    ).toContain("layout.minBlockPitch");
  });

  it("keeps every DRAWN chip line inside the gap the layout really has", () => {
    const offenders: string[] = [];
    for (const l of LEVELS) {
      const lane = honestLane(l.bounds, l.pitch);
      if (l.blocks > honestBudget(l.bounds, l.pitch, l.minName, l.blocks)) continue; // silent level
      // both lines of the chip, read as the shipped plate renders them
      const namePx = Math.min(chipPx(l.maxName), lane);
      const tallyPx = l.maxPlate > 0 ? Math.min(chipPx(l.maxPlate), lane) : 0;
      if (namePx > lane)
        offenders.push(`${l.path}: drawn name ${namePx.toFixed(1)} px > gap ${lane.toFixed(1)} px`);
      if (tallyPx > lane)
        offenders.push(
          `${l.path}: drawn tally ${tallyPx.toFixed(1)} px > gap ${lane.toFixed(1)} px`,
        );
      // the exact pairwise bound, not just the conservative one: two rectangles
      // centred `d` apart overlap once (w1+w2)/2 > d, and every w here ≤ the
      // smallest d, so no pair can. Asserted, not assumed.
      const widest = Math.max(namePx, tallyPx);
      if (widest / 2 + widest / 2 > lane + 1e-9)
        offenders.push(
          `${l.path}: widest chip ${widest.toFixed(1)} px cannot stand in ${lane.toFixed(1)} px`,
        );
    }
    expect(
      offenders,
      `a drawn chip line overdraws its neighbour:\n${offenders.join("\n")}`,
    ).toEqual([]);
    // NOT vacuous: on frontend/src the name line is the second path the finding
    // named — 86.6 px natural against a 73.8 px gap. It only stays inside because
    // the plate caps it.
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    const srcLane = honestLane(src.bounds, src.pitch);
    expect(chipPx(src.maxName), "the honest measure must still bite on this level").toBeGreaterThan(
      srcLane,
    );
    expect(chipPx(src.maxPlate)).toBeGreaterThan(srcLane);
    expect(Math.min(chipPx(src.maxName), srcLane)).toBeLessThanOrEqual(srcLane);
    // and the model that used to be the lane is wider than the city is
    for (const l of LEVELS)
      if (l.blocks > 1)
        expect(
          modelLane(l.bounds, l.blocks),
          `${l.path} model lane is not optimistic`,
        ).toBeGreaterThan(honestLane(l.bounds, l.pitch));
  });

  it("protects the inherited count: 15 of 16 levels draw names, docs/reviews stays silent", () => {
    const drawn = LEVELS.filter(
      (l) => l.blocks <= honestBudget(l.bounds, l.pitch, l.minName, l.blocks),
    );
    expect(drawn.length, "levels drawing district names").toBe(15);
    expect(drawn.map((l) => l.path)).not.toContain("docs/reviews");
    const reviews = LEVELS.find((l) => l.path === "docs/reviews")!;
    expect(reviews.blocks).toBe(14);
    expect(honestBudget(reviews.bounds, reviews.pitch, reviews.minName, reviews.blocks)).toBe(8);
    // it was silent under the model too, and for the same reason now measured: the
    // lane holds 10 characters, its shortest name is 14
    expect(modelBudget(reviews.bounds, reviews.maxName)).toBe(2);
    expect(chipPx(reviews.minName)).toBeGreaterThan(honestLane(reviews.bounds, reviews.pitch));
    // the level the last two rounds fought for still stands
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    expect(src.blocks).toBe(14);
    expect(honestBudget(src.bounds, src.pitch, src.minName, src.blocks)).toBeGreaterThanOrEqual(
      src.blocks,
    );
    // no level flips its decision against the model era: same 15 draw, same 1 silent
    const drawnUnderModel = LEVELS.filter((l) => l.blocks <= modelBudget(l.bounds, l.maxName));
    expect(drawnUnderModel.map((l) => l.path).sort()).toEqual(drawn.map((l) => l.path).sort());
  });

  it("POSITIVE CONTROL: put the model pitch back and this same guard goes red", () => {
    // The guard above is a measurement, not a tautology: run the identical
    // invariant on the level's MODEL lane (the number the shipped rules used
    // until this round, i.e. `districtChipPitchPx(bounds, blocks)` with nothing
    // measured behind it) and the drawn lines break the real gap.
    const red: string[] = [];
    for (const l of LEVELS) {
      const lane = modelLane(l.bounds, l.blocks);
      if (l.blocks > modelBudget(l.bounds, l.maxName)) continue;
      const gap = honestLane(l.bounds, l.pitch);
      const namePx = Math.min(chipPx(l.maxName), lane);
      const tallyPx = l.maxPlate > 0 ? Math.min(chipPx(l.maxPlate), lane) : 0;
      if (namePx > gap)
        red.push(`${l.path}: name chip ${namePx.toFixed(1)} px > gap ${gap.toFixed(1)} px`);
      if (tallyPx > gap)
        red.push(`${l.path}: tally line ${tallyPx.toFixed(1)} px > gap ${gap.toFixed(1)} px`);
    }
    // The two lines the finding measured, and nothing else: the model lane is
    // only 1.06x–1.27x optimistic, so it breaks exactly the level that is tight.
    expect(red, "the model pitch must break the honest invariant").toEqual([
      "frontend/src: name chip 86.6 px > gap 73.8 px",
      "frontend/src: tally line 91.3 px > gap 73.8 px",
    ]);
    // and the count gate reads the wrong number too: it lets 14 names into a lane
    // its own formula never measured
    const src = LEVELS.find((l) => l.path === "frontend/src")!;
    expect(modelBudget(src.bounds, src.maxName), "the model gate guessed 15 chips").toBe(15);
    expect(chipPx(src.maxName)).toBeGreaterThan(honestLane(src.bounds, src.pitch));
  });
});
