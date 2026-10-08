/**
 * The upload boundary's two promises, fixed here:
 *
 * — no file leaves the scan without a number: a path over MAX_PATH_LEN, an
 *   unsafe path, an oversized file, a user-excluded folder and a failed read are
 *   counted and carried into the result, so "32 files" cannot mean "62 minus 30";
 * — an abort reaches the server: the job, its progress and its staged copy of
 *   the user's source are thrown away instead of outliving the click.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { Request, Response } from "express";
import {
  MAX_PATH_LEN,
  getStagedDir,
  handleCancelLocalAnalyze,
  handleLocalAnalyze,
  isJobCancelled,
  sanitizeDropped,
} from "../src/server/routes/local-analyze.js";
import type { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { ScanCancelledError } from "../src/services/analyzer/orchestrator.js";
import type { AnalysisResult, DroppedFiles } from "../src/models/index.js";

const REPO_DIR = path.resolve(import.meta.dirname, "..", "..");

function makeRes() {
  const res = {
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
  return res;
}

function makeReq(body: unknown, params?: Record<string, string>) {
  return { body, params } as unknown as Request;
}

function summary(dropped?: DroppedFiles): AnalysisResult["summary"] {
  return {
    totalFiles: 1,
    totalDirectories: 0,
    totalLines: 1,
    avgCyclomatic: 1,
    maxCyclomatic: 1,
    languages: {},
    totalVulnerabilities: 0,
    vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
    languagesByLines: {},
    dropped,
  };
}

/** Stub that records what reached the pipeline and what was on disk */
function stubOrchestrator(options: { slow?: boolean; dropped?: DroppedFiles } = {}) {
  const calls: Array<{ dirPath: string; listing: string[]; shouldStop?: boolean }> = [];
  let gate: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    gate = resolve;
  });
  const orchestrator = {
    analyzeDirectory: async (
      analysisId: string,
      dirPath: string,
      _repo: unknown,
      _onEvent?: unknown,
      _config?: unknown,
      shouldStop?: () => boolean,
    ): Promise<AnalysisResult> => {
      const listing = (await fs.readdir(dirPath, { recursive: true })).map(String);
      calls.push({ dirPath, listing, shouldStop: shouldStop?.() === true });
      if (options.slow) {
        await started;
        if (shouldStop?.()) throw new ScanCancelledError();
      }
      return {
        id: analysisId,
        repo: { owner: "local", name: "x", branch: "local", cloneUrl: "", analyzedAt: "" },
        files: listing.map((p) => ({ path: p })) as AnalysisResult["files"],
        directories: [],
        summary: summary(options.dropped),
        createdAt: new Date().toISOString(),
        status: "complete",
      };
    },
  } as unknown as AnalysisOrchestrator;
  return { orchestrator, calls, release: () => gate() };
}

let uploadDir = "";

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join("/tmp", "skyline-caps-"));
  process.env.CODECITY_UPLOAD_DIR = uploadDir;
});

afterAll(async () => {
  delete process.env.CODECITY_UPLOAD_DIR;
  await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
});

const longPath = (chars: number): string =>
  "deep/" + "segment/".repeat(Math.ceil(chars / 8)).slice(0, chars - 5) + "a.ts";

describe("the path cap is one number on both sides", () => {
  it("mirrors MAX_PATH_LEN of the browser reader", async () => {
    const hook = await fs.readFile(
      path.join(REPO_DIR, "frontend/src/hooks/useLocalAnalysis.ts"),
      "utf-8",
    );
    const mirror = /const MAX_PATH_LEN = (\d+);/.exec(hook);
    expect(mirror, "the reader must declare the same path bound").not.toBeNull();
    expect(Number(mirror?.[1])).toBe(MAX_PATH_LEN);
  });

  it("refuses a longer path only on length, not on shape", () => {
    expect(longPath(MAX_PATH_LEN + 80).length).toBeGreaterThan(MAX_PATH_LEN);
  });
});

