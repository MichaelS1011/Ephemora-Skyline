import { describe, expect, it } from "vitest";
import {
  DEEP_FUNCTION_BRANCHES,
  LONG_LINE_CHARS,
  MONOLITH_LINES,
  structureNotes,
} from "../src/services/analyzer/structure-advice.js";

const m = (over: Partial<{ lines: number; longestLine: number; cyclomatic: number }>) => ({
  lines: 10,
  longestLine: 40,
  cyclomatic: 2,
  ...over,
});

describe("structureNotes names what the tower already shows", () => {
  it("a normal file gets no advice at all", () => {
    expect(structureNotes(m({}))).toHaveLength(0);
  });

  it("the monolith note carries the plain line count", () => {
    const a = structureNotes(m({ lines: MONOLITH_LINES + 1 }));
    expect(a).toEqual([{ kind: "monolith", value: MONOLITH_LINES + 1 }]);
  });

  it("the branch note counts paths through the file", () => {
    const a = structureNotes(m({ cyclomatic: DEEP_FUNCTION_BRANCHES + 1 }));
    expect(a).toEqual([{ kind: "deep", value: DEEP_FUNCTION_BRANCHES + 1 }]);
  });

  it("the long-line note carries the width in characters", () => {
    const a = structureNotes(m({ longestLine: LONG_LINE_CHARS + 1 }));
    expect(a).toEqual([{ kind: "longline", value: LONG_LINE_CHARS + 1 }]);
  });

  it("a monster file collects all three, each from its own measure", () => {
    const a = structureNotes({ lines: 5000, longestLine: 3000, cyclomatic: 1200 });
    expect(a.map((x) => x.kind).sort()).toEqual(["deep", "longline", "monolith"]);
  });

  it("exactly at a threshold is not past it", () => {
    expect(
      structureNotes({
        lines: MONOLITH_LINES,
        cyclomatic: DEEP_FUNCTION_BRANCHES,
        longestLine: LONG_LINE_CHARS,
      }),
    ).toHaveLength(0);
  });
});
