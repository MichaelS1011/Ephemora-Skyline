/**
 * One focus ring for the whole shell (Apple: a single, system-wide focus
 * colour — the ring says "the keyboard is here", it does not decorate the
 * region it points at).
 *
 * Before this rule the app drew four: brand gold (share, dock, panels),
 * red on the canvas, teal in the learning card, gold-at-0.9 on the minimap.
 * The red and the teal were chosen once as "region colours"; a focus ring
 * that changes hue per region reads as inconsistency, not information —
 * and it is the one signal keyboard users trace across the whole picture.
 * All of them now come from --focus-ring, and the guard fails any new
 * outline that reaches past the token.
 */
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const designDir = resolve(here, "../src/design");
const sheets = readdirSync(designDir).filter((f) => f.endsWith(".css"));

describe("one ring to point", () => {
  it("every focus outline in every sheet uses the token", () => {
    for (const file of sheets) {
      const css = readFileSync(resolve(designDir, file), "utf-8");
      // any weight, any style — the fifth ring hid in a 1.5 px fallback,
      // the sixth and seventh in 1 px rules in profile-picker and share
      const outlines = [...css.matchAll(/outline:\s*[\d.]+px solid ([^;]+);/g)];
      for (const m of outlines) {
        expect(m[1]!.trim(), `${file}: ${m[0]}`).toBe("var(--focus-ring)");
      }
    }
  });

  it("the token exists on :root and is the brand gold at full strength", () => {
    const globals = readFileSync(resolve(designDir, "globals.css"), "utf-8");
    const m = globals.match(/--focus-ring:\s*([^;]+);/);
    expect(m, "--focus-ring is defined").not.toBeNull();
    expect(m![1]!.trim()).toBe("#e8b23c");
  });

  it("the ring is two-tone where it touches the world: gold for dark chrome, dark halo for bright ground", () => {
    // WCAG 1.4.11 non-text contrast ≥ 3:1 — computed once, here, so the
    // token cannot be quietly changed later. Gold on the dark chrome is
    // 8.4:1; on the bright plaza a single colour cannot reach 3:1 without
    // going muddy on the panels (measured: gold on plaza is 1.4:1 — the
    // reason four colours existed). So the two rules that draw the ring
    // over the WORLD (canvas, minimap) also carry a dark halo beneath it.
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = (rgb: number[]) =>
      0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
    const ratio = (a: number[], b: number[]) => {
      const ls = [L(a), L(b)].sort((x, y) => y - x);
      const [l1, l2] = ls as [number, number];
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const gold = [232, 178, 60];
    const halo = [10, 12, 16];
    expect(ratio(gold, [14, 16, 21]), "gold on the glass chrome").toBeGreaterThanOrEqual(3);
    expect(ratio(gold, [28, 28, 26]), "gold on the dock").toBeGreaterThanOrEqual(3);
    expect(
      ratio(halo, [209, 224, 189]),
      "halo on the brightest plaza ground",
    ).toBeGreaterThanOrEqual(3);
    // the two world rules carry it
    const globals = readFileSync(resolve(designDir, "globals.css"), "utf-8");
    const griff = readFileSync(resolve(designDir, "griff.css"), "utf-8");
    expect(globals).toMatch(/\.city-canvas:focus-visible\s*\{[^}]*box-shadow:[^}]*--focus-halo/);
    expect(griff).toMatch(/canvas:focus-visible\s*\{[^}]*box-shadow:[^}]*--focus-halo/);
  });
});