describe("drop accounting", () => {
  it("counts a too-long path instead of dropping it silently", async () => {
    const { orchestrator } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "deep-folder",
        files: [
          { path: "src/index.ts", content: "const a = 1;\n" },
          { path: longPath(MAX_PATH_LEN + 80), content: "const gone = 1;\n" },
          { path: "../escape.ts", content: "evil" },
        ],
      }),
      res as never,
      () => orchestrator,
      store,
    );
    expect(res.statusCode).toBe(202);
    const body = res.body as { id: string; dropped: DroppedFiles };
    expect(body.dropped.pathTooLong).toBe(1);
    expect(body.dropped.unsafePath).toBe(1);
    await new Promise((r) => setTimeout(r, 120));
    const result = store.get(body.id);
    expect(result?.summary.dropped?.pathTooLong).toBe(1);
    expect(result?.summary.dropped?.unsafePath).toBe(1);
  });

  it("honours the user's exclude folders on disk and counts what they removed", async () => {
    const { orchestrator, calls } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "with-generated",
        config: { excludePaths: ["generated"] },
        files: [
          { path: "src/index.ts", content: "const a = 1;\n" },
          { path: "generated/api.ts", content: "export const x = 1;" },
          { path: "src/generated/schema.ts", content: "export const y = 2;" },
        ],
      }),
      res as never,
      () => orchestrator,
      store,
    );
    expect(res.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 120));
    expect(calls[0]?.listing).toContain("src/index.ts");
    expect(calls[0]?.listing).not.toContain("generated/api.ts");
    expect((res.body as { dropped: DroppedFiles }).dropped.excluded).toBe(2);
  });

  it("keeps a blank exclude needle from emptying the whole scan", async () => {
    const { orchestrator, calls } = stubOrchestrator();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "blank-needle",
        config: { excludePaths: [""] },
        files: [{ path: "src/index.ts", content: "const a = 1;\n" }],
      }),
      res as never,
      () => orchestrator,
      new Map<string, AnalysisResult>(),
    );
    await new Promise((r) => setTimeout(r, 120));
    expect(calls[0]?.listing).toContain("src/index.ts");
    expect((res.body as { dropped: DroppedFiles }).dropped.excluded).toBe(0);
  });

  it("adds the reader's own counts to the scan's", async () => {
    const { orchestrator } = stubOrchestrator({ dropped: { ...sanitizeDropped({}), tooLarge: 2 } });
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "merged",
        // what the browser skipped before uploading anything
        dropped: { pathTooLong: 30, tooLarge: 1 },
        files: [{ path: "src/index.ts", content: "const a = 1;\n" }],
      }),
      res as never,
      () => orchestrator,
      store,
    );
    await new Promise((r) => setTimeout(r, 120));
    const dropped = store.get((res.body as { id: string }).id)?.summary.dropped;
    expect(dropped?.pathTooLong).toBe(30);
    expect(dropped?.tooLarge).toBe(3);
  });

  it("refuses invented counts: garbage in the dropped field degrades to zero", () => {
    expect(sanitizeDropped({ pathTooLong: -5, tooLarge: Number.MAX_VALUE })).toEqual({
      pathTooLong: 0,
      unsafePath: 0,
      tooLarge: 1_000_000,
      unreadable: 0,
      excluded: 0,
    });
    expect(sanitizeDropped("nope").pathTooLong).toBe(0);
    expect(sanitizeDropped(undefined).unreadable).toBe(0);
  });

  it("names the found count and the limit when the folder is over the cap", async () => {
    const { orchestrator } = stubOrchestrator();
    const res = makeRes();
    const files = Array.from({ length: 3001 }, (_, i) => ({
      path: `f${i}.ts`,
      content: "const x = 1;",
    }));
    await handleLocalAnalyze(
      makeReq({ name: "big", files }),
      res as never,
      () => orchestrator,
      new Map<string, AnalysisResult>(),
    );
    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string; found?: number; max?: number };
    expect(body.code).toBe("too_many_files");
    expect(body.found).toBe(3001);
    expect(body.max).toBe(3000);
  });
});

describe("an abort reaches the server", () => {
  it("drops the job, its progress and its staged copy", async () => {
    const { orchestrator } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "abort-me", files: [{ path: "src/index.ts", content: "const a = 1;\n" }] }),
      res as never,
      () => orchestrator,
      store,
    );
    const id = (res.body as { id: string }).id;
    await new Promise((r) => setTimeout(r, 120));
    const dir = getStagedDir(id);
    expect(dir).not.toBeNull();
    expect(store.get(id)?.status).toBe("complete");

    const cancelRes = makeRes();
    await handleCancelLocalAnalyze(makeReq({}, { id }), cancelRes as never, store);
    expect((cancelRes.body as { cancelled: boolean }).cancelled).toBe(true);
    expect(store.get(id)).toBeUndefined();
    await expect(fs.stat(String(dir))).rejects.toThrow();
  });

  it("stops a running scan at its next checkpoint and leaves no copy behind", async () => {
    const { orchestrator, release } = stubOrchestrator({ slow: true });
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "running", files: [{ path: "src/index.ts", content: "const a = 1;\n" }] }),
      res as never,
      () => orchestrator,
      store,
    );
    const id = (res.body as { id: string }).id;
    await new Promise((r) => setTimeout(r, 60));
    const dir = getStagedDir(id);

    const cancelRes = makeRes();
    await handleCancelLocalAnalyze(makeReq({}, { id }), cancelRes as never, store);
    expect(isJobCancelled(id)).toBe(true);
    // a job that is still working deletes its own copy — not pulled out from
    // under it while the scanners read
    expect((cancelRes.body as { stagedRemoved: boolean }).stagedRemoved).toBe(false);
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect(store.get(id)).toBeUndefined();
    await expect(fs.stat(String(dir))).rejects.toThrow();
  });

  it("never publishes a city for a run whose owner already aborted the fetch", async () => {
    const { orchestrator } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    // the browser hung up: the request was aborted before any reply was written
    const req = makeReq({
      name: "gone",
      files: [{ path: "src/index.ts", content: "const a = 1;\n" }],
    }) as Request & { aborted?: boolean };
    req.aborted = true;
    await handleLocalAnalyze(req, res as never, () => orchestrator, store);
    expect(res.body).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("still answers a request whose stream simply ran to its end", async () => {
    // A Node request reads as `destroyed` once its body was consumed. Treating
    // that as an abort swallowed every upload: the POST never answered and the
    // UI stood on "analysing" forever. Found by the browser run, pinned here.
    const { orchestrator } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    const req = makeReq({
      name: "finished-stream",
      files: [{ path: "src/index.ts", content: "const a = 1;\n" }],
    }) as Request & { destroyed?: boolean; aborted?: boolean };
    req.destroyed = true;
    req.aborted = false;
    await handleLocalAnalyze(req, res as never, () => orchestrator, store);
    expect(res.statusCode).toBe(202);
    expect(typeof (res.body as { id?: string }).id).toBe("string");
  });

  it("answers 400 for a name it never minted", async () => {
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleCancelLocalAnalyze(makeReq({}, { id: "../../etc" }), res as never, store);
    expect(res.statusCode).toBe(400);
  });
});
