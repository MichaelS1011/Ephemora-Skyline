import { describe, it, expect } from "vitest";
import { DICT, t, type DictKey } from "../src/i18n";
import { COPY, learningCopy } from "../src/components/learningCopy";

const keys = Object.keys(DICT) as DictKey[];

/** All {placeholder} names used by a string, e.g. "Building {name}" → {name}. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe("i18n dictionary", () => {
  it("has a non-empty English and German entry for every key", () => {
    // The dictionary is the app's full UI surface — it must stay substantial.
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      expect(DICT[key]!.en.trim(), `en is empty for "${key}"`).not.toBe("");
      expect(DICT[key]!.de.trim(), `de is empty for "${key}"`).not.toBe("");
    }
  });

  it("uses the same {placeholders} in both languages", () => {
    for (const key of keys) {
      expect(placeholders(DICT[key]!.en), `placeholder mismatch for "${key}"`).toEqual(
        placeholders(DICT[key]!.de),
      );
    }
  });
});

describe("t()", () => {
  it("replaces {vars} with values in both languages", () => {
    expect(t("en", "hud.building", { name: "demo-city", done: 12, total: 40 })).toBe(
      "Building demo-city · 12/40",
    );
    expect(t("de", "hud.building", { name: "demo-city", done: 12, total: 40 })).toBe(
      "demo-city wird gebaut · 12/40",
    );
    expect(t("de", "landing.progressCollecting", { count: 7 })).toContain("7 Dateien");
    expect(t("en", "hud.sevAriaOn", { label: "Critical", count: 3 })).toBe(
      "Critical findings: 3. Clear filter",
    );
  });

  it("renders numbers via String() and leaves missing vars untouched", () => {
    expect(t("en", "actions.findings", { count: 5 })).toBe("Findings 5");
    expect(t("en", "hud.building")).toContain("{name}");
  });

  it("returns unknown keys unchanged instead of throwing", () => {
    expect(t("en", "no.such.key" as DictKey)).toBe("no.such.key");
    expect(t("de", "no.such.key" as DictKey, { name: "x" })).toBe("no.such.key");
  });
});

/**
 * The learning guide reads its texts from `learningCopy.ts`, a bridge that lives
 * outside `DICT`. The dictionary is held to EN+DE completeness by the tests
 * above; this bridge was not — and that gap is exactly why an English word
 * could sit in a German sentence ("Ephe's provide …") without a single guard
 * turning red. The same two rules now cover it, plus a bleed check that a
 * German sentence may not carry an English word taken from its English twin.
 */
describe("learningCopy bridge is bilingual too", () => {
  const keys = Object.keys(COPY) as (typeof COPY extends Record<infer K, unknown> ? K : never)[];

  /** Loanwords/units that legitimately stand in German text, each with a reason. */
  const ALLOW = new Map<string, string>([
    ["scanner", "technischer Begriff, im Deutschen so gebräuchlich"],
    ["scan", "Technikwort, auch im Deutschen „Scan“"],
    ["code", "Lehnwort in „Code-Maßstab“ / „Codeumfang“"],
    ["tests", "Mehrzahl des Lehnworts „Test“"],
    ["demo", "Kurzwort, im Deutschen gebräuchlich"],
    ["imports", "Programmbegriff im deutschen Satz"],
    ["ephe", "Eigenname der Ephemora-Bewohner, in beiden Sprachen gleich"],
  ]);

  const words = (s: string): string[] => s.toLowerCase().match(/[a-zäöüß]+/g) ?? [];

  it("has a non-empty English and German value for every key", () => {
    expect(keys.length).toBeGreaterThan(4);
    for (const key of keys) {
      expect(COPY[key].en.trim(), `en is empty for "${key}"`).not.toBe("");
      expect(COPY[key].de.trim(), `de is empty for "${key}"`).not.toBe("");
    }
  });

  it("carries no English word (over 3 letters) that its German twin just copied", () => {
    for (const key of keys) {
      const enWords = new Set(words(COPY[key].en));
      const bleed = words(COPY[key].de).filter(
        (w) => w.length > 3 && enWords.has(w) && !ALLOW.has(w),
      );
      expect(bleed, `English bleed in "${key}": ${bleed.join(", ")}`).toEqual([]);
    }
  });

  it("uses no English possessive plural in a German sentence", () => {
    for (const key of keys) {
      expect(/[A-Za-z][’']s\b/.test(COPY[key].de), `Denglish apostrophe in "${key}"`).toBe(false);
    }
  });

  it("learningCopy answers the bridge in both languages", () => {
    expect(learningCopy("en", "title")).toBe("Learn to read this city");
    expect(learningCopy("de", "title")).toBe("Diese Stadt lesen lernen");
  });
});
