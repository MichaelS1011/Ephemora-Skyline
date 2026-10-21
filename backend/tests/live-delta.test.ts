/**
 * Live deltas: a change set becomes a new state without a full rescan.
 *
 * What these tests hold:
 * — a path that left the manifest leaves the city, findings included;
 * — an unchanged path is reused by hash, not re-analyzed;
 * — content that does not match its declared hash is refused, because a
 *   manifest that can lie about identity makes every count downstream a guess;
 * — project-wide engines are named as stale and are not executed by the delta.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import {
  liveStaleEngines,
  mergeLiveFiles,
  summarizeLive,
} from "../src/services/analyzer/live-delta.js";
import type { FileAnalysis, AnalysisResult } from "../src/models/index.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import { handleLiveDelta } from "../src/server/routes/live-analyze.js";
import { registerUploadDir } from "../src/server/routes/local-analyze.js";
import { registerLiveManifest, resetLiveSessions, sha256Hex } from "../src/server/live-sessions.js";

const CONFIG = resolveConfig().config;
const ID = "11111111-2222-4333-8444-555555555555";

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

function makeReq(body: unknown) {
  return { body, params: { id: ID } } as unknown as Request;
}

const orchestrator = (): AnalysisOrchestrator =>
  new AnalysisOrchestrator(new SecurityScanner([new RegexAdapter()], CONFIG));

function summaryOf(files: FileAnalysis[]): AnalysisResult["summary"] {
  const summary = summarizeLive(
    {
      totalFiles: 0,
      totalDirectories: 0,
      totalLines: 0,
      avgCyclomatic: 0,
      maxCyclomatic: 0,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
      scanProvenance: {
        regex: true,
        gitleaks: true,
        semgrep: true,
        dependencies: true,
        dependencyRunner: "npm-audit",
        churn: true,
        duplicates: false,
      },
    },
    files,
    {
      at: "2026-10-20T10:00:00.000Z",
      fullScanAt: "2026-10-20T09:00:00.000Z",
      changed: 0,
      added: 0,
      removed: 0,
      refreshed: 0,
      stale: [],
    },
  );
  // The fixture is a completed FULL scan; only a delta adds `live`.
  if (summary.scanProvenance) delete summary.scanProvenance.live;
  return summary;
}

describe("live delta arithmetic", () => {
  it("removes deleted paths, reuses unchanged ones and replaces refreshed ones", () => {
    const base: FileAnalysis[] = [
      {
        path: "a.ts",
        language: "TypeScript",
        lines: { total: 1, code: 1, comments: 0, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      },
      {
        path: "b.ts",
        language: "TypeScript",
        lines: { total: 1, code: 1, comments: 0, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      },
      {
        path: "gone.ts",
        language: "TypeScript",
        lines: { total: 1, code: 1, comments: 0, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      },
    ];
    const fresh: FileAnalysis = { ...base[1]!, bytes: 42 };
    const added: FileAnalysis = { ...base[0]!, path: "new.ts" };
    const merged = mergeLiveFiles(
      base,
      [
        { path: "a.ts", sha: "a".repeat(64) },
        { path: "b.ts", sha: "b".repeat(64) },
        { path: "new.ts", sha: "c".repeat(64) },
      ],
      new Map([
        ["b.ts", fresh],
        ["new.ts", added],
      ]),
    );
    expect(merged.map((f) => f.path)).toEqual(["a.ts", "b.ts", "new.ts"]);
    expect(merged[0]).toBe(base[0]); // unchanged analysis is reused by reference
    expect(merged[1]).toMatchObject({ liveRefreshed: true, bytes: 42 });
    expect(merged[2]).toMatchObject({ path: "new.ts", liveRefreshed: true });
  });

  it("re-derives every number and keeps the full scan's engine flags", () => {
    const files: FileAnalysis[] = [
      {
        path: "a.ts",
        language: "TypeScript",
        lines: { total: 10, code: 8, comments: 1, blank: 1 },
        complexity: { cyclomatic: 4 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [
          {
            type: "EVAL_USAGE",
            severity: "P0",
            score: 10,
            line: 1,
            code: "eval()",
            message: "eval",
          },
        ],
      },
      {
        path: "b.py",
        language: "Python",
        lines: { total: 5, code: 4, comments: 0, blank: 1 },
        complexity: { cyclomatic: 2 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      },
    ];
    const summary = summarizeLive(summaryOf(files), files, {
      at: "2026-10-20T10:00:00.000Z",
      fullScanAt: "2026-10-20T09:00:00.000Z",
      changed: 1,
      added: 0,
      removed: 1,
      refreshed: 1,
      stale: ["semgrep"],
    });
    expect(summary).toMatchObject({
      totalFiles: 2,
      totalLines: 15,
      totalVulnerabilities: 1,
      vulnerabilitiesBySeverity: { P0: 1, P1: 0, P2: 0 },
      avgCyclomatic: 3,
      maxCyclomatic: 4,
      languages: { TypeScript: 8, Python: 4 },
      scanProvenance: { semgrep: true, live: { stale: ["semgrep"] } },
    });
  });

  it("names only engines that actually contributed as stale", () => {
    expect(
      liveStaleEngines({
        regex: true,
        gitleaks: true,
        semgrep: true,
        dependencies: true,
        dependencyRunner: "npm-audit",
        osv: true,
        ruff: false,
        churn: true,
        duplicates: false,
        coverage: true,
      }),
    ).toEqual(["gitleaks", "semgrep", "npm audit", "osv-scanner", "git churn", "coverage"]);
    expect(liveStaleEngines({ regex: true, gitleaks: false, semgrep: false })).toEqual([]);
  });
});

describe("POST /api/analyze-local/:id/live", () => {
  let dir: string;
  let store: Map<string, AnalysisResult>;
  let factoryCalls: number;

  beforeEach(async () => {
    resetLiveSessions();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "skyline-live-"));
    await fs.mkdir(path.join(dir, "src"), { mode: 0o700 });
    await fs.writeFile(path.join(dir, "src", "same.ts"), "const a = 1;\n");
    await fs.writeFile(path.join(dir, "src", "changed.ts"), "const b = 2;\n");
    await fs.writeFile(path.join(dir, "src", "gone.ts"), "const c = 3;\n");

    const engine = orchestrator();
    const files = [
      await engine.analyzeContent("src/same.ts", "const a = 1;\n"),
      await engine.analyzeContent("src/changed.ts", "const b = 2;\n"),
      await engine.analyzeContent("src/gone.ts", "const c = 3;\n"),
    ];
    const result: AnalysisResult = {
      id: ID,
      repo: {
        owner: "local",
        name: "demo",
        branch: "local",
        cloneUrl: "",
        analyzedAt: "2026-10-20T09:00:00.000Z",
      },
      files,
      directories: [],
      summary: summaryOf(files),
      createdAt: "2026-10-20T09:00:00.000Z",
      status: "complete",
    };
    store = new Map([[ID, result]]);
    registerUploadDir(ID, dir);
    expect(await registerLiveManifest(ID, dir, files, CONFIG)).toBe(true);
    factoryCalls = 0;
  });

  afterEach(async () => {
    resetLiveSessions();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const factory = (config: typeof CONFIG): AnalysisOrchestrator => {
    factoryCalls += 1;
    return new AnalysisOrchestrator(new SecurityScanner([new RegexAdapter()], config));
  };

  it("merges changed, added and deleted files and marks the engines stale", async () => {
    const unchanged = "const a = 1;\n";
    const changed = 'const value = eval("2 + 2");\n';
    const added = "export const fresh = true;\n";
    const res = makeRes();
    await handleLiveDelta(
      makeReq({
        manifest: [
          { path: "src/same.ts", sha: sha256Hex(unchanged) },
          { path: "src/changed.ts", sha: sha256Hex(changed) },
          { path: "src/fresh.ts", sha: sha256Hex(added) },
        ],
        files: [
          { path: "src/changed.ts", content: changed },
          { path: "src/fresh.ts", content: added },
        ],
        dropped: { preview: 0, unreadable: 1 },
      }),
      res as unknown as Response,
      factory,
      {
        set: (id, result) => store.set(id, result),
        get: (id) => store.get(id),
        delete: (id) => store.delete(id),
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      changed: 1,
      added: 1,
      removed: 1,
      refreshed: 2,
      totalFiles: 3,
    });
    const result = store.get(ID) as AnalysisResult;
    expect(result.files.map((f) => f.path)).toEqual([
      "src/same.ts",
      "src/changed.ts",
      "src/fresh.ts",
    ]);
    expect(result.files[0]!.liveRefreshed).toBeUndefined();
    expect(result.files[1]!.liveRefreshed).toBe(true);
    expect(result.files[1]!.vulnerabilities.some((v) => v.type === "EVAL_USAGE")).toBe(true);
    expect(result.summary.totalVulnerabilities).toBe(1);
    expect(result.summary.dropped?.unreadable).toBe(1);
    expect(result.summary.scanProvenance?.live).toMatchObject({
      changed: 1,
      added: 1,
      removed: 1,
      refreshed: 2,
      fullScanAt: "2026-10-20T09:00:00.000Z",
    });
    expect(result.summary.scanProvenance?.live?.stale).toContain("semgrep");
    expect(result.summary.scanProvenance?.semgrep).toBe(true);
    expect(factoryCalls).toBe(1);
    // The staged copy follows the change set: new bytes in, deleted bytes out.
    expect(await fs.readFile(path.join(dir, "src", "changed.ts"), "utf-8")).toBe(changed);
    expect(await fs.readFile(path.join(dir, "src", "fresh.ts"), "utf-8")).toBe(added);
    await expect(fs.stat(path.join(dir, "src", "gone.ts"))).rejects.toThrow();
  });

  it("refuses content that does not match its declared hash", async () => {
    const res = makeRes();
    await handleLiveDelta(
      makeReq({
        manifest: [{ path: "src/changed.ts", sha: sha256Hex("declared but not sent") }],
        files: [{ path: "src/changed.ts", content: "something else" }],
      }),
      res as unknown as Response,
      factory,
      {
        set: (id, result) => store.set(id, result),
        get: (id) => store.get(id),
        delete: (id) => store.delete(id),
      },
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "sha_mismatch" });
    expect(store.get(ID)?.summary.scanProvenance?.live).toBeUndefined();
  });

  it("refuses a changed manifest path that arrives without content", async () => {
    const res = makeRes();
    await handleLiveDelta(
      makeReq({
        manifest: [
          { path: "src/same.ts", sha: sha256Hex("const a = 1;\n") },
          { path: "src/changed.ts", sha: sha256Hex("changed but not sent") },
        ],
        files: [],
      }),
      res as unknown as Response,
      factory,
      {
        set: (id, result) => store.set(id, result),
        get: (id) => store.get(id),
        delete: (id) => store.delete(id),
      },
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "missing_content", path: "src/changed.ts" });
  });

  it("ignores a manifest path this analysis never held and returns the effective set", async () => {
    const same = "const a = 1;\n";
    const res = makeRes();
    await handleLiveDelta(
      makeReq({
        manifest: [
          { path: "src/same.ts", sha: sha256Hex(same) },
          { path: "src/changed.ts", sha: sha256Hex("const b = 2;\n") },
          { path: "src/gone.ts", sha: sha256Hex("const c = 3;\n") },
          // The client reader carries files the scan's language scope never
          // admitted; they are not new findings, they are not an error.
          { path: "src/outside.ts", sha: sha256Hex("const outside = true;\n") },
          // A tool-output path is not analyzed at all; it is ignored, not fatal.
          { path: "playwright-report/report.js", sha: sha256Hex("console.log(1);\n") },
        ],
        files: [],
      }),
      res as unknown as Response,
      factory,
      {
        set: (id, result) => store.set(id, result),
        get: (id) => store.get(id),
        delete: (id) => store.delete(id),
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ changed: 0, added: 0, removed: 0, refreshed: 0 });
    expect((res.body as { paths: string[] }).paths).not.toContain("src/outside.ts");
    expect(store.get(ID)?.summary.scanProvenance?.live).toBeUndefined();
  });

  it("is unavailable for an analysis that never registered a manifest", async () => {
    resetLiveSessions();
    const res = makeRes();
    await handleLiveDelta(
      makeReq({ manifest: [{ path: "src/same.ts", sha: sha256Hex("const a = 1;\n") }], files: [] }),
      res as unknown as Response,
      factory,
      {
        set: (id, result) => store.set(id, result),
        get: (id) => store.get(id),
        delete: (id) => store.delete(id),
      },
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "no_live_session" });
  });
});
