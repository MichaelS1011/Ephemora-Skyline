import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { safeRelativePath, handleLocalAnalyze } from "../src/server/routes/local-analyze.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import pino from "pino";
import type { AnalysisResult } from "../src/models/index.js";

describe("safeRelativePath", () => {
  it("accepts normal relative paths and normalizes them", () => {
    expect(safeRelativePath("src/index.ts")).toBe("src/index.ts");
    expect(safeRelativePath("./src/index.ts")).toBe("src/index.ts");
    expect(safeRelativePath("src\\lib\\util.py")).toBe("src/lib/util.py");
    expect(safeRelativePath("a//b.ts")).toBe("a/b.ts");
  });

  it("rejects traversal, absolute paths and NUL bytes", () => {
    expect(safeRelativePath("../etc/passwd")).toBeNull();
    expect(safeRelativePath("src/../../etc/passwd")).toBeNull();
    expect(safeRelativePath("/etc/passwd")).toBeNull();
    expect(safeRelativePath("C:\\Windows\\system32\\x.js")).toBeNull(); // drive letters stay absolute after \\ → /
    expect(safeRelativePath("file\0.ts")).toBeNull();
    expect(safeRelativePath("")).toBeNull();
  });
});

/** Minimal express-like response capture for direct handler invocation */
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

/** Orchestrator stub that records the directory it was given */
function stubOrchestrator() {
  const calls: Array<{ dirPath: string; listing: string[]; staged?: string }> = [];
  const orchestrator = {
    analyzeDirectory: async (
      analysisId: string,
      dirPath: string,
      _repo: unknown,
    ): Promise<AnalysisResult> => {
      // Capture everything NOW — the route removes the upload dir after the run
      const listing = await fs.readdir(dirPath, { recursive: true });
      const staged = await fs
        .readFile(path.join(dirPath, "src/index.ts"), "utf-8")
        .catch(() => undefined);
      calls.push({ dirPath, listing, staged });
      return {
        id: analysisId,
        repo: { owner: "local", name: "x", branch: "local", cloneUrl: "", analyzedAt: "" },
        files: listing.map((p) => ({ path: p })) as AnalysisResult["files"],
        directories: [],
        summary: {
          totalFiles: listing.length,
          totalDirectories: 0,
          totalLines: 0,
          avgCyclomatic: 0,
          maxCyclomatic: 0,
          languages: {},
          totalVulnerabilities: 0,
          vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
          languagesByLines: {},
        },
        createdAt: new Date().toISOString(),
        status: "complete",
      };
    },
  } as unknown as AnalysisOrchestrator;
  return { orchestrator, calls };
}

describe("handleLocalAnalyze", () => {
  it("rejects empty payloads with 400", async () => {
    const { orchestrator } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({ name: "x", files: [] }),
      makeRes() as never,
      () => orchestrator,
      store,
    );
    await handleLocalAnalyze(makeReq({}), res as never, () => orchestrator, store);
    expect(res.statusCode).toBe(400);
  });

  it("rejects folders exceeding the file cap", async () => {
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
      new Map(),
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain("too large");
  });

  it("drops unsafe paths, stages the rest on disk and returns 202 + job id", async () => {
    const { orchestrator, calls } = stubOrchestrator();
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    const files = [
      { path: "src/index.ts", content: "const a = 1;\n" },
      { path: "../escape.ts", content: "evil" },
      { path: "/absolute.ts", content: "evil" },
      { path: "README.md", content: "docs" }, // unsupported extension → uploaded but pipeline-filtered
    ];
    await handleLocalAnalyze(
      makeReq({ name: "my-project", files }),
      res as never,
      () => orchestrator,
      store,
    );
    expect(res.statusCode).toBe(202);
    const body = res.body as { id: string; statusUrl: string };
    expect(body.statusUrl).toBe(`/api/status/${body.id}`);
    expect(store.get(body.id)?.status).toBe("analyzing");
    // Give the background job a moment to run against the stub
    await new Promise((r) => setTimeout(r, 150));
    expect(calls.length).toBe(1);
    // staged content existed on disk when the pipeline ran (escape/absolute dropped)
    expect(calls[0]!.staged).toBe("const a = 1;\n");
    expect(calls[0]!.listing).toContain("README.md");
    expect(calls[0]!.listing).not.toContain("escape.ts");
    expect(calls[0]!.listing).not.toContain("absolute.ts");
  }, 15000);

  it("stores a completed result and clears progress for a real directory", async () => {
    const logger = pino({ level: "silent" });
    const real = new AnalysisOrchestrator(new SecurityScanner());
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "tiny",
        files: [
          {
            path: "app.js",
            content:
              "function greet(name) {\n  if (name == null) return 'hi';\n  return 'hello ' + name;\n}\n",
          },
        ],
      }),
      res as never,
      () => real,
      store,
    );
    expect(res.statusCode).toBe(202);
    const id = (res.body as { id: string }).id;
    // Wait for the background pipeline (clone-free, fast for one file)
    for (let i = 0; i < 60 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const result = store.get(id);
    expect(result?.status).toBe("complete");
    expect(result?.summary.totalFiles).toBe(1);
    // New contract: the staged copy SURVIVES the run — the test runner
    // reuses it. It is swept later by the TTL (pruneStaleUploadDirs).
    const uploadDir = path.join(os.tmpdir(), "codecity-uploads", id);
    const dirKept = await fs
      .access(uploadDir)
      .then(() => true)
      .catch(() => false);
    expect(dirKept).toBe(true);
  }, 60000);

  /**
   * One scanner for the whole process meant the profile of the analysis that
   * started last also decided the analysis that was still running: the
   * orchestrator held a single scanner and `setConfig` overwrote it mid-flight.
   */
  it("gives each concurrent analysis its own orchestrator and its own config", async () => {
    const given: Array<{ instance: number; profile: string }> = [];
    let built = 0;
    const factory = (config: { profile: string }): AnalysisOrchestrator => {
      const instance = ++built;
      return {
        analyzeDirectory: async (analysisId: string): Promise<AnalysisResult> => {
          given.push({ instance, profile: config.profile });
          return {
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
            createdAt: new Date().toISOString(),
            status: "complete",
          } as AnalysisResult;
        },
      } as unknown as AnalysisOrchestrator;
    };

    const store = new Map<string, AnalysisResult>();
    const req = (profile: string) =>
      makeReq({
        name: profile,
        files: [{ path: "app.js", content: "const a = 1;\n" }],
        config: { profile },
      });
    await Promise.all([
      handleLocalAnalyze(req("quick"), makeRes() as never, factory, store),
      handleLocalAnalyze(req("quality-only"), makeRes() as never, factory, store),
    ]);
    for (let i = 0; i < 40 && given.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(given.map((g) => g.profile).sort()).toEqual(["quality-only", "quick"]);
    expect(new Set(given.map((g) => g.instance)).size).toBe(2);
  });
});
