import { describe, it, expect, afterAll, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  MAX_FILES,
  safeRelativePath,
  handleLocalAnalyze,
  footprintSnapshot,
} from "../src/server/routes/local-analyze.js";
import { handleResultCity } from "../src/server/routes/result.js";
import {
  AnalysisOrchestrator,
  SUPPORTED_EXTENSIONS,
} from "../src/services/analyzer/orchestrator.js";
import { AnalysisStore } from "../src/server/analysis-store.js";
import { listPacks } from "../src/services/security/rule-packs.js";
import { quietScanner } from "./helpers/scanners.js";
import type { Request } from "express";
import type { AnalysisResult } from "../src/models/index.js";
import { usePrivateStaging } from "./helpers/privateStaging.js";
// A staging root of this file's own — the TTL prune below fast-forwards the clock,
// and in the shared suite root that reaches into a sibling file's staged folders.
const STAGING = await usePrivateStaging("local-analyze");

/**
 * The one case that runs a real pipeline (`stores a completed result…`) used to
 * build a real `SecurityScanner` for a single `app.js`, and paid for gitleaks,
 * semgrep, ruff, osv-scanner and `npm audit`: measured 30,7 s of test time in a
 * 35,8 s run at load 75, which is where the 90 s budget and the 500 ms poll below
 * came from. The route contract itself — status codes, staging, job ids, one
 * orchestrator per analysis — never depended on an engine answer, so the case now
 * takes `quietScanner({ regex: true })` from `helpers/scanners.ts`: the shipped
 * regex catalogue, no child process. The budget and the poll stay as they are; they
 * are headroom now, not a necessity.
 */

afterAll(() => STAGING.release());

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
  return { body } as unknown as Request;
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

  /**
   * This sentence is the only place a user learns what the folder picker
   * actually collects. It used to be a hand-typed list, so it drifted: shell,
   * SQL, Terraform, PHP, C#, Kotlin and Swift were scanned but never named.
   * The message now quotes the scanner's own list — and this test refuses the
   * moment one of the two stops matching.
   */
  it("names the real extension list when nothing was collected", async () => {
    const { orchestrator } = stubOrchestrator();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "history-only",
        files: [{ path: ".git/HEAD", content: "ref: refs/heads/main\n" }],
      }),
      res as never,
      () => orchestrator,
      new Map<string, AnalysisResult>(),
    );
    expect(res.statusCode).toBe(400);
    const error = (res.body as { error: string }).error;
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(error, `the message must name ${ext}`).toContain(ext.slice(1));
    }
    expect(error).toContain(".env");
  });

  it("rejects folders exceeding the file cap", async () => {
    const { orchestrator } = stubOrchestrator();
    const res = makeRes();
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({
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
    const real = new AnalysisOrchestrator(quietScanner({ regex: true }));
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
    // The wait budget is history, not a measurement any more: with the real
    // engines this poll needed most of 30 s on a loaded machine and timed out in
    // CI while the run was still healthy. The quiet pipeline finishes in a few
    // hundred ms — the 100 rounds are left in place so a loaded box cannot turn a
    // healthy run red, and a completed job leaves the loop on the first check.
    for (let i = 0; i < 100 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const result = store.get(id);
    expect(result?.status).toBe("complete");
    expect(result?.summary.totalFiles).toBe(1);
    // New contract: the staged copy SURVIVES the run — the test runner
    // reuses it. It is swept later by the TTL (pruneStaleUploadDirs).
    const uploadDir = path.join(process.env.EPHEMORA_UPLOAD_DIR!, id);
    const dirKept = await fs
      .access(uploadDir)
      .then(() => true)
      .catch(() => false);
    expect(dirKept).toBe(true);
  }, 90000);

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
      handleLocalAnalyze(req("deep"), makeRes() as never, factory, store),
    ]);
    for (let i = 0; i < 40 && given.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(given.map((g) => g.profile).sort()).toEqual(["deep", "quick"]);
    expect(new Set(given.map((g) => g.instance)).size).toBe(2);
  });

  /**
   * The reader's tool-folder counts reach the city. Measured on a person's own
   * project on 2026-11-01: 35,211 paths on disk, 34,927 of them inside
   * `node_modules`, and the browser posted them in `dropped.toolFolderFiles` —
   * the one key that knows those paths exist, because the server never walks
   * `node_modules` and the reader never uploaded a byte of it. The city answered
   * with nine keys without it, so the card printed "52 files were not read" over
   * a folder of 35,211 and 34,927 paths left no trace.
   *
   * This is the round trip the promise needs: a count the reader names arrives
   * in the stored result AND in `GET /api/result/:id/city`, which is the only
   * surface the card reads. Asserted on both ends, because the record can be
   * right in memory and still be dropped by the projection.
   */
  it("carries the reader's tool-folder counts into the stored result and into the city", async () => {
    const real = new AnalysisOrchestrator(quietScanner({ regex: true }));
    const store = new Map<string, AnalysisResult>();
    const res = makeRes();
    /** The intercepted body of that scan, key for key */
    const clientDropped = {
      pathTooLong: 0,
      unsafePath: 0,
      tooLarge: 0,
      unreadable: 0,
      excluded: 0,
      gitIgnored: 7,
      gitBudget: 0,
      unsupportedFormat: 5,
      preview: 0,
      toolFolderFiles: 34_927,
      toolFolders: 0,
    };
    await handleLocalAnalyze(
      makeReq({
        name: "mimiforge",
        dropped: clientDropped,
        files: [{ path: "src/app.ts", content: "export const app = 1;\n" }],
      }),
      res as never,
      () => real,
      store,
    );
    expect(res.statusCode).toBe(202);
    const id = (res.body as { id: string }).id;
    for (let i = 0; i < 100 && store.get(id)?.status === "analyzing"; i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const result = store.get(id);
    expect(result?.status).toBe("complete");
    expect(result?.summary.totalFiles).toBe(1);
    expect(
      result?.summary.dropped?.toolFolderFiles,
      "34,927 unread paths are not a rounding error",
    ).toBe(34_927);
    expect(result?.summary.dropped?.gitIgnored).toBe(7);
    expect(result?.summary.dropped?.unsupportedFormat).toBe(5);

    // The same scan read the way the card reads it: the city route's payload.
    const cityRes = makeRes();
    handleResultCity({ params: { id }, body: {} } as never, cityRes as never, store);
    const city = cityRes.body as {
      totalFiles: number;
      dropped?: Record<string, number | undefined>;
    };
    expect(city.dropped?.toolFolderFiles).toBe(34_927);
    // The strip's own arithmetic (`ScanSummary`): every counted path that left,
    // folders excluded because they count folders and not files. Before the fix
    // this was 12; the folder on disk holds 34,940 paths either way.
    const unread = Object.entries(city.dropped ?? {}).reduce(
      (sum, [key, n]) => (key === "toolFolders" || !Number.isFinite(n) ? sum : sum + (n as number)),
      0,
    );
    expect(unread).toBe(34_939);
    expect(city.totalFiles + unread).toBe(34_940);
  }, 90_000);

  /**
   * A count the reader cannot state is not a number the city may quote. The
   * tool keys ride the same clamp as the other nine: garbage degrades to
   * nothing rather than to an invented count.
   */
  it("refuses a tool-folder count it cannot read", async () => {
    const { orchestrator } = stubOrchestrator();
    const res = makeRes();
    await handleLocalAnalyze(
      makeReq({
        name: "garbage",
        dropped: { toolFolderFiles: "thirty four thousand", toolFolders: -3 },
        files: [{ path: "src/app.ts", content: "export const app = 1;\n" }],
      }),
      res as never,
      () => orchestrator,
      new Map<string, AnalysisResult>(),
    );
    const dropped = (res.body as { dropped?: Record<string, number | undefined> }).dropped;
    expect(dropped?.toolFolderFiles ?? 0).toBe(0);
    expect(dropped?.toolFolders ?? 0).toBe(0);
  });
});

