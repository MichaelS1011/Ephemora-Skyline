import { describe, it, expect, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { handleSource } from "../src/server/routes/source.js";
import { registerUploadDir, pruneStaleUploadDirs } from "../src/server/routes/local-analyze.js";
import type { AnalysisResult, FileAnalysis } from "../src/models/index.js";

const TS_CONTENT = "const a = 1;\nconst b = 2;\n";
const PY_CONTENT = 'print("hi")\r\nprint("bye")\n'; // CRLF must be stripped

function makeFile(overrides: Partial<FileAnalysis> & { path: string }): FileAnalysis {
  return {
    language: "TypeScript",
    lines: { total: 2, code: 2, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1, cognitive: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: [],
    ...overrides,
  };
}

function makeResult(files: FileAnalysis[]): AnalysisResult {
  return {
    id: "src-1",
    repo: { owner: "local", name: "x", branch: "local", cloneUrl: "", analyzedAt: "" },
    files,
    directories: [],
    summary: {
      totalFiles: files.length,
      totalDirectories: 0,
      totalLines: 4,
      avgCyclomatic: 1,
      maxCyclomatic: 1,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
    },
    createdAt: new Date().toISOString(),
    status: "complete",
  };
}

/** Minimal express-like response capture (pattern of local-analyze.test.ts) */
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

function callSource(store: Map<string, AnalysisResult>, id: string, fileId: string) {
  const res = makeRes();
  const req = { params: { id, fileId } } as unknown as import("express").Request;
  return handleSource(req, res as unknown as import("express").Response, store).then(() => res);
}

let stagedDir = "";

describe("handleSource", () => {
  const store = new Map<string, AnalysisResult>();
  store.set(
    "src-1",
    makeResult([
      makeFile({ path: "src/index.ts", language: "TypeScript" }),
      makeFile({ path: "app.py", language: "Python" }),
    ]),
  );

  afterAll(async () => {
    if (stagedDir) await fs.rm(stagedDir, { recursive: true, force: true }).catch(() => {});
    // Clear the staged-dir registry (TTL sweeper would prune in 24h anyway)
    await pruneStaleUploadDirs(Date.now() + 25 * 60 * 60 * 1000);
  });

  it("serves staged source lines by cityMapper fileId (f-<index>)", async () => {
    stagedDir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-source-"));
    await fs.mkdir(path.join(stagedDir, "src"), { recursive: true });
    await fs.writeFile(path.join(stagedDir, "src", "index.ts"), TS_CONTENT, "utf-8");
    await fs.writeFile(path.join(stagedDir, "app.py"), PY_CONTENT, "utf-8");
    registerUploadDir("src-1", stagedDir);

    const res = await callSource(store, "src-1", "f-0");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      path: "src/index.ts",
      language: "TypeScript",
      lines: ["const a = 1;", "const b = 2;"], // trailing newline → no empty entry
    });
  });

  it("accepts the relative path as fileId and strips CRLF", async () => {
    const res = await callSource(store, "src-1", "app.py");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      path: "app.py",
      language: "Python",
      lines: ['print("hi")', 'print("bye")'],
    });
  });

  it("404s for an unknown analysis id", async () => {
    const res = await callSource(store, "nope", "f-0");
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("Analysis not found");
  });

  it("404s for an unknown fileId", async () => {
    for (const fileId of ["f-99", "missing.ts", "src/../../etc/passwd"]) {
      const res = await callSource(store, "src-1", fileId);
      expect(res.statusCode).toBe(404);
      expect((res.body as { error: string }).error).toBe("Unknown file");
    }
  });

  it("404s honestly when no staged copy exists", async () => {
    const lonely = new Map<string, AnalysisResult>();
    lonely.set("src-2", makeResult([makeFile({ path: "a.ts" })]));
    const res = await callSource(lonely, "src-2", "f-0");
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toContain("not available");
  });

  it("404s when the staged file has vanished from disk", async () => {
    await fs.rm(path.join(stagedDir, "src", "index.ts"), { force: true });
    const res = await callSource(store, "src-1", "f-0");
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toContain("not available");
  });
});
