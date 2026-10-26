import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { readFileSync } from "fs";
import { uploadsRoot } from "../src/server/routes/local-analyze.js";
import {
  UPLOAD_DIR_ENV,
  decideStart,
  inspectStagingRoot,
  type IgnoreRun,
} from "../src/server/upload-dir-guard.js";

/**
 * START-15 — the start that refuses its own staging folder.
 *
 * The scan reads the user's folder from the copy staged under
 * `CODECITY_UPLOAD_DIR`. The engines that walk a tree follow the repository's
 * ignore rules, and a staging root inside an ignored area is therefore never
 * opened: measured on two byte-identical trees in one repository, the ignored
 * root scans as 0 files and 0 findings while the unchecked one scans as 1 and 1.
 * A start that accepts such a root produces a clean city for a folder that was
 * never looked at, which is the exact failure this product promised against.
 *
 * So the start asks one question about one path and refuses when the answer is
 * "a rule covers you". The refusal has to carry the three pieces an operator can
 * act on: the folder, the rule that covers it (with where the rule lives), and
 * the variable that set the folder.
 *
 * The second half is the honest degradation: when the question cannot be asked
 * at all, the start goes ahead and says so in the log, because "unknown" is not
 * "covered" and refusing on unknown would stop every machine that has no
 * repository tool installed.
 *
 * The process this file forks is `git` (init/check-ignore) — the subject of the
 * check, not a scanner engine — and the failure paths are tested through an
 * injected runner. It stays real on purpose and carries no scanner load.
 */

const repos: string[] = [];
const previousEnv = process.env[UPLOAD_DIR_ENV];

/** A repository of one's own, with the machine's global rules switched off. */
async function makeRepo(gitignore: string, exclude = ""): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "start15-repo-"));
  repos.push(dir);
  execFileSync("git", ["init", "-q", dir]);
  // A developer's global exclude file would decide these tests on some machines
  // and not on others; the repository under test states its own rules.
  const emptyGlobal = path.join(dir, ".no-global-excludes");
  await fs.writeFile(emptyGlobal, "", "utf8");
  execFileSync("git", ["-C", dir, "config", "core.excludesFile", emptyGlobal]);
  await fs.writeFile(path.join(dir, ".gitignore"), gitignore, "utf8");
  if (exclude) {
    await fs.writeFile(path.join(dir, ".git/info/exclude"), exclude, "utf8");
  }
  return dir;
}

afterAll(async () => {
  for (const dir of repos) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  if (previousEnv === undefined) delete process.env[UPLOAD_DIR_ENV];
  else process.env[UPLOAD_DIR_ENV] = previousEnv;
});

describe("a staging folder covered by an ignore rule stops the start", () => {
  it("names the folder, the rule, its source and the variable", async () => {
    const repo = await makeRepo("build/\n");
    const root = path.join(repo, "build", "staged");
    const verdict = await inspectStagingRoot(root);
    expect(verdict.state).toBe("covered");
    if (verdict.state !== "covered") return;
    expect(verdict.root).toBe(root);
    expect(verdict.rule).toBe("build/");
    expect(verdict.ruleSource).toMatch(/^\.gitignore:\d+$/);
    const said = decideStart(verdict).logLine ?? "";
    expect(said).toContain(root);
    expect(said).toContain("build/");
    expect(said).toContain(".gitignore");
    expect(said).toContain(UPLOAD_DIR_ENV);
    expect(decideStart(verdict).abort).toBe(true);
  });

  it("catches a root that only exists as a name, not yet on disk", async () => {
    // `build/` is a directory pattern. A staging root the operator set but never
    // created is matched against it only through something *inside* it, because
    // git cannot tell an absent final component is meant to be a directory. The
    // app creates the folder at the first upload, so the absent one is the
    // normal case at start — and it is the case a plain path check waves past.
    const repo = await makeRepo("out/\n");
    const root = path.join(repo, "out");
    await expect(fs.stat(root)).rejects.toThrow();
    const verdict = await inspectStagingRoot(root);
    expect(verdict.state).toBe("covered");
    expect(decideStart(verdict).abort).toBe(true);
  });

  it("reads the rule from the repository's private exclude file too", async () => {
    const repo = await makeRepo("", ".skyline-scratch/\n");
    const root = path.join(repo, ".skyline-scratch", "staged");
    const verdict = await inspectStagingRoot(root);
    expect(verdict.state).toBe("covered");
    if (verdict.state !== "covered") return;
    expect(verdict.ruleSource).toContain(".git/info/exclude");
    expect(decideStart(verdict).logLine ?? "").toContain(".git/info/exclude");
  });

  it("is asked about the folder the routes really stage into", async () => {
    const repo = await makeRepo("var/\n");
    process.env[UPLOAD_DIR_ENV] = path.join(repo, "var", "staged");
    expect(uploadsRoot()).toBe(path.join(repo, "var", "staged"));
    const verdict = await inspectStagingRoot(uploadsRoot());
    expect(decideStart(verdict).abort).toBe(true);
  });
});

