/**
 * duplicates — sliding-window clone detection tests.
 */

import { describe, expect, it } from "vitest";
import { detectDuplicates } from "../src/services/analyzer/duplicates.js";

const LICENSE = ["/**", " * Copyright 2027 CodeCity", " * All rights reserved.", " */", ""];

describe("detectDuplicates", () => {
  it("pairs files sharing a large pasted block", () => {
    const block = Array.from({ length: 20 }, (_, i) => `const value${i} = compute(${i}, x);`).join(
      "\n",
    );
    const a = `${LICENSE.join("\n")}\nexport function alpha() {\n${block}\n}\n`;
    const b = `${LICENSE.join("\n")}\nexport function beta() {\n${block}\n}\n`;
    const result = detectDuplicates(
      new Map([
        ["a.ts", a],
        ["b.ts", b],
      ]),
    );

    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0]!.lines).toBeGreaterThanOrEqual(6);
    const partnersA = result.byPath.get("a.ts")!;
    expect(partnersA[0]!.path).toBe("b.ts");
  });

  it("ignores files that only share the license header", () => {
    const x = `${LICENSE.join("\n")}\nconst a = 1;\n`;
    const y = `${LICENSE.join("\n")}\nconst b = 2;\n`;
    const result = detectDuplicates(
      new Map([
        ["x.ts", x],
        ["y.ts", y],
      ]),
    );
    expect(result.pairs.length).toBe(0);
  });

  it("ignores small files", () => {
    const result = detectDuplicates(
      new Map([
        ["p.ts", "const x = 1;\nconst y = 2;\nconst z = 3;\n"],
        ["q.ts", "const x = 1;\nconst y = 2;\nconst z = 3;\n"],
      ]),
    );
    expect(result.pairs.length).toBe(0);
  });

  it("tolerates whitespace differences between clones", () => {
    const block = Array.from({ length: 10 }, (_, i) => `step(${i});`).join("\n");
    const a = `function run() {\n${block}\n}`;
    const b = `function run() {\n${block
      .split("\n")
      .map((l) => `  ${l}  `)
      .join("\n")}\n}`;
    const result = detectDuplicates(
      new Map([
        ["a.ts", a],
        ["b.ts", b],
      ]),
    );
    expect(result.pairs.length).toBe(1);
  });

  it("keeps partner lists capped and deterministic", () => {
    const block = Array.from({ length: 12 }, (_, i) => `dup(${i});`).join("\n");
    const contents = new Map<string, string>();
    for (const name of ["a", "b", "c", "d"]) {
      contents.set(`${name}.ts`, `function ${name}() {\n${block}\n}`);
    }
    const r1 = detectDuplicates(contents);
    const r2 = detectDuplicates(contents);
    expect(r1).toEqual(r2);
    for (const list of r1.byPath.values()) {
      expect(list.length).toBeLessThanOrEqual(3);
    }
  });
});
