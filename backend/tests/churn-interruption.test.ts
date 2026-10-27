/**
 * churn-interruption — the git history that arrives CUT OFF is a state of its
 * own, not "no history" (Auftrag #25, the Git-Mauer finding).
 *
 * Measured on this repository: `.git` carries one 50,264,193-byte pack over the
 * upload's 8 MB per-file wall. The collector skips the pack but ships its
 * .idx/.rev — the staged repo is a split object store, and
 * `git log --numstat` dies with `fatal: unable to read tree 4e0dde60…`
 * (exit 128) after emitting only the commits whose trees are still loose
 * (2 of 254 here). Until now that outcome collapsed into `churn: false` and a
 * server-side warn, and the surfaces said "No .git folder in this upload" —
 * a lie for a folder whose .git did arrive.
 *
 * These cases pin the three states apart:
 *   absent          — no .git at all            → ran:false, interrupted:false
 *   shallow         — .git, < MIN commits      → ran:false, interrupted:false
 *   interrupted     — .git, the log DIES       → ran:false, interrupted:true
 * The split-pack fixture is real git in a temp dir (same school as
 * git-churn.test.ts — that file's twelve cases are not touched here).
 */

import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { collectGitChurn, hasGitHistory } from "../src/services/analyzer/git-churn.js";
import { runChurnPhase } from "../src/services/analyzer/orchestrator.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { emptyDroppedFiles } from "../src/services/analyzer/orchestrator.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";

const tmpDirs: string[] = [];

async function freshRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-mauer-"));
  tmpDirs.push(dir);
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "config", "user.email", "mauer@test.example"], {
    stdio: "pipe",
  });
  execFileSync("git", ["-C", dir, "config", "user.name", "Mauer Test"], { stdio: "pipe" });
  return dir;
}

async function commitFile(
  dir: string,
  rel: string,
  content: string,
  dateIso: string,
): Promise<void> {
  await fs.writeFile(path.join(dir, rel), content);
  execFileSync("git", ["-C", dir, "add", "."], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "commit", "-qm", `add ${rel}`, `--date=${dateIso}`], {
    stdio: "pipe",
    env: { ...process.env, GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso },
  });
}

afterAll(async () => {
  for (const dir of tmpDirs) await fs.rm(dir, { recursive: true, force: true });
});

describe("the split object store — measured failure, not a stubbed one", () => {
  it("collectGitChurn dies on a packed history whose pack went over the file cap", async () => {
    const dir = await freshRepo();
    const base = Date.now() - 10 * 60_000;
    for (let i = 0; i < 3; i++) {
      await commitFile(
        dir,
        `f${i}.ts`,
        `export const v = ${i};\n`,
        new Date(base + i * 60_000).toISOString(),
      );
    }
    // Pack everything, then remove ONLY the .pack — the exact shape the upload
    // leaves behind when a pack is skipped by the 8 MB per-file wall while its
    // .idx/.rev (both small) arrive.
    execFileSync("git", ["-C", dir, "gc", "-q", "--prune=now"], { stdio: "pipe" });
    const packDir = path.join(dir, ".git", "objects", "pack");
    const packs = (await fs.readdir(packDir)).filter((f) => f.endsWith(".pack"));
    expect(packs.length).toBeGreaterThan(0); // gc really packed the history
    for (const p of packs) await fs.rm(path.join(packDir, p));

    // .git exists — which is all hasGitHistory asks, and why the broken repo
    // reaches the git call instead of being refused at the door.
    expect(await hasGitHistory(dir)).toBe(true);
    // The measured failure: git cannot walk back past the first packed tree.
    await expect(collectGitChurn(dir)).rejects.toThrow(
      /unable to read|missing necessary|bad object/i,
    );
  });
});

