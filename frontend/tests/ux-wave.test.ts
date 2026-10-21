// The three copy/colour rules of the UX wave, pinned without a browser.
import { describe, expect, it } from "vitest";
import { findingGermanLine } from "../src/components/FindingCard";
import { BUILDING_SELECTION, CYCLE_RING_COLOR, ENV } from "../src/city/palette";

describe("the UX wave's copy and colour boundaries", () => {
  it("does not call a console finding 'no vulnerability' in German", () => {
    const line = findingGermanLine({ type: "CONSOLE_USAGE", category: "hygiene" }, "de");
    expect(line).toContain("Konsolenausgabe");
    expect(line).not.toContain("Keine Schwachstelle");
  });

  it("keeps selection out of the alarm red that findings and cycles own", () => {
    expect(BUILDING_SELECTION).not.toBe(ENV.selection);
    expect(BUILDING_SELECTION).not.toBe(CYCLE_RING_COLOR);
    expect(CYCLE_RING_COLOR).toBe("#ff2e4d");
  });
});
