import { afterAll, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { handleLocalAnalyze, pruneStaleUploadDirs } from "../src/server/routes/local-analyze.js";
import { makeSkeleton, failJob } from "../src/server/routes/job-progress.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import type { AnalysisResult } from "../src/models/index.js";
import { usePrivateStaging } from "./helpers/privateStaging.js";
// A staging root of this file's own — the TTL prune below fast-forwards the clock,
// and in the shared suite root that reaches into a sibling file's staged folders.
const STAGING = await usePrivateStaging("failed-analysis");

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

function makeReq(body: unknown) {
  return { body } as unknown as import("express").Request;
}

type Store = Map<string, AnalysisResult>;

afterAll(() => STAGING.release());

describe("failed analysis contract (H1)", () => {
  it("marks the skeleton failed so /api/status surfaces the real error", async () => {
    // Orchestrator stub whose pipeline explodes mid-run
    const orchestrator = {
      analyzeDirectory: async (): Promise<AnalysisResult> => {
        throw new Error("scanner binary exploded");
      },
    } as unknown as AnalysisOrchestrator;

    const store: Store = new Map();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "broken", files: [{ path: "a.ts", content: "const x = 1;" }] }),
      res as never,
      () => orchestrator,
      store,
    );
    expect(res.statusCode).toBe(202);
    const id = (res.body as { id: string }).id;

    // Background job has a moment to fail
    for (let i = 0; i < 20 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const record = store.get(id);
    expect(record?.status).toBe("failed");
    expect(record?.error).toContain("exploded");
    // the failed record stays addressable — no silent 404 for polling clients
    expect(record).toBeDefined();
  });

  it("failJob without a skeleton is a no-op (no crash)", () => {
    const store: Store = new Map();
    expect(() => failJob("no-such-id", "msg", store)).not.toThrow();
  });

  it("makeSkeleton starts as analyzing with zeroed summary", () => {
    const skeleton = makeSkeleton("id-1", {
      owner: "local",
      name: "x",
      branch: "local",
      cloneUrl: "",
      analyzedAt: "",
    });
    expect(skeleton.status).toBe("analyzing");
    expect(skeleton.summary.totalFiles).toBe(0);
  });

  it("skips empty upload payloads with a helpful message", async () => {
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "x", files: [] }),
      res as never,
      {} as never,
      new Map(),
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain("No files received");
  });

  it("stages and KEEPS the upload dir when the pipeline throws — test runner reuses it", async () => {
    const orchestrator = {
      analyzeDirectory: async (): Promise<AnalysisResult> => {
        throw new Error("boom");
      },
    } as unknown as AnalysisOrchestrator;
    // the suite stages in its own root (vitest.config.ts), never the user's
    const uploadsRoot = process.env.CODECITY_UPLOAD_DIR!;
    const store: Store = new Map();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "boom", files: [{ path: "a.ts", content: "const x = 1;" }] }),
      res as never,
      () => orchestrator,
      store,
    );
    const id = (res.body as { id: string }).id;
    for (let i = 0; i < 20 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(store.get(id)?.status).toBe("failed");
    // New contract: the staged dir SURVIVES the failure so the test runner
    // can reuse it; the TTL sweeper (pruneStaleUploadDirs) removes it later.
    const after = await fs.readdir(uploadsRoot).catch(() => [] as string[]);
    expect(after).toContain(id);
    // …and the sweeper honors its TTL contract: fresh dirs survive,
    // stale ones (>24h) are swept
    await pruneStaleUploadDirs();
    const afterFreshPrune = await fs.readdir(uploadsRoot).catch(() => [] as string[]);
    expect(afterFreshPrune).toContain(id);
    await pruneStaleUploadDirs(Date.now() + 25 * 60 * 60 * 1000);
    const afterStalePrune = await fs.readdir(uploadsRoot).catch(() => [] as string[]);
    expect(afterStalePrune).not.toContain(id);
  });
});
