// @vitest-environment jsdom
/**
 * Narrow windows get the strip, not the card.
 *
 * Measured at 360 CSS px: the centred scan-summary card covered 20 % of the
 * picture and the header another 16 % — the city was a backdrop behind its
 * own report. The product is desktop-first (the phone was decided away on
 * 6 October), but a narrow desktop window is not a phone and must still see
 * its skyline. So below the breakpoint the announcement opens as the same
 * one-line strip the card collapses INTO after its dwell — and the strip's
 * existing "Show" button still hands back the full card on demand.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(here, "../src", p), "utf-8");

describe("the narrow-window rule is one shared decision", () => {
  it("ScanSummary opens collapsed when the window is narrow", () => {
    const summary = src("components/ScanSummary.tsx");
    expect(summary, "the width rule lives in motion.ts, not in a third copy").toMatch(
      /narrowChromeWindow/,
    );
    expect(summary).toMatch(/setCollapsed\(narrowChromeWindow\(\)\)/);
  });

  it("motion.ts owns the query and caches it per call site, not per frame", () => {
    const motion = src("city/motion.ts");
    expect(motion).toMatch(/export function narrowChromeWindow/);
    expect(motion).toMatch(/max-width:\s*520px/);
  });

  it("the strip stays reachable: the card's own collapse path is untouched", () => {
    const summary = src("components/ScanSummary.tsx");
    // the dwell timer still decides the wide-window behaviour
    expect(summary).toMatch(/if \(ms <= 0\) setCollapsed\(true\)/);
  });
});

describe("the share nudge folds to its row below 520 px", () => {
  it("the paragraph is out of the picture, the two buttons stay", () => {
    const share = src("design/share.css");
    const at = share.indexOf("@media (max-width: 520px)");
    expect(at, "the 520 px block exists").toBeGreaterThan(-1);
    const block = share.slice(at, share.indexOf("}", share.indexOf(".share-hint-text", at)));
    expect(block).toMatch(/\.share-hint-text\s*\{[^}]*display:\s*none/);
  });

  it("the fold is CSS-only — the hint's state and buttons are untouched", () => {
    const hint = src("share/ShareHint.tsx");
    expect(hint).toMatch(/className="share-hint-text"/);
    expect(hint).toMatch(/share-hint-yes/);
    expect(hint).toMatch(/share-hint-no/);
  });
});
