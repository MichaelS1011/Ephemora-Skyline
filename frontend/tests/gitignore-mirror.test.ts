// @vitest-environment node
/**
 * The browser's .gitignore copy must be the backend's rule set, not a dialect
 * of it: the browser decides what counts against the file cap, the backend
 * decides what it stages, and a folder whose two answers differ is a folder
 * whose numbers on the screen mean nothing.
 *
 * Two pins here: the mirrored block compared byte for byte, and one verdict
 * table the mirror has to answer on its own.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { IgnoreMatcher } from "../src/config/gitignore";

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

/** [rules of the .gitignore, path, kind, ignored?] */
const CASES: [string, string, "file" | "dir", boolean][] = [
  ["build/\n", "build/app.js", "file", true],
  ["build/\n", "build", "dir", true],
  ["build/\n", "rebuild", "file", false],
  ["*.log\n", "server.log", "file", true],
  ["*.log\n", "src/server.log", "file", true],
  ["node_modules\n", "a/node_modules", "dir", true],
  // The verdict is per path: a bare folder rule answers `false` for a file
  // inside it. Both walkers test the folder on the way down and never reach
  // that answer, which is why the picker tests its ancestors one by one.
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

describe("the gitignore rules are one rule set on both sides", () => {
  it("mirrors the backend block byte for byte", () => {
    const backend = mirroredBlock("backend/src/services/analyzer/gitignore.ts");
    const client = mirroredBlock("frontend/src/config/gitignore.ts");
    expect(client, "the client must carry the BEGIN/END markers").not.toContain("MISSING");
    expect(backend, "the backend must carry the BEGIN/END markers").not.toContain("MISSING");
    expect(client).toBe(backend);
  });

  it.each(CASES)("judges %j at %j (%j) as %j", (rules, target, kind, expected) => {
    const matcher = new IgnoreMatcher().add("", rules);
    expect(matcher.isIgnored(target, kind)).toBe(expected);
  });

  it("scopes a nested .gitignore to its own folder", () => {
    const matcher = new IgnoreMatcher().add("", "src/\n").add("pkg", "!src/\n");
    expect(matcher.isIgnored("src/a.ts", "file")).toBe(true);
    expect(matcher.isIgnored("pkg/src/a.ts", "file")).toBe(false);
  });
});
