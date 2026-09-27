import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { handleLocalAnalyze } from "../src/server/routes/local-analyze.js";
import { makeSkeleton, failJob } from "../src/server/routes/analyze.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import type { AnalysisResult } from "../src/models/index.js";

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
      orchestrator,
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

  it("stages and cleans up: upload dir is removed even when the pipeline throws", async () => {
    const orchestrator = {
      analyzeDirectory: async (): Promise<AnalysisResult> => {
        throw new Error("boom");
      },
    } as unknown as AnalysisOrchestrator;
    const uploadsRoot = path.join(os.tmpdir(), "codecity-uploads");
    const before = new Set(await fs.readdir(uploadsRoot).catch(() => []));
    const store: Store = new Map();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "boom", files: [{ path: "a.ts", content: "const x = 1;" }] }),
      res as never,
      orchestrator,
      store,
    );
    const id = (res.body as { id: string }).id;
    for (let i = 0; i < 20 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    // cleanup runs in the finally AFTER the failed status lands — poll for it
    let dirGone = false;
    for (let i = 0; i < 50; i++) {
      const after = await fs.readdir(uploadsRoot).catch(() => [] as string[]);
      if (!after.includes(id)) {
        dirGone = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(dirGone).toBe(true); // cleaned up despite the crash
  });
});
