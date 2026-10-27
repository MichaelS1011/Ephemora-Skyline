/**
 * git-churn tests — parser and scoring, verified against a real git repo
 * created in a temp dir (no fixtures on disk that could go stale).
 *
 * Deliberately a real-process test, and deliberately not one of the quiet
 * scanner's customers. It builds a five-commit history with `git init/add/commit
 * /mv` because the claim is about what `git log --numstat` actually prints for a
 * rename — a stubbed churn reader would test the parser against a fixture someone
 * typed, and the whole point is that the fixture is the tool's own output. What
 * it forks is `git`, twice per case, into a temp directory it deletes: no
 * gitleaks, no semgrep, no ruff, no osv-scanner, no `npm audit`. Measured
 * 5,4 s of test time at load 106 — the load is git indexing, not a scanner engine,
 * and it is the shortest honest way to ask this question.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  collectGitChurn,
  hasGitHistory,
  parseNumstatLine,
} from "../src/services/analyzer/git-churn.js";

let tmpDir: string;

function git(...args: string[]): void {
  execFileSync("git", ["-C", tmpDir, ...args], { stdio: "pipe" });
}

async function write(rel: string, content: string): Promise<void> {
  const abs = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-churn-"));
  execFileSync("git", ["init", "-q", tmpDir]);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Churn Test");

  // Commit 1: create two files
  await write("hot.ts", "export const a = 1;\n");
  await write("calm.ts", "export const b = 2;\n");
  git("add", ".");
  git("commit", "-qm", "initial");

  // Commits 2-4: churn hot.ts heavily, touch calm.ts once more
  for (let i = 0; i < 3; i++) {
    await write("hot.ts", `export const a = ${i + 10};\n`.repeat(20));
    await write("calm.ts", `export const b = ${i + 3};\n`);
    git("add", ".");
    git("commit", "-qm", `update ${i}`);
  }

  // Rename hot.ts → hot-renamed.ts (parser must track the new path)
  execFileSync("git", ["-C", tmpDir, "mv", "hot.ts", "hot-renamed.ts"]);
  git("commit", "-qm", "rename hot");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("parseNumstatLine", () => {
  it("parses plain text numstat rows", () => {
    expect(parseNumstatLine("10\t2\tsrc/a.ts")).toEqual({
      path: "src/a.ts",
      added: 10,
      deleted: 2,
    });
  });

  it("maps binary dashes to zero lines", () => {
    expect(parseNumstatLine("-\t-\timg.png")).toEqual({
      path: "img.png",
      added: 0,
      deleted: 0,
    });
  });

  it("takes the new path from brace renames", () => {
    expect(parseNumstatLine("1\t1\tsrc/{old.ts => new.ts}")).toEqual({
      path: "src/new.ts",
      added: 1,
      deleted: 1,
      renamedFrom: "src/old.ts",
    });
  });

  it("takes the new path from full-path renames", () => {
    expect(parseNumstatLine("1\t1\tsrc/old.ts => src/new.ts")).toEqual({
      path: "src/new.ts",
      added: 1,
      deleted: 1,
      renamedFrom: "src/old.ts",
    });
  });

  it("returns null for garbage", () => {
    expect(parseNumstatLine("not a numstat line")).toBeNull();
  });
});

describe("collectGitChurn", () => {
  it("reports a real repo as having git history", async () => {
    expect(await hasGitHistory(tmpDir)).toBe(true);
    expect(await hasGitHistory(path.dirname(tmpDir))).toBe(false);
  });

  it("counts commits and computes higher churn for the hotspot", async () => {
    const result = await collectGitChurn(tmpDir);
    expect(result.meaningful).toBe(true);
    expect(result.totalCommits).toBe(5);

    const hot = result.byPath.get("hot-renamed.ts");
    expect(hot).toBeDefined();
    expect(hot!.commits).toBeGreaterThanOrEqual(4); // 3 updates + rename

    const calm = result.byPath.get("calm.ts");
    expect(calm).toBeDefined();
    expect(calm!.commits).toBe(4); // initial + 3 updates
    expect(hot!.score).toBeGreaterThan(calm!.score);
  });

  it("clamps scores to 0..1", async () => {
    const result = await collectGitChurn(tmpDir);
    for (const c of result.byPath.values()) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });

  it("flags single-commit history as not meaningful", async () => {
    const shallow = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-shallow-"));
    try {
      execFileSync("git", ["init", "-q", shallow]);
      const gitShallow = (...args: string[]) =>
        execFileSync("git", ["-C", shallow, ...args], { stdio: "pipe" });
      gitShallow("config", "user.email", "t@e.com");
      gitShallow("config", "user.name", "t");
      await fs.writeFile(path.join(shallow, "x.ts"), "export const x = 1;\n");
      gitShallow("add", ".");
      gitShallow("commit", "-qm", "only");

      const result = await collectGitChurn(shallow);
      expect(result.totalCommits).toBe(1);
      expect(result.meaningful).toBe(false);
    } finally {
      await fs.rm(shallow, { recursive: true, force: true });
    }
  });
});

/**
 * Auftrag #15 (defect lane, 2026-10-27): the absolute dates behind the age.
 *
 * `daysSinceLastCommit` was counted against `Date.now()` AT SCAN TIME and
 * shipped as a bare day number. A city lives in the browser's local index for
 * 24 h (`frontend/src/recentCities.ts`); re-opening it later showed an age too
 * small by its shelf time, and no field in the payload said which moment the
 * count started from. The honest repair is to ship the epoch-ms dates the same
 * parse already holds — `firstCommitAt` (earliest commit of the path, rename
 * chains followed) and `lastCommitAt` — so a surface can name its reference.
 *
 * Known limits of the pass (they belong to the git call, not to these fields):
 * `--no-merges` never sees a path that only appears on a merged branch, and a
 * deleted file has no entry because the scan analyses the current tree.
 */
