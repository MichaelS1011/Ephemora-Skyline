/**
 * Fluid Motion at the panel edge: both side panels enter with the same slide,
 * and the entry is CSS-only so a reduced-motion user gets the global cut to
 * 0.01 ms without any component knowing about it.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const stadtUi = readFileSync(resolve(here, "../src/design/stadt-ui.css"), "utf-8");
const globals = readFileSync(resolve(here, "../src/design/globals.css"), "utf-8");
const infoPanel = readFileSync(resolve(here, "../src/components/InfoPanel.tsx"), "utf-8");

describe("panel entry motion", () => {
  it("the findings panel slides in with the same stroke as the info panel", () => {
    const rule = stadtUi.slice(
      stadtUi.indexOf(".panel-findings {"),
      stadtUi.indexOf("}", stadtUi.indexOf(".panel-findings {")),
    );
    expect(rule).toMatch(/animation: slide-in-right 0\.25s ease-out both/);
    expect(infoPanel).toContain("animate-slide-right");
    expect(globals).toMatch(/\.animate-slide-right \{[\s\S]*?slide-in-right 0\.25s/);
  });

  it("the keyframe exists in the sheet the app loads first", () => {
    expect(globals).toMatch(/@keyframes slide-in-right/);
  });

  it("reduced motion still cuts every animation globally — the panels included", () => {
    const block = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration: 0\.01ms !important/);
  });
});
