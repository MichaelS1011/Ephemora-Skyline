import { describe, it, expect } from "vitest";
import { DICT, t, type DictKey } from "../src/i18n";

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