describe("absolute commit dates per path", () => {
  it("ships firstCommitAt and lastCommitAt as epoch-ms integers", async () => {
    const result = await collectGitChurn(tmpDir);
    const hot = result.byPath.get("hot-renamed.ts")!;
    expect(Number.isInteger(hot.firstCommitAt), "firstCommitAt must ship").toBe(true);
    expect(Number.isInteger(hot.lastCommitAt), "lastCommitAt must ship").toBe(true);
    expect(hot.firstCommitAt).toBeLessThanOrEqual(hot.lastCommitAt);
    expect(hot.lastCommitAt).toBeLessThanOrEqual(Date.now());
  });

  it("keeps the rename chain's FIRST commit, not the rename's", async () => {
    const result = await collectGitChurn(tmpDir);
    // The one commit that created hot.ts (before the git mv) — independent
    // evidence read from git itself, not from the parser's own bookkeeping.
    const initialMs = Date.parse(
      execFileSync(
        "git",
        ["-C", tmpDir, "log", "--format=%aI", "--no-merges", "--reverse", "-1", "--", "hot.ts"],
        {
          encoding: "utf-8",
        },
      ).trim(),
    );
    expect(result.byPath.get("hot-renamed.ts")!.firstCommitAt).toBe(initialMs);
    // calm.ts came from that same initial commit — the two must agree.
    expect(result.byPath.get("calm.ts")!.firstCommitAt).toBe(initialMs);
  });

  it("derives daysSinceLastCommit from lastCommitAt on the scan's one clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // Pretend the scan runs 40 days later than it does: the day count must
      // move WITH lastCommitAt, because both read the same Date.now().
      vi.setSystemTime(Date.now() + 40 * 86_400_000 + 5 * 60_000);
      const result = await collectGitChurn(tmpDir);
      const hot = result.byPath.get("hot-renamed.ts")!;
      expect(hot.daysSinceLastCommit).toBe(
        Math.max(0, Math.floor((Date.now() - hot.lastCommitAt) / 86_400_000)),
      );
      expect(hot.daysSinceLastCommit).toBeGreaterThanOrEqual(39);
    } finally {
      vi.useRealTimers();
    }
  });
});
