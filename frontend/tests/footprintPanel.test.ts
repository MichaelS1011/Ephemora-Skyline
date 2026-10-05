import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { t, type DictKey } from "../src/i18n";

/**
 * The privacy note on the entry screen is a claim about the machine, so it has
 * to carry the number and the two buttons that make the number smaller. These
 * are wiring checks: the block must read the server's footprint, offer the
 * sweep, and never touch more browser storage than the verdict buckets.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const landing = readFileSync(path.join(REPO, "frontend/src/components/Landing.tsx"), "utf-8");

const KEYS: DictKey[] = [
  "landing.footprintLead",
  "landing.footprintPath",
  "landing.footprintCopies",
  "landing.footprintStale",
  "landing.footprintNone",
  "landing.footprintPurge",
  "landing.footprintRefresh",
  "landing.footprintReset",
  "landing.footprintPurged",
  "landing.footprintResetDone",
  "landing.footprintError",
];

describe("the footprint block", () => {
  it("reads the footprint and offers both removals", () => {
    expect(landing).toContain('fetch("/api/footprint")');
    expect(landing).toContain('fetch("/api/footprint/purge", { method: "POST" })');
    expect(landing).toContain('k.startsWith("codecity-reviews:")');
    expect(landing).toMatch(/localStorage\.removeItem\(k\)/);
  });

  it("refuses to sweep when the server says nothing is stale", () => {
    expect(landing).toMatch(/disabled=\{!foot \|\| foot\.stale === 0\}/);
  });

  it("keeps the numbers in the disclosure, not on the first paint", () => {
    const details = landing.slice(landing.indexOf('className="landing-network"'));
    const end = details.indexOf("</details>");
    expect(details.slice(0, end)).toContain("landing-footprint");
    expect(details.slice(0, end)).toContain('role="status"');
  });

  it("speaks both languages, and does not fake it", () => {
    for (const key of KEYS) {
      const en = t("en", key);
      const de = t("de", key);
      expect(en.length, `${key} has no English`).toBeGreaterThan(3);
      expect(de.length, `${key} has no German`).toBeGreaterThan(3);
      expect(de, `${key} is copied, not translated`).not.toBe(en);
    }
  });

  it("reports a missing server instead of showing nothing", () => {
    expect(landing).toContain("setFootError(true)");
    expect(landing).toContain('t(lang, "landing.footprintError")');
  });
});
