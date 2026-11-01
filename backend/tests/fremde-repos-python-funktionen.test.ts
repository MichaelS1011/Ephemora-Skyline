import { describe, expect, it } from "vitest";
import {
  extractClasses,
  extractFunctions,
  extractSections,
} from "../src/services/analyzer/metrics.js";

/**
 * Fund 2026-10-31/F3 (fremde Repos): `extractFunctions` knows three shapes, all
 * of them brace-or-arrow syntax. A Python `def` is none of those, so every Python
 * file in the scan answers with an empty function list. Measured over real foreign
 * repositories on 2026-10-31:
 *
 *   probe                       Python files   files with 0 functions
 *   MoneyPrinterTurbo                   94                     94  (100 %)
 *   aether-benchmark-suite               26                    26  (100 %)
 *   vendored-Python sample            2 000                 1 982  (99,1 %)
 *
 * The classes of those same files ARE named (58 of 94 files carry a class), and so
 * are the voxel sections — the asymmetry is the parser, not the language.
 * `functions` is a field of `/api/result/:id` and of every stored city, so a
 * reader of that payload (the panel, the export, the agent channel) is told a
 * Python file has no functions.
 */

const PY = `"""A module the way foreign repositories write it."""
import os


class Voice:
    def speak(self, text):
        return text.strip()

    async def stream(self, parts):
        out = []
        for p in parts:
            if p:
                out.append(p)
        return out


def build_engine(retries, seed=None):
    if retries > 3:
        raise ValueError("too many")
    for i in range(retries):
        print(i, os.getcwd(), seed)
    return {"ok": True}


def idle():
    return 0
`;

describe("Python defs reach the function list", () => {
  it("names the two module-level defs and the two methods", () => {
    const found = extractFunctions(PY, "Python").map((f) => f.name);
    for (const name of ["speak", "stream", "build_engine", "idle"]) {
      expect(
        found,
        `extractFunctions did not name ${name}() — the file reports 0 functions`,
      ).toContain(name);
    }
  });

  it("gives a Python function a real complexity score, not the signature-line default", () => {
    const byName = Object.fromEntries(extractFunctions(PY, "Python").map((f) => [f.name, f]));
    expect(byName.build_engine?.parameters, "retries and seed are two parameters").toBe(2);
    expect(
      byName.build_engine?.complexity ?? 1,
      "a def with an if and a for is not complexity 1",
    ).toBeGreaterThan(2);
    expect(byName.stream?.isAsync, "async def is an async function").toBe(true);
  });

  it("still leaves the classes and sections it already finds (the asymmetry guard)", () => {
    // These two are green today on purpose: they show the language is understood
    // everywhere else, so the empty function list is a missing shape and not a
    // "Python is not supported" decision.
    expect(extractClasses(PY).map((c) => c.name)).toContain("Voice");
    const names = extractSections("mod.py", PY, {
      functions: extractFunctions(PY, "Python"),
      classes: extractClasses(PY),
    }).map((s) => s.name);
    expect(names).toContain("Voice");
  });

  it("leaves a TypeScript file that quotes a Python sample alone", () => {
    // The other half of the fix. Measured on this checkout 2026-10-31: four
    // test files carry Python snippets, and a `def` pattern that ignores the
    // language named `speak()` as a function of a TypeScript file — which the
    // panel, the export and the agent channel would then repeat.
    const TS = `export function render(label: string): string {
  const sample = "def speak(text):\\n    return text";
  return label + sample;
}
`;
    const names = extractFunctions(TS, "TypeScript").map((f) => f.name);
    expect(names).toContain("render");
    expect(names, "a Python name inside a TypeScript string is not a TypeScript function").toEqual([
      "render",
    ]);
  });
});
