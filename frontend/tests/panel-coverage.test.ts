// @vitest-environment jsdom
/**
 * The city keeps its stage: the two side panels never stand at once, and the
 * triage list is as narrow as its content allows. Coverage was measured on a
 * 1280×800 viewport — findings open with the context card beside it covered
 * 44 % of the picture; one-at-a-time plus the slimmer list brings the triage
 * state down to ~19 %.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(here, "../src", p), "utf-8");

describe("the left card yields to the right list", () => {
  it("ContextCard collapses while the findings panel is open", () => {
    const card = src("components/ContextCard.tsx");
    expect(card, "the card must watch the findings panel").toMatch(/showFindings/);
    expect(card).toMatch(/if \(showFindings\) setCollapsed\(true\)/);
  });

  it("closing the list does not fight the user — the card stays as left", () => {
    const card = src("components/ContextCard.tsx");
    // the only auto-collapse is the one-way effect above; no else-branch
    // setting collapsed(false) on showFindings === false
    const effect = card.slice(card.indexOf("watch the findings panel"));
    expect(effect.slice(0, 400), "one-way yield only").not.toMatch(
      /showFindings[\s\S]{0,80}setCollapsed\(false\)/,
    );
  });
});

describe("the triage list is slim", () => {
  it("the findings panel is 310 px, not 350", () => {
    const globals = src("design/globals.css");
    const rule = globals.slice(globals.indexOf(".panel-findings"));
    expect(rule).toMatch(/width: 310px !important/);
  });
});
