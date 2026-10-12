// @vitest-environment node
/**
 * The backend half of the mirror pin. `frontend/src/config/gitignore.ts` carries
 * a byte-identical copy of this matcher, because the browser has to make the same
 * call before it counts a folder against the file cap. This file checks the same
 * verdict table against the real implementation, so a change here that the copy
 * does not follow fails in both packages.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { IgnoreMatcher } from "../src/services/analyzer/gitignore.js";

const REPO = path.resolve(import.meta.dirname, "..", "..");

function mirroredBlock(relative: string): string {
  const source = readFileSync(path.join(REPO, relative), "utf-8");
  const start = source.indexOf("BEGIN gitignore mirror");
  const end = source.indexOf("END gitignore mirror");
  if (start === -1 || end === -1) return `MISSING MARKERS in ${relative}`;
  const from = source.indexOf("\n", start) + 1;
  const to = source.lastIndexOf("\n", end);
  return source.slice(from, to).trim();
}

/** [rules of the .gitignore, path, kind, ignored?] — the table the mirror shares */
const CASES: [string, string, "file" | "dir", boolean][] = [
  ["build/\n", "build/app.js", "file", true],
  ["build/\n", "build", "dir", true],
  ["build/\n", "rebuild", "file", false],
  ["*.log\n", "server.log", "file", true],
  ["*.log\n", "src/server.log", "file", true],
  ["node_modules\n", "a/node_modules", "dir", true],
  ["node_modules\n", "a/node_modules/b.ts", "file", false],
  ["/dist/\n", "dist/x.js", "file", true],
  ["/dist/\n", "src/dist/x.js", "file", false],
  ["src/*.ts\n", "src/a.ts", "file", true],
  ["src/*.ts\n", "src/deep/a.ts", "file", false],
  ["a/**/b\n", "a/x/y/b", "file", true],
  ["tmp\n", "tmp", "file", true],
  ["build/*\n!build/keep.js\n", "build/keep.js", "file", false],
  ["build/*\n!build/keep.js\n", "build/app.js", "file", true],
  ["temp[0-9].bak\n", "temp4.bak", "file", true],
  [".env\n", ".env", "file", true],
];

describe("the staged walk and the browser answer alike", () => {
  it("keeps the mirrored block in the browser identical to this one", () => {
    expect(mirroredBlock("frontend/src/config/gitignore.ts")).toBe(
      mirroredBlock("backend/src/services/analyzer/gitignore.ts"),
    );
  });

  it.each(CASES)("judges %j at %j (%j) as %j", (rules, target, kind, expected) => {
    const matcher = new IgnoreMatcher().add("", rules);
    expect(matcher.isIgnored(target, kind)).toBe(expected);
  });

  it("names the rule that decided", () => {
    const matcher = new IgnoreMatcher().add("pkg", "build/\n");
    expect(matcher.reasonFor("pkg/build/app.js", "file")).toBe("pkg/build/");
  });
});