describe("a staging folder no rule covers starts", () => {
  it("accepts a plain folder inside a repository", async () => {
    const repo = await makeRepo("build/\n");
    const root = path.join(repo, "staged-here");
    expect((await inspectStagingRoot(root)).state).toBe("clear");
  });

  it("accepts a folder the rules hand back", async () => {
    // A re-inclusion is a decision somebody made about exactly this folder. The
    // last matching pattern is the answer, and a `!` in front of it means the
    // engines see the tree — refusing here would be a string match, not a check.
    const repo = await makeRepo("build/*\n!build/staged/\n");
    const root = path.join(repo, "build", "staged");
    await fs.mkdir(root, { recursive: true });
    expect((await inspectStagingRoot(root)).state).toBe("clear");
  });

  it("accepts a folder that sits outside every repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "start15-norepo-"));
    expect((await inspectStagingRoot(path.join(dir, "staged"))).state).toBe("clear");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("accepts the default staging root of this machine", async () => {
    if (previousEnv !== undefined) delete process.env[UPLOAD_DIR_ENV];
    const verdict = await inspectStagingRoot(uploadsRoot());
    expect(decideStart(verdict).abort, `default root refused: ${verdict.state}`).toBe(false);
  });

  it("keeps the start unblocked when the question cannot be asked", async () => {
    // The refusal is for a known-covered folder only. Anything else about the
    // check is reported and started past — see the reasoning in the guard.
    const seen: { args: string[][]; cwd: string[]; timeoutMs: number[] } = {
      args: [],
      cwd: [],
      timeoutMs: [],
    };
    const run: IgnoreRun = async (args, cwd, timeoutMs) => {
      seen.args.push(args);
      seen.cwd.push(cwd);
      seen.timeoutMs.push(timeoutMs);
      const missing = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" as const });
      throw missing;
    };
    const root = path.join(os.tmpdir(), "start15-whatever");
    const verdict = await inspectStagingRoot(root, { run });
    expect(verdict.state).toBe("unchecked");
    const decision = decideStart(verdict);
    expect(decision.abort).toBe(false);
    expect(decision.logLine, "unchecked must not pass in silence").toBeTruthy();
    expect(decision.logLine).toContain(UPLOAD_DIR_ENV);
    expect(decision.logLine).toContain(root);

    // bounded, local, and pointed at the folder's own neighbourhood
    expect(seen.timeoutMs.length).toBeGreaterThan(0);
    for (const ms of seen.timeoutMs) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(5000);
    }
    for (const cwd of seen.cwd) {
      const stat = await fs.stat(cwd);
      expect(stat.isDirectory(), `${cwd} is not a real directory`).toBe(true);
    }
    for (const args of seen.args) {
      expect(args.join(" ")).not.toMatch(/https?:/);
      expect(args).toContain("--no-index");
    }
  });

  it("treats a check that fails for a reason it cannot read as unchecked", async () => {
    const run: IgnoreRun = async () => ({
      code: 128,
      stdout: "",
      stderr: "fatal: detected dubious ownership in repository at '/srv/team/repo'",
    });
    const verdict = await inspectStagingRoot("/srv/team/repo/build/staged", { run });
    expect(verdict.state).toBe("unchecked");
    expect(decideStart(verdict).abort).toBe(false);
  });

  it("reads a missing repository as a clear answer, not as a failure", async () => {
    // No repository around the folder means no rule that could cover it. Calling
    // that "unchecked" would warn on every machine that stages into /tmp.
    const run: IgnoreRun = async () => ({
      code: 128,
      stdout: "",
      stderr: "fatal: not a git repository (or any of the parent directories): .git",
    });
    const verdict = await inspectStagingRoot(path.join(os.tmpdir(), "codecity-uploads"), { run });
    expect(verdict.state).toBe("clear");
  });
});

describe("the folder the question is asked about", () => {
  it("reads a blank value as the documented default, not as the launch folder", () => {
    // `CODECITY_UPLOAD_DIR=` is the line the shipped template carries. Taken as a
    // path it is the current working directory, which would stage copies of the
    // user's source inside the project tree and let the sweep chase the folder
    // the server happened to be started from. Measured before the fix: the
    // footprint of a start with the blank value reported its root as "".
    process.env[UPLOAD_DIR_ENV] = "";
    expect(uploadsRoot()).toBe(path.join(os.tmpdir(), "codecity-uploads"));
    process.env[UPLOAD_DIR_ENV] = "   ";
    expect(uploadsRoot()).toBe(path.join(os.tmpdir(), "codecity-uploads"));
  });

  it("keeps a folder the operator named, spaces around it aside", () => {
    const named = path.join(os.tmpdir(), "start15-named");
    process.env[UPLOAD_DIR_ENV] = `  ${named}  `;
    expect(uploadsRoot()).toBe(named);
  });
});

describe("the start is wired behind the verdict", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "../src/server/index.ts"), "utf8");

  it("asks the question before it binds a port", () => {
    expect(source).toMatch(/inspectStagingRoot/);
    // the call site, not the import line
    const callSite = source.lastIndexOf("decideStart(");
    expect(callSite).toBeGreaterThan(source.indexOf("server.on("));
    expect(source.indexOf("server.listen")).toBeGreaterThan(callSite);
  });

  it("leaves with a code when it refuses, and only then", () => {
    const wiring = source.slice(source.lastIndexOf("decideStart("));
    const refusal = wiring.slice(0, wiring.indexOf("server.listen"));
    expect(refusal).toMatch(/abort/);
    expect(refusal).toMatch(/process\.exit\(1\)/);
    expect(refusal).not.toMatch(/process\.exit\(0\)/);
  });
});
