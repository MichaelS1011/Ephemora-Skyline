import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { handleStatus } from "../src/server/routes/status.js";
import { handleTestRun, handleTestStatus } from "../src/server/routes/tests.js";
import {
  handleLocalAnalyze,
  pruneStaleUploadDirs,
  registerUploadDir,
} from "../src/server/routes/local-analyze.js";
import {
  makeSkeleton,
  makeProgressWriter,
  deleteJobProgress,
} from "../src/server/routes/job-progress.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { quietScanner } from "./helpers/scanners.js";
import { getDemoResult } from "../src/server/routes/demo.js";
import type { AnalysisResult, ProgressEvent } from "../src/models/index.js";
import { usePrivateStaging } from "./helpers/privateStaging.js";
/**
 * The orchestrator runs for real; its scanner does not. This file's claim is the
 * stage sequence and what `GET /api/status/:id` reads off it, not what gitleaks or
 * semgrep find in two small files. The `pipelineScanner()` that used to be here
 * forked all four engines plus `npm audit` and cost 21,8 s of the 26 s run at
 * load 43. `quietScanner({ regex: true })` keeps the shipped regex catalogue over
 * the same two files and starts no process; no case here asserts a finding.
 */
// A staging root of this file's own — the TTL prune below fast-forwards the clock,
// and in the shared suite root that reaches into a sibling file's staged folders.
const STAGING = await usePrivateStaging("progress-contract");

const REPO = {
  owner: "local",
  name: "progress",
  branch: "local",
  cloneUrl: "",
  analyzedAt: new Date().toISOString(),
};

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

function callStatus(store: Map<string, AnalysisResult>, id: string) {
  const res = makeRes();
  const req = { params: { id } } as unknown as Request;
  handleStatus(req, res as unknown as Response, store);
  return res;
}

interface StatusBody {
  status: string;
  progress: number;
  stage?: string;
  filesParsed: number;
  totalFiles: number;
  error?: string;
}

const body = (res: ReturnType<typeof makeRes>): StatusBody => res.body as StatusBody;

let workDir = "";

async function writeFixtureDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-progress-"));
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "app.ts"),
    "export function go(x: number) {\n  if (x > 1) { return x - 1; }\n  return x;\n}\n",
    "utf-8",
  );
  await fs.writeFile(path.join(dir, "src", "util.ts"), "export const id = (v: 1) => v;\n", "utf-8");
  return dir;
}

