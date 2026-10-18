import { describe, it, expect } from "vitest";
import {
  findingsBySection,
  highlightSourceLines,
  findingContextRanges,
  shouldAutoLoad,
  parseFocusedKey,
  focusBelongsToFile,
  lineSegmentFor,
} from "../src/findings/panelLogic";
import type { VoxelSectionSpec } from "../src/city/voxels";
import type { CityFile, CityFinding } from "../src/city/types";

/** Minimal section builder — 1-based inclusive line range. */
function section(
  name: string,
  start: number,
  end: number,
  extra: Partial<VoxelSectionSpec> = {},
): VoxelSectionSpec {
  return { name, kind: "function", start, end, codeLines: end - start + 1, depth: 0, ...extra };
}

/** Minimal finding builder — only line matters for the helpers. */
function finding(line: number): CityFinding {
  return { type: "test", severity: "P1", line, message: `finding at ${line}` };
}

describe("findingsBySection", () => {
  it("assigns findings to the section whose inclusive range contains the line", () => {
    const sections = [section("a", 1, 10), section("b", 11, 20)];
    const result = findingsBySection(sections, [finding(1), finding(5), finding(20)]);
    expect(result.map((r) => r.section.name)).toEqual(["a", "b"]);
    expect(result[0]!.findings.map((f) => f.line)).toEqual([1, 5]);
    expect(result[1]!.findings.map((f) => f.line)).toEqual([20]);
  });

  it("treats boundary lines (== start and == end) as inside the section", () => {
    const sections = [section("a", 5, 9)];
    const result = findingsBySection(sections, [finding(5), finding(9)]);
    expect(result[0]!.findings).toHaveLength(2);
    expect(result).toHaveLength(1); // no implicit module needed
  });

  it("collects findings outside every section into one trailing implicit module", () => {
    const sections = [section("a", 10, 20)];
    const result = findingsBySection(sections, [finding(2), finding(12), finding(50)]);
    expect(result).toHaveLength(2);
    expect(result[0]!.findings.map((f) => f.line)).toEqual([12]);
    const implicit = result[1]!;
    expect(implicit.section.kind).toBe("module");
    expect(implicit.findings.map((f) => f.line)).toEqual([2, 50]);
    // the implicit section spans exactly the outside lines
    expect(implicit.section.start).toBe(2);
    expect(implicit.section.end).toBe(50);
  });

  it("returns only the implicit module when there are no sections", () => {
    const result = findingsBySection([], [finding(3), finding(7)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.section.kind).toBe("module");
    expect(result[0]!.findings).toHaveLength(2);
  });

  it("keeps empty sections (with empty finding lists) and adds no implicit module", () => {
    const sections = [section("a", 1, 5), section("b", 6, 10)];
    const result = findingsBySection(sections, []);
    expect(result.map((r) => r.section.name)).toEqual(["a", "b"]);
    expect(result.every((r) => r.findings.length === 0)).toBe(true);
  });

  it("handles empty inputs on both sides", () => {
    expect(findingsBySection([], [])).toEqual([]);
  });

  it("is deterministic — same input, same output, twice", () => {
    const sections = [section("a", 1, 4), section("b", 5, 8)];
    const findings = [finding(4), finding(6), finding(99)];
    const first = findingsBySection(sections, findings);
    const second = findingsBySection(sections, findings);
    expect(second).toEqual(first);
  });
});

describe("highlightSourceLines", () => {
  it("marks 1-based finding lines as finding, all others as code", () => {
    const lines = ["alpha", "beta", "gamma", "delta"];
    const result = highlightSourceLines(lines, [finding(2), finding(4)]);
    expect(result).toEqual([
      { text: "alpha", kind: "code" },
      { text: "beta", kind: "finding" },
      { text: "gamma", kind: "code" },
      { text: "delta", kind: "finding" },
    ]);
  });

  it("returns all-code rows when there are no findings", () => {
    const result = highlightSourceLines(["x", "y"], []);
    expect(result).toEqual([
      { text: "x", kind: "code" },
      { text: "y", kind: "code" },
    ]);
  });

  it("handles empty lines input and findings beyond the file end", () => {
    expect(highlightSourceLines([], [finding(1)])).toEqual([]);
    // no crash — out-of-range lines simply never render as findings
    expect(highlightSourceLines(["only"], [finding(500)])).toEqual([
      { text: "only", kind: "code" },
    ]);
  });

  it("is deterministic — same input, same output, twice", () => {
    const lines = ["a", "b", "c"];
    const findings = [finding(1), finding(3)];
    const first = highlightSourceLines(lines, findings);
    const second = highlightSourceLines(lines, findings);
    expect(first).toEqual(second);
  });
});

describe("findingContextRanges", () => {
  it("builds ±context windows clamped to the file bounds", () => {
    expect(findingContextRanges([finding(1)], 100, 40)).toEqual([[1, 41]]);
    expect(findingContextRanges([finding(100)], 100, 40)).toEqual([[60, 100]]);
  });

  it("merges overlapping windows into one sorted range", () => {
    const result = findingContextRanges([finding(10), finding(30)], 100, 40);
    expect(result).toEqual([[1, 70]]);
  });

  it("keeps disjoint windows sorted by start line", () => {
    const result = findingContextRanges([finding(90), finding(20)], 100, 5);
    expect(result).toEqual([
      [15, 25],
      [85, 95],
    ]);
  });

  it("returns no ranges without findings", () => {
    expect(findingContextRanges([], 100, 40)).toEqual([]);
  });
});

/** Minimal file fixture — only id and findings matter for the focus helpers. */
function fileFixture(id: string, findings: CityFinding[]): CityFile {
  return {
    id,
    name: `${id}.ts`,
    path: `src/${id}.ts`,
    language: "TypeScript",
    linesOfCode: 100,
    cyclomaticComplexity: 3,
    threatLevel: findings.length > 0 ? "high" : "safe",
    findings,
  };
}

describe("shouldAutoLoad", () => {
  it("auto-loads only when asked, still idle, and an analysis exists", () => {
    expect(shouldAutoLoad("idle", "scan-1", true)).toBe(true);
  });

  it("never auto-loads while loading, on error, or when already ready (no fetch loop)", () => {
    expect(shouldAutoLoad("loading", "scan-1", true)).toBe(false);
    expect(shouldAutoLoad("error", "scan-1", true)).toBe(false);
    expect(shouldAutoLoad("ready", "scan-1", true)).toBe(false);
  });

  it("requires an analysis id and an explicit autoLoad request", () => {
    expect(shouldAutoLoad("idle", null, true)).toBe(false);
    expect(shouldAutoLoad("idle", "scan-1", false)).toBe(false);
  });
});

describe("parseFocusedKey", () => {
  it("splits 'fileId#index' and keeps everything before the last # as the id", () => {
    expect(parseFocusedKey("f1#2")).toEqual({ fileId: "f1", index: 2 });
    // file ids may themselves contain '#'
    expect(parseFocusedKey("a#b#0")).toEqual({ fileId: "a#b", index: 0 });
  });

  it("rejects null, empty, and malformed keys", () => {
    expect(parseFocusedKey(null)).toBeNull();
    expect(parseFocusedKey(undefined)).toBeNull();
    expect(parseFocusedKey("")).toBeNull();
    expect(parseFocusedKey("#3")).toBeNull(); // empty fileId
    expect(parseFocusedKey("f#")).toBeNull(); // empty index
    expect(parseFocusedKey("f#x")).toBeNull(); // non-numeric index
    expect(parseFocusedKey("f#-1")).toBeNull(); // negative index
  });
});

describe("focusBelongsToFile", () => {
  it("is true when the key's fileId matches", () => {
    expect(focusBelongsToFile("f1#0", "f1")).toBe(true);
  });

  it("is false for another file's key or a malformed key", () => {
    expect(focusBelongsToFile("other#0", "f1")).toBe(false);
    expect(focusBelongsToFile(null, "f1")).toBe(false);
    expect(focusBelongsToFile("garbage", "f1")).toBe(false);
  });
});

describe("lineSegmentFor", () => {
  const file = fileFixture("f1", [finding(7), finding(42)]);

  it("returns the focused finding's 1-based line for this file", () => {
    expect(lineSegmentFor("f1#1", file)).toBe(42);
    expect(lineSegmentFor("f1#0", file)).toBe(7);
  });

  it("returns null for a foreign file, a stale index, or no focus", () => {
    expect(lineSegmentFor("other#0", file)).toBeNull();
    expect(lineSegmentFor("f1#9", file)).toBeNull(); // index beyond findings
    expect(lineSegmentFor(null, file)).toBeNull();
  });
});

it("never maps historical findings onto current source or current sections", () => {
  const history = { ...finding(2), provenance: "gitleaks-history", historyCommit: "abc123" };
  expect(highlightSourceLines(["a", "b"], [history])[1]!.kind).toBe("code");
  expect(findingContextRanges([history], 100, 40)).toEqual([]);
  expect(findingsBySection([section("now", 1, 10)], [history])[0]!.findings).toEqual([]);
  expect(lineSegmentFor("file#0", { id: "file", findings: [history] })).toBeNull();
});
