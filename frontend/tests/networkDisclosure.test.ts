import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { OUTBOUND_CALLS } from "../src/config/networkSurface";
import { t } from "../src/i18n";

/**
 * "Your source stays on this machine" is the strongest claim on the entry
 * screen, and until now the only way to check it was to clone the repository.
 * The claim now carries its own evidence, so the evidence is pinned here.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

describe("the network disclosure", () => {
  it("lists a reason for every host that is reached", () => {
    expect(OUTBOUND_CALLS.length).toBeGreaterThan(3);
    for (const call of OUTBOUND_CALLS) {
      expect(call.host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      expect(call.what.length).toBeGreaterThan(10);
      expect(call.when.length).toBeGreaterThan(5);
    }
  });

  it("speaks both languages on a bilingual screen", () => {
    for (const call of OUTBOUND_CALLS) {
      expect(call.de.by.length).toBeGreaterThan(0);
      expect(call.de.what).not.toBe(call.what);
      expect(call.de.when).not.toBe(call.when);
    }
  });

  it("is rendered by the entry screen, not only written down", () => {
    const landing = read("frontend/src/components/Landing.tsx");
    expect(landing).toContain("OUTBOUND_CALLS");
    expect(landing).toMatch(/landing\.networkToggle/);
  });
});

describe("the canvas announcement", () => {
  it("keeps camera instructions out of the screen that has no camera", () => {
    const empty = t("en", "city.canvasEmptyAria");
    expect(empty).not.toMatch(/arrow keys|W A S D|bracket keys/i);
    expect(t("de", "city.canvasEmptyAria")).not.toMatch(/Pfeiltasten/i);
    // and the real one still says them
    expect(t("en", "city.canvasAria")).toMatch(/Arrow keys/);
  });
});