describe("progress contract over HTTP — fed by real orchestrator events", () => {
  afterAll(async () => {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await pruneStaleUploadDirs(Date.now() + 25 * 60 * 60 * 1000);
    await STAGING.release();
  });

  it("the pipeline's own stages reach GET /api/status/:id", async () => {
    workDir = await writeFixtureDir();
    const events: ProgressEvent[] = [];
    const store = new Map<string, AnalysisResult>();
    store.set("job-1", makeSkeleton("job-1", REPO));

    const write = makeProgressWriter("job-1");
    const orchestrator = new AnalysisOrchestrator(quietScanner({ regex: true }));
    const result = await orchestrator.analyzeDirectory("job-1", workDir, REPO, (event) => {
      events.push(event);
      write(event);
    });
    store.set(result.id, result);
    deleteJobProgress("job-1");

    // Every event the pipeline emits is a stage the polling client can show:
    // a numeric step, a non-empty label, and no going backwards.
    expect(events.length).toBeGreaterThan(3);
    expect(events[0]!.stage).toBe("Enumerating files");
    for (const [i, e] of events.entries()) {
      expect(Number.isFinite(e.progress), `event ${i} progress`).toBe(true);
      expect(e.stage.trim().length, `event ${i} stage`).toBeGreaterThan(0);
      if (i > 0) expect(e.progress).toBeGreaterThanOrEqual(events[i - 1]!.progress);
    }
    expect(events.at(-1)).toEqual({ progress: 100, stage: "Analysis complete" });

    // The live map is what a poll reads while the job runs.
    const running = makeRes();
    makeProgressWriter("job-2")({ progress: 30, stage: "Parsing files" });
    store.set("job-2", makeSkeleton("job-2", REPO));
    handleStatus(
      { params: { id: "job-2" } } as unknown as Request,
      running as unknown as Response,
      store,
    );
    expect(body(running).status).toBe("analyzing");
    expect(body(running).progress).toBe(30);
    expect(body(running).stage).toBe("Parsing files");

    // A finished job answers 100 even after its live entry is gone.
    const done = callStatus(store, "job-1");
    expect(body(done).status).toBe("complete");
    expect(body(done).progress).toBe(100);
    expect(body(done).stage).toBe("Complete");
    expect(body(done).filesParsed).toBe(result.summary.totalFiles);
  }, 30_000);

  it("a failed job reports the failure, never a silent 100", async () => {
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    await handleLocalAnalyze(
      {
        body: { name: "broken", files: [{ path: "a.ts", content: "const x = 1;" }] },
      } as unknown as Request,
      res as unknown as Response,
      () =>
        ({
          analyzeDirectory: async (): Promise<AnalysisResult> => {
            throw new Error("pipeline died");
          },
        }) as unknown as AnalysisOrchestrator,
      store,
    );
    const id = (res.body as { id: string }).id;
    for (let i = 0; i < 40 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const status = callStatus(store, id);
    expect(body(status).status).toBe("failed");
    expect(body(status).error).toContain("pipeline died");
    expect(body(status).progress).toBe(0);
  }, 20000);

  it("404s for a job that does not exist and 400s for a missing id", () => {
    const store = new Map<string, AnalysisResult>();
    expect(callStatus(store, "nope").statusCode).toBe(404);
    expect(callStatus(store, "").statusCode).toBe(400);
  });

  /**
   * The demo city used to enter the analysis store through the WebSocket
   * timeout — `GET /api/status/demo-001` then answered a completed analysis
   * that no pipeline ever ran. A demo is not a job.
   */
  it("never serves the demo dataset as a completed analysis job", () => {
    const store = new Map<string, AnalysisResult>();
    store.set("real-1", makeSkeleton("real-1", REPO));
    const demo = getDemoResult();
    expect(callStatus(store, demo.id).statusCode).toBe(404);
    expect(callStatus(store, "demo-001").statusCode).toBe(404);
  });
});

describe("the test-run polling contract (GET /api/tests/run/:runId)", () => {
  it("answers a started run with {status, stage, result, error} and 404s for an unknown run", async () => {
    // The run route's only precondition is a staged copy; the poll reads the run
    // table the run route seeded, so the success form is driven for real.
    registerUploadDir("run-analysis", path.join(STAGING.root, "run-analysis"));
    const started = makeRes();
    await handleTestRun(
      { params: { id: "run-analysis" }, body: {} } as unknown as Request,
      started as unknown as Response,
    );
    expect(started.statusCode).toBe(202);
    const { runId, statusUrl } = started.body as { runId: string; statusUrl: string };
    expect(statusUrl).toBe(`/api/tests/run/${runId}`);

    const poll = makeRes();
    handleTestStatus({ params: { runId } } as unknown as Request, poll as unknown as Response);
    expect(poll.statusCode).toBe(200);
    const body = poll.body as { status: string; stage: string; result?: unknown; error?: unknown };
    expect(Object.keys(body).sort()).toEqual(["error", "result", "stage", "status"]);
    expect(["installing", "running", "complete", "failed"]).toContain(body.status);
    expect(typeof body.stage).toBe("string");

    const missing = makeRes();
    handleTestStatus(
      { params: { runId: "no-such-run" } } as unknown as Request,
      missing as unknown as Response,
    );
    expect(missing.statusCode).toBe(404);
    expect((missing.body as { error: string }).error).toBe("Unknown test run");
  });
});

describe("the demo route contract (GET /api/demo)", () => {
  it("serves the hardcoded demo dataset with no analyzer claims", () => {
    const demo = getDemoResult();
    expect(demo.id).toBe("demo-001");
    expect(demo.status).toBe("complete");
    expect(demo.files.length).toBeGreaterThan(0);
    expect(demo.summary.totalVulnerabilities).toBeGreaterThan(0);
    // A demo must never arrive carrying an analyzer's claims: every finding
    // says provenance "demo" and every engine is declared off.
    for (const f of demo.files) {
      for (const v of f.vulnerabilities) {
        expect(v.provenance).toBe("demo");
      }
    }
    expect(demo.summary.scanProvenance?.regex).toBe(false);
    expect(demo.summary.scanProvenance?.semgrep).toBe(false);
  });
});
