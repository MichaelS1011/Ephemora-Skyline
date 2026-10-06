import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Both rules came out of the same phone walk (2026-10-06, 390/375/360 px):
 * the scan toast is centred with `left-1/2` and had no width ceiling, so its
 * 483 px content row hung past both edges (L-47 R437 at 390 px, "Scan complete"
 * off-screen), and `@media (max-width: 380px)` hid `.workspace-brand` — the one
 * button wired to resetToLanding — which left no way back to the landing screen.
 * Layout cannot be measured in jsdom, so these guard the contract the layout
 * depends on, the way the type floor guards its px values.
 */
const SRC = path.resolve(import.meta.dirname, "../src");
const toast = readFileSync(path.join(SRC, "components/ScanSummary.tsx"), "utf-8");
const css = readFileSync(path.join(SRC, "design/globals.css"), "utf-8");
const hud = readFileSync(path.join(SRC, "components/HudOverlay.tsx"), "utf-8");

describe("the scan toast inside the Satzspiegel", () => {
  it("caps its width to the shell instead of its own content", () => {
    expect(toast).toMatch(/maxWidth:\s*["']calc\(100%\s*-\s*\d+px\)/);
  });

  it("wraps its row, so the cap shortens the toast rather than cutting it", () => {
    expect(toast).toMatch(/className="flex flex-wrap/);
  });
});

describe("the way back to the landing screen", () => {
  it("never hides the brand button at any breakpoint", () => {
    const hidden = css
      .split("}")
      .filter((block) => /\.workspace-brand\s*\{[^}]*display:\s*none/.test(block))
      .map((b) => b.trim().slice(0, 60));
    expect(hidden, `.workspace-brand is display:none here:\n${hidden.join("\n")}`).toEqual([]);
  });

  it("keeps resetToLanding wired to that button", () => {
    expect(hud).toMatch(/onClick=\{resetToLanding\}[\s\S]{0,200}className="workspace-brand"/);
  });
});
