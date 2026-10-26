/**
 * The token layer is only a layer while nothing bypasses it.
 *
 * Two bypasses had accumulated by 2026-10-18 and both are the kind that never
 * gets fixed later, because each one reads as harmless where it stands: a
 * `text-[11px]` that happens to equal `--fs-meta` today and silently differs the
 * day the scale moves, and a `#e8b23c` typed out again next to the token that
 * already names it. The scale and the accent are design decisions the operator
 * argued for; a literal is a decision nobody is holding.
 *
 * The WebGL layer is exempt and says why: three.js takes numbers, not CSS
 * custom properties, so `city/palette.ts` is the one place a hex is a legitimate
 * literal — it is the source the tokens are derived from, not a copy of them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src");

/** Every literal hex, with the file it lives in. */
function scan(): Array<{ rel: string; text: string }> {
  const out: Array<{ rel: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry))
        out.push({ rel: path.relative(SRC, full), text: readFileSync(full, "utf-8") });
    }
  };
  walk(SRC);
  return out;
}

const files = scan();
const count = (where: (rel: string) => boolean, needle: RegExp): number =>
  files.filter((f) => where(f.rel)).reduce((n, f) => n + (f.text.match(needle) ?? []).length, 0);

describe("the type scale", () => {
  /**
   * `--fs-meta` is 11px today, so every one of these was invisible. It stays
   * invisible only while the scale never moves — and the scale is the thing this
   * file exists to let move.
   */
  it("carries no one-off 11px text", () => {
    expect(
      count(() => true, /text-\[11px\]/g),
      "use text-[length:var(--fs-meta)]",
    ).toBe(0);
  });

  it("carries no raw font-size in a pixel value outside the scale file", () => {
    /**
     * 95 of these still sit in the six older stylesheets. They are pinned as a
     * budget rather than fixed in this commit, because each one needs its own
     * look: a raw px in a caption is a mistake, a raw px in a headline is a
     * decision. Lower the number when one of them becomes a token; never raise it.
     */
    const PX_BUDGET = 95;
    const seen = files
      .filter((f) => f.rel.startsWith("design/") && f.rel !== "design/globals.css")
      .reduce((n, f) => n + (f.text.match(/font-size:\s*\d+px/g) ?? []).length, 0);
    expect(
      seen,
      `${seen} raw px font-size in the stylesheets — budget ${PX_BUDGET}`,
    ).toBeLessThanOrEqual(PX_BUDGET);
  });
});

describe("the accent", () => {
  it("is declared once, under a name that says what it is", () => {
    const globals = files.find((f) => f.rel === "design/globals.css");
    expect(globals?.text).toMatch(/--accent-gold:\s*#e8b23c/);
    // `--color-blue` named a gold for as long as the token layer existed
    expect(globals?.text).not.toMatch(/--color-blue/);
  });

  /**
   * The exempt files hand colours to three.js and to a canvas 2D context, which
   * read numbers and strings, not custom properties. They are the palette's
   * consumers, not the token's — and the list is short on purpose: a new DOM
   * component that types the accent by hand fails here.
   */
  const WEBGL = [
    "city/palette.ts",
    "components/Building.tsx",
    "components/CameraRig.tsx",
    "components/CityConnections.tsx",
    "components/Minimap.tsx",
  ];

  it("is written as a literal nowhere but the token and the WebGL layer", () => {
    const offenders = files
      .filter((f) => !WEBGL.includes(f.rel) && f.rel !== "design/globals.css")
      .filter((f) => /#e8b23c/i.test(f.text))
      .map((f) => f.rel);
    expect(offenders, `#e8b23c typed by hand in ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("the long tail", () => {
  /**
   * The rest of the inline colours in the DOM components are rgba() tints and
   * severity tones that have no token yet. This number is the debt, pinned so it
   * cannot grow while that migration is scheduled; it went DOWN the day this
   * file was written, and every later drop should replace the budget with the
   * new number rather than raise it.
   *
   * 2026-10-22: the import arc's two cores moved to `ENV`, which took the count
   * from 220 to 218 — and showed the budget had been sitting 69 above its own
   * measurement since. It is the number, not the headroom.
   */
  const HEX_BUDGET = 218;

  it("holds the inline hex count in DOM components at its measured number", () => {
    const dom = files.filter(
      (f) =>
        (f.rel.startsWith("components/") || f.rel === "App.tsx") &&
        !/Scene|Building|Road|Voxel|Heat|Particle|Pedestrian|Clone|City|Minimap|CameraRig/i.test(
          f.rel,
        ),
    );
    const seen = dom.reduce((n, f) => n + (f.text.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length, 0);
    expect(
      seen,
      `${seen} inline hex in ${dom.length} DOM files — budget ${HEX_BUDGET}; add a token instead of a literal`,
    ).toBeLessThanOrEqual(HEX_BUDGET);
  });
});
