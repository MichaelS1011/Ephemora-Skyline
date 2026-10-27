import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * The What's-new block at the top of the README is a cut of the released notes,
 * not a paraphrase. It may name only a version the CHANGELOG really carries, and
 * every number it prints must be a number that section already printed — a What's
 * new nobody can re-check is marketing, and this repository does not do that.
 *
 * The block is read by its heading, never by a line count, so the layout may
 * move under it without breaking this guard.
 */

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

const readme = read("README.md");
const changelog = read("CHANGELOG.md");

const block = (() => {
  const from = readme.indexOf("## What's new");
  expect(from, "the README lost its What's new block").toBeGreaterThan(-1);
  const rest = readme.slice(from + "## What's new".length);
  const end = rest.search(/^## /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
})();

/** The section the CHANGELOG devotes to a version, header line included. */
function sectionFor(version: string): string {
  const from = changelog.indexOf(`## [${version}]`);
  expect(
    from,
    `the What's new block names ${version}, which CHANGELOG.md never released`,
  ).toBeGreaterThan(-1);
  const rest = changelog.slice(from);
  const end = rest.search(/\n## \[/);
  return end === -1 ? rest : rest.slice(0, end);
}

const plain = (s: string): string => s.replace(/[*`]/g, "").replace(/\s+/g, " ").trim();

/** Number tokens as written: "1,038" and "0.3.0" stay one token, hyphens split. */
const numbers = (s: string): string[] => s.match(/\d+(?:[.,]\d+)*/g) ?? [];

describe("the What's new block at the top of the README", () => {
  const version = /(\d+\.\d+\.\d+)/.exec(block)?.[1];
  it("names one released version", () => {
    expect(version, "the What's new block states no version a reader can look up").toBeTruthy();
    const section = sectionFor(version!);
    expect(section, `the release ${version} carries no date line`).toMatch(
      /## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}/,
    );
  });

  it("prints no number the CHANGELOG does not print for that version", () => {
    const section = sectionFor(version!);
    const allowed = new Set(numbers(section));
    const invented = [...new Set(numbers(block))].filter((n) => !allowed.has(n));
    expect(
      invented,
      `these numbers in the What's new block are nowhere in the ${version} notes: ${invented.join(", ")}`,
    ).toEqual([]);
  });

  it("cuts its lines out of those notes verbatim", () => {
    const section = plain(sectionFor(version!));
    const bullets = block
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2));
    expect(bullets.length, "the What's new block grew past five lines").toBeLessThanOrEqual(5);
    expect(bullets.length, "the What's new block shows nothing").toBeGreaterThan(0);
    for (const bullet of bullets) {
      const lead = /^\*\*(.+?)\*\*/.exec(bullet)?.[1];
      expect(
        lead,
        `bullet has no bold lead naming the change: ${bullet.slice(0, 60)}`,
      ).toBeTruthy();
      expect(section, `lead is not a sentence of the ${version} notes: ${lead}`).toContain(
        plain(lead!),
      );
      const tail = bullet.replace(/^\*\*.+?\*\*:?\.?\s*—?\s*/, "");
      // ", " splits fragments only before a letter — "1,038" stays one number
      for (const piece of tail.split(/,(?=\s*[a-zA-Z])/)) {
        const want = plain(piece).replace(/^—\s*/, "");
        if (want.length < 4 || !/\d/.test(want)) continue;
        expect(
          section,
          `this measured fragment is not verbatim in the ${version} notes: ${want}`,
        ).toContain(want);
      }
    }
  });

  it("keeps the date a single line, not a salad", () => {
    const dates = block.split("\n").filter((l) => /^\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2}$/.test(l));
    expect(dates.length, "exactly one version-and-date line is expected").toBe(1);
    expect(dates[0], `the block's own date must be the release date: ${dates[0]}`).toContain(
      version!,
    );
    const released = new RegExp(
      `## \\[${version!.replace(/\./g, "\\.")}\\] - (\\d{4}-\\d{2}-\\d{2})`,
    ).exec(changelog);
    expect(dates[0]!, `the release ${version} is dated elsewhere: ${released?.[1]}`).toContain(
      released![1]!,
    );
  });
});
