import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MAX_EXCLUDE_PATHS, parseExcludes } from "../src/config/scanProfiles";
import { UNCHECKED_COLOR } from "../src/city/palette";

/**
 * BELEG-02 — two numbers the README prints that no test had held still.
 *
 * README.md:74 promises the excluded-folders field "caps the list at fifty", and
 * README.md:65 names the grey for ground no scanner looked at as `#6b6a63`.
 * The suite already walks both mechanisms — `frontend/tests/scan-excludes.test.tsx:101`
 * and the heat-grid tests — but each of them compares behaviour against the module's
 * own constant, so changing the constant to 40, or the grey to another hex, kept
 * every test green. These two assertions hold the number itself, from the outside.
 */

const REPO = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

describe("the excluded-folders list caps at fifty (README.md:45)", () => {
  it("holds fifty needles when seventy are typed", () => {
    const seventy = Array.from({ length: 70 }, (_, i) => `folder-${i}`).join(", ");
    expect(parseExcludes(seventy)).toHaveLength(50);
  });

  it("keeps the first fifty, in the order they were written", () => {
    const parsed = parseExcludes(
      Array.from({ length: 60 }, (_, i) => `d${String(i).padStart(2, "0")}`).join(", "),
    );
    expect(parsed[0]).toBe("d00");
    expect(parsed.at(-1)).toBe("d49");
    expect(parsed).toHaveLength(50);
  });

  /**
   * The same field is honoured twice — the browser's reader and the server's
   * stager. One number on one side and a different one on the other would make
   * the refusal and the field disagree about what "too many" means.
   */
  it("is fifty on the server side too", () => {
    const server = /export const MAX_EXCLUDE_PATHS = (\d+);/.exec(
      read("backend/src/services/security/scan-config.ts"),
    );
    expect(server, "the server no longer names its exclude cap").toBeTruthy();
    expect(Number(server![1])).toBe(50);
    expect(MAX_EXCLUDE_PATHS).toBe(50);
  });
});

describe("the grey that says nobody looked (README.md:65)", () => {
  it("is the #6b6a63 the table names", () => {
    expect(UNCHECKED_COLOR.toLowerCase()).toBe("#6b6a63");
  });

  it("and is the colour the surfaces that say it actually reach for", () => {
    for (const file of [
      "frontend/src/components/HeatCells.tsx",
      "frontend/src/components/Tooltip.tsx",
      "frontend/src/components/InfoPanel.tsx",
    ]) {
      expect(read(file), `${file} paints unproven ground without the named grey`).toContain(
        "UNCHECKED_COLOR",
      );
    }
  });

  it("stays a grey, because the claim is about absence of a colour signal", () => {
    const hex = UNCHECKED_COLOR.replace(/^#/, "");
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(8);
  });
});
