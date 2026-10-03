import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { handleLocalAnalyze, pruneStaleUploadDirs } from "../src/server/routes/local-analyze.js";
import type { AnalysisResult } from "../src/models/index.js";
import type { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";

/**
 * Two things the staged copies got wrong before this file existed.
 *
 * One: the TTL registry lived in RAM, so every restart forgot the folders it
 * had staged and left a copy of the user's source behind — 212 of them had
 * accumulated in /tmp/codecity-uploads on the development machine while the
 * server "pruned stale uploads every 6 hours". The sweep now reads the staging
 * root itself, and only touches direct children whose name is the uuid this
 * route generates.
 *
 * Two: the copies were world-readable in a shared /tmp. A tool that uploads a
 * repository to nobody but itself must not hand it to the rest of the machine.
 */
const ROOT = process.env.CODECITY_UPLOAD_DIR!;
const UUID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

function makeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

/** The analysis result is not what this test is about — a stub is enough */
const stubOrchestrator = () =>
  ({
    analyzeDirectory: async (analysisId: string): Promise<AnalysisResult> =>
      ({
        id: analysisId,
        repo: { owner: "local", name: "x", branch: "local", cloneUrl: "", analyzedAt: "" },
        files: [],
        directories: [],
        summary: {
          totalFiles: 1,
          totalDirectories: 0,
          totalLines: 0,
          avgCyclomatic: 0,
          maxCyclomatic: 0,
          languages: {},
          totalVulnerabilities: 0,
          vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
          languagesByLines: {},
        },
      }) as unknown as AnalysisResult,
  }) as unknown as AnalysisOrchestrator;

async function stagedDir(id: string): Promise<string> {
  return path.join(ROOT, id);
}

async function exists(p: string): Promise<boolean> {
  return fs
    .lstat(p)
    .then(() => true)
    .catch(() => false);
}

describe("the staging root is swept, not only remembered", () => {
  beforeAll(async () => {
    await fs.mkdir(ROOT, { recursive: true });
  });

  it("removes an orphaned uuid-named folder past the TTL and keeps everything else", async () => {
    const stale = await stagedDir(UUID);
    const fresh = await stagedDir("11111111-2222-3333-4444-555555555555");
    const stranger = path.join(ROOT, "someone-elses-folder");
    const symlinked = path.join(ROOT, "99999999-8888-7777-6666-555555555555");
    for (const dir of [stale, fresh, stranger]) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "x.ts"), "export const x = 1;\n");
    }
    await fs.mkdir(path.join(ROOT, "keep-me-link-target"), { recursive: true });
    if (!(await exists(symlinked))) {
      await fs.symlink(path.join(ROOT, "keep-me-link-target"), symlinked, "dir");
    }

    // the stale folder is a day and an hour old, the rest is from right now
    const past = Date.now() - 25 * 60 * 60 * 1000;
    await fs.utimes(stale, new Date(past), new Date(past));
    await pruneStaleUploadDirs(Date.now() + 60 * 60 * 1000);

    expect(await exists(stale), "the orphaned copy must be gone").toBe(false);
    expect(await exists(fresh), "a copy still inside its TTL stays").toBe(true);
    expect(await exists(stranger), "a folder this app never names is not ours to delete").toBe(
      true,
    );
    expect(await exists(symlinked), "a symlink is left alone, not followed").toBe(true);
    expect(await exists(path.join(ROOT, "keep-me-link-target", "x.ts"))).toBe(false); // never written
  }, 30000);

  it("stages the uploaded folder owner-only", async () => {
    const res = makeRes();
    await handleLocalAnalyze(
      {
        body: {
          name: "perm-check",
          files: [{ path: "src/a.ts", content: "export const a = 1;\nconsole.log(a);\n" }],
        },
      } as never,
      res as never,
      () => stubOrchestrator(),
      new Map<string, AnalysisResult>() as never,
    );
    expect(res.statusCode, JSON.stringify(res.body)).toBe(202);
    const id = (res.body as { id: string }).id;
    const dir = await stagedDir(id);
    const dirMode = (await fs.stat(dir)).mode;
    const fileMode = (await fs.stat(path.join(dir, "src", "a.ts"))).mode;
    expect(
      dirMode & 0o077,
      `staged folder must not be group/world accessible, got ${dirMode.toString(8)}`,
    ).toBe(0);
    expect(
      fileMode & 0o077,
      `staged file must not be group/world accessible, got ${fileMode.toString(8)}`,
    ).toBe(0);
  }, 30000);
});
