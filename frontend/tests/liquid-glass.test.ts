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
  it("the control glass stays at or under its measured ceiling — glas-chrome.test.ts owns it", () => {
    // The single-layer composite cannot go clearer without breaking 4.5:1 for
    // the secondary inks over the brightest ground (measured: 0.90 already
    // fails three surfaces). The transparency budget is therefore spent on
    // depth-of-field and specular instead — the assertions below.
    const a = alphaOf(rootToken("glass-control-bg"));
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

  it("the world softens where it passes under a bar, and nowhere else", () => {
    // Apple's second legibility mechanism for a material: „Scroll edge effects
    // further enhance legibility by blurring and reducing the opacity of
    // background content." Without it the thin control glass meets the city at
    // full detail — a window grid one pixel from a caption. Two bands on the
    // canvas wrapper, each with its own gradient mask, and no veil over the rest
    // of the picture.
    const at = globals.indexOf(".city-canvas::before,");
    expect(at, "die Scroll-Kanten der Stadt fehlen").toBeGreaterThan(-1);
    // End at the next rule that is not part of the band: `.city-canvas::after {`
    // also appears in the grouped selector above, and slicing to it stops before
    // either mask exists — measured, not assumed: the first run of this case read
    // 243 characters and zero masks.
    const block = globals.slice(at, globals.indexOf(".city-canvas:focus-visible"));
    expect(block).toMatch(/backdrop-filter:\s*blur\((\d+)px\)/);
    const px = Number(block.match(/backdrop-filter:\s*blur\((\d+)px\)/)?.[1] ?? 0);
    expect(px, "ein weicher Rand braucht echte Tiefe, ≥ 10 px").toBeGreaterThanOrEqual(10);
    expect(px, "der Rand darf nicht zweite Frostung werden — unter dem Glas selbst").toBeLessThan(
      24,
    );
    expect(
      block.match(/mask-image:\s*linear-gradient/g) ?? [],
      "beide Bänder müssen auslaufen",
    ).toHaveLength(2);
    expect(block, "ein Rand, der Klicks fängt, ist kein Rand").toMatch(/pointer-events:\s*none/);
    expect(
      block,
      "das untere Band folgt der Dock-Höhe (--dock-h), nicht einer geratenen Zahl",
    ).toMatch(/var\(--dock-h/);
    // Two silent failures this case has to catch, both measured on the running
    // screen with `scripts/scroll-edge-drive.mjs`:
    // · without a z-index the band paints under the WebGL canvas — a red test
    //   rectangle on it never reached a pixel, and the drive read 0 % on both
    //   zones;
    // · anchored to the frame (`bottom: 0`) the lower band spends its whole fade
    //   behind the dock — 5,6 % on the strip the reader sees against 35,6 % when
    //   it starts at the dock's own top edge.
    expect(block, "ein Band ohne z-index liegt unter der Stadt und macht nichts").toMatch(
      /z-index:\s*([1-9]\d*)/,
    );
    expect(
      block.slice(block.indexOf(".city-canvas::after")),
      "das untere Band darf nicht am Rahmen anfangen, sondern an der Dockkante",
    ).not.toMatch(/bottom:\s*0/);
  });

  it("a scrolling card fades its own edge instead of cutting a line", () => {
    const stadtUi = readFileSync(resolve(here, "../src/design/stadt-ui.css"), "utf-8");
    const at = stadtUi.indexOf(".panel-scroll {");
    expect(at, "die Leseplatten haben keine Kantenblende").toBeGreaterThan(-1);
    const block = stadtUi.slice(at, stadtUi.indexOf("}", at) + 1);
    expect(block).toMatch(/mask-image:\s*linear-gradient/);
    // both ends: text arriving under the top edge is as much a clip as leaving
    // through the bottom one
    expect(block.match(/transparent/g) ?? []).toHaveLength(2);
    expect(block, "die Blende liegt in der Platte, nicht über der Stadt").not.toMatch(
      /backdrop-filter/,
    );
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
