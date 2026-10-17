/**
 * The Apple-language pass on the chrome itself: every touch answers, and the
 * curves come from one scale instead of fourteen numbers.
 *
 * Measured before: zero `:active` rules in any sheet — buttons accepted a
 * click and said nothing until the state behind it repainted; border radii
 * ran 2/3/4/5/6/7/8/9/10/999 px with no system; the only transition in the
 * shell was one 100 ms background. Liquid Glass answers the finger first
 * (a spring-scale on press), then speaks in concentric curves.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = (name: string) => readFileSync(resolve(here, "../src/design", name), "utf-8");
const globals = css("globals.css");
const stadt = css("stadt-ui.css");

describe("the press answers the finger", () => {
  it("every button in the shell scales under a held press", () => {
    expect(stadt).toMatch(/\.app-shell button:active\s*\{[^}]*transform:\s*scale\(/);
  });

  it("the release springs back through a transition, it does not snap", () => {
    expect(stadt).toMatch(/\.app-shell button\s*\{[^}]*transition:[^}]*transform/);
  });

  it("reduced motion still kills the spring", () => {
    const block = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block.slice(0, 400)).toMatch(/animation-duration: 0\.01ms/);
    // transform transitions ride the same !important cut — transitions too
    expect(block.slice(0, 400)).toMatch(/transition-duration: 0\.01ms/);
  });
});

describe("the curves come from a scale", () => {
  it("radius tokens exist on :root", () => {
    for (const token of ["radius-sm", "radius-md", "radius-lg", "radius-pill"]) {
      expect(globals, `--${token}`).toMatch(new RegExp(`--${token}:`));
    }
  });

  it("the card family shares one radius through the token", () => {
    const card = stadt.slice(
      stadt.indexOf(".panel-card {"),
      stadt.indexOf("}", stadt.indexOf(".panel-card {")),
    );
    expect(card).toMatch(/border-radius: var\(--radius-lg\)/);
  });
});
