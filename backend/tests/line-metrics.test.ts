import { describe, expect, it } from "vitest";
import { countLines, extractClasses } from "../src/services/analyzer/metrics.js";

/**
 * `lines.total` is summed into the headline "Lines of code" the HUD shows, and
 * `classes[].methods` is part of the exported FileAnalysis contract. Both have
 * to survive contact with a real file — which means with a trailing newline,
 * because every normalised source file on git has one.
 */
describe("countLines", () => {
  it("counts the lines a file has, not the newline that ends it", () => {
    const withNewline = countLines("const a = 1;\nconst b = 2;\n");
    const without = countLines("const a = 1;\nconst b = 2;");
    expect(without).toEqual({ total: 2, code: 2, comments: 0, blank: 0 });
    expect(withNewline).toEqual(without);
  });

  it("keeps total, code, comments and blank consistent", () => {
    const r = countLines("code();\n\n// note\n/* a\n   b */\ncode();\n");
    expect(r).toEqual({ total: 6, code: 2, comments: 3, blank: 1 });
    expect(r.code + r.comments + r.blank).toBe(r.total);
  });

  it("reports an empty file as zero lines", () => {
    expect(countLines("")).toEqual({ total: 0, code: 0, comments: 0, blank: 0 });
  });
});

describe("extractClasses", () => {
  it("counts only the methods inside the class it found", () => {
    const source = [
      "class A {",
      "  one() {}",
      "  two() {}",
      "}",
      "",
      "class B {",
      "  three() {}",
      "}",
      "",
      "function loose() {}",
    ].join("\n");
    expect(extractClasses(source)).toEqual([
      { name: "A", line: 1, methods: 2 },
      { name: "B", line: 6, methods: 1 },
    ]);
  });

  it("does not count a nested block's calls as methods", () => {
    const source = [
      "class Svc {",
      "  run() {",
      "    if (x) {",
      "      doWork();",
      "    }",
      "  }",
      "}",
    ].join("\n");
    expect(extractClasses(source)).toEqual([{ name: "Svc", line: 1, methods: 1 }]);
  });

  it("finds a class whose body opens on the next line", () => {
    const source = ["export class Repo", "{", "  save() {}", "  load() {}", "}"].join("\n");
    expect(extractClasses(source)).toEqual([{ name: "Repo", line: 1, methods: 2 }]);
  });

  it("returns nothing for a file without classes", () => {
    expect(extractClasses("const a = 1;\nfunction f() {}")).toEqual([]);
  });
});
