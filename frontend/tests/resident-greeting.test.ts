import { describe, it, expect } from "vitest";
import { owesWave, WAVE_REPEAT_S, WAVE_HOLD_S } from "../src/city/residentGreeting";

/**
 * The rule behind the wave. `Pedestrians` asks it once a second and waves when
 * it says yes, so this file holds the arithmetic — the offer, the stage and the
 * twenty seconds — and the crowd file holds the projection that decides *which*
 * resident is visible enough to wave at.
 */
describe("how long the crowd waves for an unanswered offer", () => {
  it("owes a wave after twenty idle seconds, and not before", () => {
    expect(owesWave("open", false, 20, 0)).toBe(true);
    expect(owesWave("open", false, 19.9, 0)).toBe(false);
  });

  it("counts the interval from the last wave, not from the arrival", () => {
    expect(owesWave("open", false, 34, 20)).toBe(false);
    expect(owesWave("open", false, 40, 20)).toBe(true);
  });

  it("stops when the reader takes the offer or closes the card", () => {
    for (const offer of ["taken", "closed"] as const) {
      expect(owesWave(offer, false, 10_000, 0), offer).toBe(false);
    }
  });

  it("stops while a guided flow, an open file or a called resident owns the stage", () => {
    expect(owesWave("open", true, 10_000, 0)).toBe(false);
  });

  it("waves for less than a twentieth of the repeat, so two never overlap", () => {
    expect(WAVE_HOLD_S).toBeLessThan(WAVE_REPEAT_S);
  });
});
