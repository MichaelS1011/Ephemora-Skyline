import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * The city canvas reserves the width of whatever panel stands beside it, and
 * `:has()` asks the DOM rather than the render tree — so a panel that is in the
 * document and hidden by `display: none` still moved the city.
 *
 * Found by measuring the shipped frames, not by looking at them: in
 * `docs/assets/ui-findings-list.png` the picture began at x=316 with nothing
 * painted in front of it, because the findings list was open and had hidden the
 * project card whose 316 px the canvas was still holding. Every rule that
 * reserves the card's space has to name the panels that hide it.
 */

const CSS = readFileSync(path.resolve(import.meta.dirname, "../src/design/globals.css"), "utf-8");

/** Each `selector { body }` pair that touches the canvas's left reservation. */
const reservations = () => {
  const out: { selector: string; body: string }[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const block of CSS.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/g)) {
    for (const match of block[1]!.matchAll(rule)) {
      const selector = match[1]!;
      const body = match[2]!;
      if (!/\.city-canvas/.test(selector)) continue;
      if (!/margin-left/.test(body)) continue;
      out.push({ selector: selector.replace(/\s+/g, " ").trim(), body: body.trim() });
    }
  }
  return out;
};

describe("the canvas's reservation of the project card", () => {
  it("is in the file, so this guard has something to guard", () => {
    expect(reservations().length).toBeGreaterThan(0);
  });

  it("is guarded against every panel that hides the card", () => {
    for (const { selector } of reservations()) {
      expect(
        selector,
        `${selector} reserves the card's width, but the card is display:none while an info or findings panel is open`,
      ).toMatch(/:not\(\s*:has\(\s*\.panel-info,\s*\.panel-findings\s*\)\s*\)/);
    }
  });

  it("matches the rule that hides the card, panel for panel", () => {
    const hidden = [...CSS.matchAll(/([^{}]+)\{[^{}]*display:\s*none/g)]
      .map((m) => m[1]!.replace(/\s+/g, " ").trim())
      .filter((s) => /\.panel-context-card/.test(s) && /:has\(/.test(s));
    expect(hidden.length).toBeGreaterThan(0);
    for (const { selector } of reservations()) {
      const guard = selector.match(/:not\(\s*:has\(([^)]*)\)/);
      expect(guard, `${selector} carries no guard`).toBeDefined();
      const guarded = new Set(guard![1]!.split(",").map((c) => c.trim()));
      for (const hide of hidden) {
        for (const cls of hide.match(/\.panel-[a-z-]+/g) ?? []) {
          if (cls === ".panel-context-card") continue;
          expect(
            guarded.has(cls),
            `${hide} hides the card while ${selector} still reserves its width — ${cls} belongs in the guard`,
          ).toBe(true);
        }
      }
    }
  });
});
