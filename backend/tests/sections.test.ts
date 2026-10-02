import { describe, expect, it } from "vitest";
import { extractSections } from "../src/services/analyzer/metrics.js";
import type { FileAnalysis } from "../src/models/index.js";

type Existing = Parameters<typeof extractSections>[2];

function makeFunctions(lines: Array<[string, number]>): FileAnalysis["functions"] {
  return lines.map(([name, line]) => ({
    name,
    line,
    parameters: 0,
    complexity: 1,
    isAsync: false,
  }));
}

describe("extractSections", () => {
  it("maps a TS file with imports + 3 functions in source order", () => {
    const source = [
      "// Service utilities for the demo domain.",
      'import { formatName } from "./format";',
      'import db from "./db";',
      "",
      "export const helper = (x: number): number => {",
      "  return x + 1;",
      "};",
      "",
      "function main(): void {",
      "  if (x) {",
      "    helper(x);",
      "  }",
      "}",
      "",
      "export function tail(): string {",
      '  return "tail";',
      "}",
    ].join("\n");
    const existing: Existing = {
      functions: makeFunctions([
        ["helper", 5],
        ["main", 9],
        ["tail", 15],
      ]),
      classes: [],
    };

    const sections = extractSections("src/util.ts", source, existing);

    expect(sections.map((s) => [s.kind, s.name, s.start, s.end])).toEqual([
      ["imports", "imports", 1, 4],
      ["function", "helper", 5, 8],
      ["function", "main", 9, 14], // next start (15) − 1: blank line rides along
      ["function", "tail", 15, 17],
    ]);
    // codeLines: imports(2) / helper body(3) / main body(5) / tail body(3)
    expect(sections.map((s) => s.codeLines)).toEqual([2, 3, 5, 3]);
    // depth: header 0, flat bodies 1, main nests one if-level deeper (2)
    expect(sections.map((s) => s.depth)).toEqual([0, 1, 2, 1]);
  });

  it("marks a header with top-level statements as module, not imports", () => {
    const source = [
      '"use strict";',
      "",
      "const VERSION = 2;",
      "",
      "function only(): number {",
      "  return VERSION;",
      "}",
    ].join("\n");
    const sections = extractSections("src/solo.ts", source, {
      functions: makeFunctions([["only", 5]]),
      classes: [],
    });
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ kind: "module", start: 1, end: 4, codeLines: 2, depth: 0 });
    expect(sections[1]).toMatchObject({ kind: "function", name: "only", start: 5, end: 7 });
  });

  it("uses the Python indentation heuristic (nested defs stay inside)", () => {
    const source = [
      "#!/usr/bin/env python3",
      "import os",
      "",
      "def outer():",
      "    if True:",
      "        pass",
      "",
      "    def inner():",
      "        pass",
      "",
      "    return os.name",
      "",
      "class Thing:",
      "    def method(self):",
      "        pass",
    ].join("\n");
    // The regex parser above is brace-shaped and finds no Python defs —
    // extractSections scans them itself for Python files.
    const sections = extractSections("pkg/mod.py", source, { functions: [], classes: [] });

    expect(sections.map((s) => [s.kind, s.name, s.start, s.end])).toEqual([
      ["imports", "imports", 1, 3],
      ["function", "outer", 4, 12],
      ["function", "inner", 8, 10],
      ["class", "Thing", 13, 15],
      ["function", "method", 14, 15],
    ]);
    // codeLines — exact partition, no double counting: import(1) /
    // outer(6−2 inner) / inner(2) / Thing(3−2 method) / method(2). The
    // Python dedent keeps nested defs inside the parent RANGE, but each
    // code line must be represented by exactly one section (voxel honesty).
    expect(sections.map((s) => s.codeLines)).toEqual([1, 4, 2, 1, 2]);
    const sum = sections.reduce((s, x) => s + x.codeLines, 0);
    expect(sum).toBe(10); // == distinct code lines in the fixture
    // depth: 8-space bodies → step 4; header top-level → 0
    expect(sections.map((s) => s.depth)).toEqual([0, 4, 4, 4, 4]);
  });

  it("returns exactly one module section for files without functions", () => {
    const source = [
      "// Only top-level statements here.",
      "const a = 1;",
      "",
      "// trailing comment",
      "const b = 2;",
    ].join("\n");
    const sections = extractSections("plain.ts", source, { functions: [], classes: [] });
    expect(sections).toEqual([
      { name: "module", kind: "module", start: 1, end: 5, codeLines: 2, depth: 0 },
    ]);
  });

  it("handles empty and whitespace-only files with one empty module section", () => {
    expect(extractSections("empty.ts", "", { functions: [], classes: [] })).toEqual([
      { name: "module", kind: "module", start: 1, end: 1, codeLines: 0, depth: 0 },
    ]);
    expect(extractSections("blank.py", "\n\n", { functions: [], classes: [] })).toEqual([
      { name: "module", kind: "module", start: 1, end: 3, codeLines: 0, depth: 0 },
    ]);
  });

  it("caps at 24 sections and consolidates the rest into one module chunk", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `function fn${i}() { return ${i}; }`);
    const source = lines.join("\n");
    const existing: Existing = {
      functions: makeFunctions(lines.map((_, i) => [`fn${i}`, i + 1])),
      classes: [],
    };
    const sections = extractSections("many.ts", source, existing);
    expect(sections).toHaveLength(24);
    expect(sections[22]).toMatchObject({ kind: "function", name: "fn22", start: 23, end: 23 });
    const merged = sections[23]!;
    expect(merged).toMatchObject({ kind: "module", name: "module", start: 24, end: 30 });
    expect(merged.codeLines).toBe(7); // fn23..fn29 consolidated, nothing hidden
  });

  it("is deterministic and dedupes landmarks on the same line", () => {
    const source = "const a = (x) => {\n  return x;\n};\n\nclass Repo {\n  find() {}\n}\n";
    const functions = makeFunctions([
      ["a", 1],
      ["a", 1], // duplicate parser hit on the same line
    ]);
    const classes: FileAnalysis["classes"] = [
      { name: "Repo", line: 5, methods: 1 },
      { name: "Repo", line: 5, methods: 1 },
    ];
    const first = extractSections("dup.ts", source, { functions, classes });
    const second = extractSections("dup.ts", source, { classes, functions }); // reversed order
    expect(second).toEqual(first);
    // File starts with the function → no header block; duplicate parser
    // hits on the same line must not duplicate sections
    expect(first.map((s) => s.start)).toEqual([1, 5]);
    expect(first.filter((s) => s.start === 1)).toHaveLength(1);
  });
});
