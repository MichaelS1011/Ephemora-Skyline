// TON-20 — what says "this channel is unavailable".
//
// The heat switch used to say it with `opacity: 0.45`, which put its label at
// 2,67:1 on the frosted bar (measured by glas-chrome.test.ts against the same
// model field the painted pixels sit 2-4 points under). The decision was to keep
// the state and move its carrier: strike-through plus `aria-disabled`, with an
// ink that reads. This file holds that shape; glas-chrome.test.ts holds the
// number.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SRC = path.resolve(import.meta.dirname, "../src");
const toggle = readFileSync(path.join(SRC, "components/HeatmapToggle.tsx"), "utf-8");
const stadt = readFileSync(path.join(SRC, "design/stadt-ui.css"), "utf-8");

/** The body of the rule that styles the disabled switch, comments out: only a
 *  declaration can carry the state, a note about one cannot. */
const disabledRule = (): string => {
  const m = stadt
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/\.workspace-heatmap \[role="radio"\]\[aria-disabled="true"\]\s*\{([^}]*)\}/);
  expect(m, "keine Regel für das deaktivierte Label im Heat-Kanal").not.toBeNull();
  return (m as RegExpMatchArray)[1]!;
};

describe("Der deaktivierte Heat-Kanal trägt seinen Zustand ohne Deckkraft", () => {
  it("sagt aria-disabled, damit ein Vorsystem die Durchstreichung hört", () => {
    expect(toggle).toMatch(/aria-disabled=\{unavailable \|\| undefined\}/);
    expect(toggle).toMatch(/onClick=\{\(\) => pick\(id\)\}/);
    // Clicking stays possible: `pick` returns for the unavailable channel, so
    // the tooltip that explains why still opens on hover.
    expect(toggle).toMatch(/if \(unavailable\) return;/);
  });

  it("streicht das Label durch, und die Durchstreichung ist nicht wieder abgedunkelt", () => {
    expect(disabledRule()).toMatch(/text-decoration:\s*line-through/);
    expect(
      disabledRule(),
      "eine eigene Decorations-Farbe wäre wieder ein zweiter Grundton",
    ).not.toMatch(/text-decoration-color/);
  });

  it("benutzt keine Deckkraft als Zustands-Träger", () => {
    expect(toggle, "opacity im Inline-Stil dimmt das Label unter die Untergrenze").not.toMatch(
      /opacity:\s*unavailable/,
    );
  });
});