describe("runChurnPhase — the history states are apart", () => {
  it("interrupted: a split pack sets churnInterrupted, keeps churnRan false, and still warns the log", async () => {
    const dir = await freshRepo();
    const base = Date.now() - 10 * 60_000;
    for (let i = 0; i < 3; i++) {
      await commitFile(
        dir,
        `f${i}.ts`,
        `export const v = ${i};\n`,
        new Date(base + i * 60_000).toISOString(),
      );
    }
    execFileSync("git", ["-C", dir, "gc", "-q", "--prune=now"], { stdio: "pipe" });
    const packDir = path.join(dir, ".git", "objects", "pack");
    for (const p of (await fs.readdir(packDir)).filter((f) => f.endsWith(".pack"))) {
      await fs.rm(path.join(packDir, p));
    }

    const warns: unknown[][] = [];
    let started = 0;
    const files = [makeFile({ path: "f0.ts" })];
    const outcome = await runChurnPhase(dir, files, {
      onStart: () => started++,
      log: {
        warn: (a, b) => warns.push([a, b]),
        debug: () => {},
      },
    });
    expect(outcome).toEqual({ churnRan: false, churnInterrupted: true });
    expect(started).toBe(1); // the "Analyzing git history" stage was announced — the pass really ran
    expect(warns.length).toBe(1); // and the server log still carries the line (no existing statement removed)
    expect(files[0]!.churn).toBeUndefined(); // nothing half-read is attached to a file
  });

  it("shallow: a one-commit repo is NOT interrupted — it simply is not meaningful yet", async () => {
    const dir = await freshRepo();
    await commitFile(
      dir,
      "only.ts",
      "export const v = 1;\n",
      new Date(Date.now() - 60_000).toISOString(),
    );
    const outcome = await runChurnPhase(dir, [makeFile({ path: "only.ts" })], {
      log: { warn: () => {}, debug: () => {} },
    });
    expect(outcome).toEqual({ churnRan: false, churnInterrupted: false });
  });

  it("absent: no .git at all — the pass never starts and nothing is interrupted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-mauer-nogit-"));
    tmpDirs.push(dir);
    let started = 0;
    const outcome = await runChurnPhase(dir, [], {
      onStart: () => started++,
      log: { warn: () => {}, debug: () => {} },
    });
    expect(outcome).toEqual({ churnRan: false, churnInterrupted: false });
    expect(started).toBe(0);
  });

  it("ran: an intact multi-commit history still wins — churnRan true, interrupted false, dates attached", async () => {
    const dir = await freshRepo();
    const base = Date.now() - 10 * 60_000;
    for (let i = 0; i < 3; i++) {
      await commitFile(
        dir,
        `f${i}.ts`,
        `export const v = ${i};\n`,
        new Date(base + i * 60_000).toISOString(),
      );
    }
    const files = [makeFile({ path: "f0.ts" }), makeFile({ path: "f1.ts" })];
    const outcome = await runChurnPhase(dir, files, { log: { warn: () => {}, debug: () => {} } });
    expect(outcome).toEqual({ churnRan: true, churnInterrupted: false });
    expect(files[0]!.churn?.commits).toBe(1);
  });
});

describe("the state reaches the city payload", () => {
  it("mapResultToCityData carries churnInterrupted beside the untouched churn flag and gitBudget count", () => {
    const provenance = {
      regex: true,
      gitleaks: false,
      semgrep: false,
      churn: false,
      churnInterrupted: true,
    };
    const dropped = { ...emptyDroppedFiles(), gitBudget: 3, tooLarge: 1 };
    const city = mapResultToCityData(
      makeResult([makeFile({ path: "a.ts" })], {
        summary: {
          ...makeResult([]).summary,
          totalFiles: 1,
          dropped,
          scanProvenance: provenance,
        },
      }),
    );
    // Every statement that existed before still stands:
    expect(city.meta.churn).toBe(false); // "no dates on the buildings" — unchanged
    expect(city.dropped?.gitBudget).toBe(3); // the budget counter — unchanged
    // And the new state rides along: "the log itself was cut off mid-history".
    expect(city.scanProvenance?.churnInterrupted).toBe(true);
    expect(city.scanProvenance?.churn).toBe(false);
  });
});
