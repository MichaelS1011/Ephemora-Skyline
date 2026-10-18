/**
 * One answer to "how many findings".
 *
 * Three surfaces used to compute that total themselves: the header summed the
 * record's own keys, the dock and the scan banner added `P0 + P1 + P2` by hand.
 * All three agree while the severity domain has exactly three members — which
 * is precisely when a disagreement is invisible. This file pins the door that
 * replaced them: a total is whatever the record holds, so a fourth class is
 * counted before anyone remembers to write the line that counts it.
 *
 * The claim is testable in both directions: hand `severityTotal` a record with
 * a key it has never seen and it must grow. A return to three named additions
 * fails here, not in a city on someone's screen.
 */
import { describe, expect, it } from "vitest";
import { severityCount, severityTotal } from "../src/city/facts";
import type { Severity } from "../src/city/types";

const asSeverity = (r: Record<string, number>): Record<Severity, number> =>
  r as Record<Severity, number>;

describe("the finding total", () => {
  it("adds what the record holds", () => {
    expect(severityTotal(asSeverity({ P0: 3, P1: 2, P2: 3 }))).toBe(8);
    expect(severityTotal(asSeverity({ P0: 0, P1: 0, P2: 0 }))).toBe(0);
  });

  it("counts a class the sum did not know about", () => {
    // the whole point: a fourth severity must join the total without a new line
    const withFour = asSeverity({ P0: 1, P1: 2, P2: 3, P3: 40 });
    expect(severityTotal(withFour)).toBe(46);
    // and the hand-written form this replaced would have answered 6
    expect(withFour.P0 + withFour.P1 + withFour.P2).toBe(6);
  });

  it("refuses to carry a number that is not a number", () => {
    // a payload written by another version could hold NaN or a string; a total
    // of NaN would print as "NaN" on four surfaces at once
    expect(severityTotal(asSeverity({ P0: 1, P1: Number.NaN, P2: 2 }))).toBe(3);
    expect(severityTotal(asSeverity({ P0: 1, P1: 2, P2: undefined as unknown as number }))).toBe(3);
  });

  it("reads one class without inventing it", () => {
    const by = asSeverity({ P0: 3, P1: 0, P2: 3 });
    expect(severityCount(by, "P0")).toBe(3);
    expect(severityCount(by, "P1")).toBe(0);
    expect(severityCount(by, "P3" as Severity)).toBe(0);
  });
});
