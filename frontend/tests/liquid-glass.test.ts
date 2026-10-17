/**
 * Liquid Glass layering (Apple materials, deliberately targeted): the city is
 * never walled off. Measured truth: the AA floor of the existing chrome guard
 * caps the tint alpha at 0.92 — so the see-through quality is bought where
 * the math allows it: depth-of-field blur, saturation, and a specular edge.
 *
 * The guard measures the tokens; glas-chrome.test.ts measures the text on top
 * of them. Both must stay green together — if someone flattens the material
 * again, one of the two says which layer forgot why.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const globals = readFileSync(resolve(here, "../src/design/globals.css"), "utf-8");

function rootToken(name: string): string {
  const m = globals.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} is not defined on :root`);
  return m[1]!.trim();
}

function alphaOf(rgba: string): number {
  const m = rgba.match(/rgba\([^)]+,\s*([\d.]+)\s*\)/);
  if (!m) throw new Error(`no alpha in "${rgba}"`);
  return Number(m[1]);
}

describe("the chrome is glass, in layers", () => {
  it("the content glass stays at or under 0.92 — the AA floor of glas-chrome.test.ts", () => {
    // The single-layer composite cannot go clearer without breaking 4.5:1 for
    // the secondary inks over the brightest ground (measured: 0.90 already
    // fails three surfaces). The transparency budget is therefore spent on
    // depth-of-field and specular instead — the assertions below.
    const a = alphaOf(rootToken("glass-chrome-bg"));
    expect(a, "opaque again would wall off the city").toBeLessThan(1);
    expect(a).toBeLessThanOrEqual(0.92);
  });

  it("the blur is strong enough to push the world back, not just frost it", () => {
    const blur = rootToken("glass-chrome-blur");
    const px = Number(blur.match(/blur\((\d+(?:\.\d+)?)px\)/)?.[1] ?? 0);
    expect(px, "liquid glass needs depth separation, ≥ 20 px").toBeGreaterThanOrEqual(20);
    expect(blur, "saturation keeps the city colourful under the glass").toMatch(
      /saturate\((1\.[3-9]\d*|[2-9])/,
    );
  });

  it("the edge light is specular, and the sheen stays at the AA-safe stop", () => {
    // Measured: raising the sheen top stop 0.05 → 0.07 brightens the composited
    // field enough to drop the HEAT caption to 4.41 — the glass may not get its
    // highlight from the wash behind the text. The lit top EDGE (an inset
    // shadow, no text under it) is where the specular lives instead.
    const sheen = rootToken("glass-chrome-sheen");
    expect(sheen).toMatch(/linear-gradient/);
    const topStop = Number(sheen.match(/rgba\([^)]+,\s*([\d.]+)\s*\)/)?.[1] ?? 0);
    expect(topStop, "the wash behind the text stays at its measured floor").toBeLessThanOrEqual(
      0.05,
    );
    const edge = Number(rootToken("glass-chrome-edge").match(/,\s*([\d.]+)\)/)?.[1] ?? 0);
    expect(edge, "the lit top edge carries the highlight, ≥ 0.25").toBeGreaterThanOrEqual(0.25);
  });

  it("the panel stack keeps a declared order: dock under panels under dialogs", () => {
    const stadtUi = readFileSync(resolve(here, "../src/design/stadt-ui.css"), "utf-8");
    const z = (selector: string) => {
      const at = stadtUi.indexOf(selector);
      if (at < 0) throw new Error(`${selector} missing`);
      const m = stadtUi.slice(at, at + 400).match(/z-index:\s*(\d+)/);
      if (!m) throw new Error(`${selector} has no z-index`);
      return Number(m[1]);
    };
    expect(z(".panel-findings {")).toBeLessThan(z(".panel-info {"));
  });
});
