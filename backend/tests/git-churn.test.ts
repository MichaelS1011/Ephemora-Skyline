/**
 * git-churn tests — parser and scoring, verified against a real git repo
 * created in a temp dir (no fixtures on disk that could go stale).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