describe("the footprint route contract (GET /api/footprint)", () => {
  it("serves the snapshot shape the entry screen renders", async () => {
    const snap = await footprintSnapshot();
    expect(Object.keys(snap).sort()).toEqual([
      "approx",
      "bytes",
      "copies",
      "offline",
      "root",
      "stale",
      "ttlHours",
    ]);
    expect(typeof snap.root).toBe("string");
    expect(typeof snap.copies).toBe("number");
    expect(typeof snap.bytes).toBe("number");
    expect(typeof snap.stale).toBe("number");
    expect(typeof snap.ttlHours).toBe("number");
    expect(typeof snap.offline).toBe("boolean");
    expect(typeof snap.approx).toBe("boolean");
  });
});

describe("the rule-packs route contract (GET /api/rule-packs)", () => {
  it("selects by id, never by path: every pack is public without its absolute dir", () => {
    const packs = listPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(path.isAbsolute(pack.dir)).toBe(true); // the route strips this field
      const { dir: _dir, ...publicPack } = pack;
      expect("dir" in publicPack).toBe(false);
      expect(typeof publicPack.id).toBe("string");
      expect(typeof publicPack.license).toBe("string");
      expect(typeof publicPack.ruleCount).toBe("number");
      expect(publicPack.origin === "shipped" || publicPack.origin === "fetched").toBe(true);
    }
  });
});

describe("the store TTL is enforced on read, not renewed by it", () => {
  /** edge-state 4c: an expired city stayed readable because get() never checked
   *  the stamp and re-stamped on every read. The fix checks at the door and a
   *  read no longer renews — `now` is injectable so the clock can be driven. */
  const result = (id: string): AnalysisResult =>
    ({ id, status: "complete" }) as unknown as AnalysisResult;

  const store = (): AnalysisStore => {
    vi.stubEnv("ANALYSIS_TTL_MS", "1000");
    vi.stubEnv("ANALYSIS_MAX_ENTRIES", "20");
    return new AnalysisStore();
  };

  it("serves a result while its stamp is fresh", () => {
    const s = store();
    s.set("a", result("a"), 0);
    expect(s.get("a", 999)).toBeDefined();
    expect(s.get("a", 500)).toBeDefined();
  });

  it("stops serving a result the moment its stamp expires, without a write", () => {
    const s = store();
    s.set("a", result("a"), 0);
    expect(s.get("a", 1001)).toBeUndefined();
    // gone for good — a later read cannot resurrect it
    expect(s.get("a", 2000)).toBeUndefined();
  });

  it("does not renew the stamp on read: a browsed result still expires at set+ttl", () => {
    const s = store();
    s.set("a", result("a"), 0);
    s.get("a", 400); // a read is not a renewal
    s.get("a", 900); // two reads, both before the wall
    expect(s.get("a", 1001)).toBeUndefined();
  });

  it("still evicts past-TTL entries when a new one is written", () => {
    const s = store();
    s.set("old", result("old"), 0);
    s.set("new", result("new"), 2000);
    expect(s.get("old", 2001)).toBeUndefined();
    expect(s.get("new", 2001)).toBeDefined();
  });
});
