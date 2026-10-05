import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * `--fs-meta` (design/globals.css:46) declares itself the smallest allowed text
 * and says why: one-off px values drift. It drifted anyway — nineteen class
 * values and two CSS rules sat under it, the smallest at 8.5px on the CWE badge,
 * which is the label a reader needs in order to check a finding against the
 * rule that fired. A floor nobody enforces is a comment.
 */
const SRC = path.resolve(import.meta.dirname, "../src");

/** Files whose numbers are not screen pixels: the 3D labels scale with `distanceFactor`. */
const SCALED_IN_3D = ["components/CityTree.tsx"];

function files(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => extensions.includes(path.extname(f)))
    .map((f) => path.join(dir, f));
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join("/");

describe("the type floor", () => {
  it("keeps every Tailwind text size at or above --fs-meta", () => {
    const offenders: string[] = [];
    for (const f of files(SRC, [".tsx", ".ts"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/text-\[([\d.]+)(px|rem)\]/g)) {
        const size = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (size < 11) offenders.push(`${rel(f)}: ${m[0]} (= ${size}px)`);
      }
    }
    expect(offenders, `text under 11px:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("keeps every CSS font-size at or above --fs-meta", () => {
    const offenders: string[] = [];
    for (const f of files(SRC, [".css"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/font-size:\s*([\d.]+)px/g)) {
        if (Number(m[1]) < 11) offenders.push(`${rel(f)}: ${m[0]}`);
      }
      for (const m of text.matchAll(/font-size:\s*([\d.]+)rem/g)) {
        if (Number(m[1]) < 0.6875) offenders.push(`${rel(f)}: ${m[0]} (= ${Number(m[1]) * 16}px)`);
      }
    }
    expect(offenders, `CSS sizes under 11px:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("leaves the scaled 3D label numbers the only sub-floor values", () => {
    const found: string[] = [];
    for (const f of files(SRC, [".tsx"])) {
      const text = readFileSync(f, "utf-8");
      for (const m of text.matchAll(/fontSize:\s*["']?([\d.]+)(px|rem)?/g)) {
        const size = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (size < 11) found.push(rel(f));
      }
    }
    for (const file of found) {
      expect(
        SCALED_IN_3D,
        `${file} sets a numeric font size under 11 without being 3D-scaled`,
      ).toContain(file);
    }
    expect(found.length).toBeGreaterThan(0); // the whitelist would silently pass an empty list
  });
});
