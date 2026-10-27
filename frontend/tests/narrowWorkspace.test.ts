import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Three contracts, two walks. The phone walk (2026-10-06, 390/375/360 px) found
 * the scan toast centred with `left-1/2` and no width ceiling — its 483 px
 * content row hung past both edges (L-47 R437 at 390 px, "Scan complete"
 * off-screen) — and found `@media (max-width: 380px)` hiding `.workspace-brand`,
 * the one button wired to resetToLanding. The desk walk (2026-10-27, 1440/1280
 * px, a real 403-file scan) found the ceiling it grew afterwards being
 * outranked by an inline width, so the plate ran 878.641 px wide and laid its
 * glass over the project card. Layout cannot be measured in jsdom, so these
 * guard the contract the layout depends on, the way the type floor guards its
 * px values — and the cap is read in the one file that is allowed to set it.
 */
const SRC = path.resolve(import.meta.dirname, "../src");
const toast = readFileSync(path.join(SRC, "components/ScanSummary.tsx"), "utf-8");
const startCss = readFileSync(path.join(SRC, "design/start.css"), "utf-8");
const css = readFileSync(path.join(SRC, "design/globals.css"), "utf-8");
const hud = readFileSync(path.join(SRC, "components/HudOverlay.tsx"), "utf-8");

/** The `.start-summary` rule block, so a contract is read where it is set. */
function ruleBlock(selector: string): string {
  const at = startCss.indexOf(`\n${selector} {`);
  if (at < 0) return "";
  return startCss.slice(at, startCss.indexOf("}", at));
}

describe("the scan toast inside the Satzspiegel", () => {
  it("caps its width to the shell instead of its own content", () => {
    const block = ruleBlock(".start-summary");
    expect(block, ".start-summary has no width cap in start.css").toMatch(
      /max-width:\s*min\(620px,\s*100%\)/,
    );
  });

  it("carries no inline width that would outrank that cap", () => {
    // An inline `maxWidth: calc(100% - 28px)` sat on this element since
    // 260efe2, when the toast had no stylesheet rule of its own. It silently
    // beat the 620px cap added later: measured 878.641px of plate on a real
    // 403-file scan, and 93 × 176px of the project card behind its glass.
    // Comments are stripped first — this file explains the rule, it may not be
    // mistaken for the rule.
    const code = toast.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
    const at = code.indexOf("className={`start-summary is-${shape}`}");
    expect(at, "the plate is no longer rendered as .start-summary").toBeGreaterThan(-1);
    expect(code.slice(at, code.indexOf(">", at))).not.toMatch(/maxWidth/);
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
