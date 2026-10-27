import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Auftrag #39 — the dictionary cannot quietly grow sentences nobody prints.
 *
 * It started with one: `scan.etaHint` promised "usually about {s} s" and no
 * surface ever read it, because nothing in the payload carries a duration a
 * scan could vouch for. A dead key is not harmless — it reads as a promise the
 * product already made, and the next person trusts it. This is a ratchet, not a
 * clean-up: the budget is what the tree measured the day it was written, so a
 * new orphan fails the guard while the known ones wait in #44.
 */

const SRC = path.resolve(process.cwd(), "src");
const DICT = path.join(SRC, "i18n/dict.ts");

function sources(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(entry) && abs !== DICT) out.push(readFileSync(abs, "utf8"));
    }
  };
  walk(SRC);
  return out.join("\n");
}

function deadKeys(): string[] {
  const dict = readFileSync(DICT, "utf8");
  const keys = [...dict.matchAll(/^\s{2}"([a-zA-Z0-9_.]+)":\s*\{/gm)].map((m) => m[1]!);
  const corpus = sources();
  const used = (k: string): boolean => corpus.includes(`"${k}"`) || corpus.includes(`\`${k}\``);
  return keys.filter((k) => {
    if (used(k)) return false;
    // The documented `…One` / `…Many` pair (dict.ts:14-15): the caller names the
    // base, so a twin is reached through it.
    if (/One$/.test(k) && used(k.replace(/One$/, ""))) return false;
    // A key composed off a variable — `profile.${id}`, `hud.sev_${s}`.
    if (corpus.includes(`${k.split(".").slice(0, -1).join(".")}.\${`)) return false;
    return true;
  });
}

describe("no sentence reaches the dictionary without a surface that prints it", () => {
  it("keeps the orphan count at its measured budget", () => {
    const dead = deadKeys();
    expect(
      dead.length,
      `${dead.length} dictionary keys are read by no source file — either print one of them or delete it. Orphans:\n  ${dead.join("\n  ")}`,
    ).toBeLessThanOrEqual(28);
  });

  it("does not carry an ETA promise without a producer", () => {
    // #39: a duration sentence needs a number behind it. If a real source ever
    // exists (a measured median per file count), this case is where it is
    // allowed to come back — together with the surface that reads it.
    expect(readFileSync(DICT, "utf8")).not.toContain("scan.etaHint");
  });
});
