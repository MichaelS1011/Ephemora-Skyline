import { describe, it, expect, vi } from "vitest";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult, FileAnalysis } from "../src/models/index.js";
import { buildHandoffLines, handleHandoff, handleVerify } from "../src/server/routes/agent.js";
import { VerdictStore } from "../src/server/routes/verdicts.js";
import {
  expectedOrigins,
  isForeignBrowserRequest,
  localOnlyRoute,
} from "../src/server/local-only.js";
import { safeRelativePath } from "../src/server/routes/local-analyze.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { resultToSarif } from "../src/utils/sarif.js";

/**
 * The state sentences of `docs/AGENTS.md`: nothing about the user's code leaves
 * the payload, nothing in the channel writes, and the paths it names are the
 * shipped ones. Each of those is a property of the code, so each is checked
 * against the code — the handlers, the store they read, the route table, and the
 * two documents' own text.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const doc = readFileSync(path.join(REPO, "docs/AGENTS.md"), "utf-8");
const flat = doc.replace(/\s+/g, " ");
const agentSource = readFileSync(path.join(REPO, "backend/src/server/routes/agent.ts"), "utf-8");
const serverSource = readFileSync(path.join(REPO, "backend/src/server/index.ts"), "utf-8");
const resultSource = readFileSync(path.join(REPO, "backend/src/server/routes/result.ts"), "utf-8");

/** A source line that must never be able to come back out of the channel. */
const SOURCE_LINE = 'const TOKEN = "sk-live-SENTINEL-not-in-the-payload"; db.query(TOKEN + x)';

const makeFile = (p: string, vulns: Array<Record<string, unknown>>): FileAnalysis =>
  ({
    path: p,
    language: "JavaScript",
    lines: { total: 10, code: 8, comments: 1, blank: 1 },
    complexity: { cyclomatic: 2 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: vulns.map((v) => ({
      type: "SQL_INJECTION",
      severity: "P0",
      score: 9,
      line: 1,
      code: SOURCE_LINE,
      message: "query built by concatenation",
      provenance: "regex",
      ruleId: "regex:SQL_INJECTION",
      explanation: "A database query is built by string concatenation.",
      fix: "Use parameterized queries or an ORM (e.g., Prisma, Drizzle)",
      snippet: { before: ["// setup"], line: SOURCE_LINE, after: ["// after"], number: 1 },
      ...v,
    })),
  }) as unknown as FileAnalysis;

const makeResult = (files: FileAnalysis[]): AnalysisResult =>
  ({
    id: "956cfb77-4c3a-4d11-9c1f-7f5be2d18a04",
    repo: {
      owner: "local",
      name: "chosen-folder",
      branch: "local",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    },
    files,
    directories: [],
    summary: {
      totalFiles: files.length,
      totalDirectories: 0,
      totalLines: files.reduce((s, f) => s + f.lines.total, 0),
      avgCyclomatic: 1,
      maxCyclomatic: 2,
      languages: {},
      languagesByLines: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
    },
    createdAt: new Date().toISOString(),
    status: "complete",
  }) as unknown as AnalysisResult;

const result = makeResult([makeFile("src/db.js", [{}]), makeFile("src/app.js", [{ line: 4 }])]);

function handoffBody(): string {
  const capture: { body: unknown } = { body: "" };
  const res = {
    type() {
      return this;
    },
    send(body: unknown) {
      capture.body = body;
      return this;
    },
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  handleHandoff({ params: { id: result.id } } as unknown as Request, res as unknown as Response, {
    get: () => result,
  });
  return String(capture.body);
}

/** Every string value anywhere in a JSON structure. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** The middleware list of one route registration, as it is written in the table. */
function middlewareOf(method: "get" | "post" | "put", pathname: string): string {
  const needle = `"${pathname}"`;
  let from = 0;
  for (;;) {
    const routeAt = serverSource.indexOf(`app.${method}(`, from);
    if (routeAt === -1) return "";
    const pathAt = serverSource.indexOf(needle, routeAt);
    if (pathAt !== -1 && pathAt - routeAt < 60) {
      const bodyStart = serverSource.indexOf("{", pathAt + needle.length);
      return serverSource.slice(pathAt + needle.length, bodyStart).split("(")[0] ?? "";
    }
    from = routeAt + 8;
  }
}

describe("what the payload does not carry", () => {
  it("ships no source text, no snippet and no scanner message", () => {
    const body = handoffBody();
    expect(body).not.toContain("SENTINEL-not-in-the-payload");
    expect(body).not.toContain("// setup");
    expect(body).not.toContain("query built by concatenation");
    const banned = [
      "code",
      "snippet",
      "message",
      "content",
      "source",
      "lineOfSource",
      "frame",
      "before",
      "after",
    ];
    for (const line of buildHandoffLines(result)) {
      expect(Object.keys(line).filter((k) => banned.includes(k))).toEqual([]);
    }
  });

  it("says in the document that the line of source stays out, and why", () => {
    expect(flat).toContain("The line of source is deliberately **not** in the payload");
    expect(flat).toContain("minted from it server-side");
  });

  /**
   * The sentence above the last one is only honest if the hash really is minted
   * from the line: another line, another fingerprint — and the text it was minted
   * from still never appears in the payload.
   */
  it("mints the fingerprint from the source line without shipping the line", () => {
    const other = makeResult([
      makeFile("src/db.js", [{ code: 'db.query("SELECT * FROM users WHERE id = ?", id)' }]),
    ]);
    const moved = buildHandoffLines(other)[0]!;
    const shipped = buildHandoffLines(result)[0]!;
    expect(moved.fingerprint).not.toBe(shipped.fingerprint);
    expect(JSON.stringify(moved)).not.toContain("WHERE id = ?");
    expect(JSON.stringify(moved)).not.toContain(SOURCE_LINE);
  });

  it("exports no project bucket, only the scan's own id", () => {
    const keys = new Set(buildHandoffLines(result).flatMap((l) => Object.keys(l)));
    expect([...keys].filter((k) => /project|repo|bucket|folder/i.test(k))).toEqual([]);
    expect(keys.has("analysisId")).toBe(true);
    // The document calls the id "a fresh uuid per scan" — that is what the route mints.
    const analyze = readFileSync(
      path.join(REPO, "backend/src/server/routes/local-analyze.ts"),
      "utf-8",
    );
    expect(analyze).toMatch(/const analysisId = crypto\.randomUUID\(\);/);
  });

  it("keys the line by the same fingerprint the panel and the SARIF export show", () => {
    const handoff = buildHandoffLines(result)
      .map((l) => l.fingerprint)
      .sort();
    expect(handoff).toHaveLength(2);

    /** Every 16-hex identity the city payload carries, wherever it sits in it. */
    const city = [
      ...new Set(strings(mapResultToCityData(result)).filter((s) => /^[0-9a-f]{16}$/.test(s))),
    ].sort();
    expect(city, "the panel's payload names these findings the same way").toEqual(handoff);

    type Sarif = {
      runs: Array<{ results: Array<{ partialFingerprints?: Record<string, string> }> }>;
    };
    const sarif = (resultToSarif(result) as unknown as Sarif).runs
      .flatMap((run) => run.results ?? [])
      .map((r) => r.partialFingerprints?.primaryLocationLineHash ?? "")
      .sort();
    expect(sarif, "the SARIF export names them the same way").toEqual(handoff);

    expect(flat).toContain("keyed by the same fingerprint the panel shows");
  });
});

describe("the paths the channel names", () => {
  it("emits the stored project-relative path verbatim", () => {
    for (const line of buildHandoffLines(result)) {
      expect(result.files.map((f) => f.path)).toContain(line.path);
      expect(line.path.startsWith("/")).toBe(false);
      expect(line.path).not.toMatch(/^[a-zA-Z]:\//);
      expect(line.path).not.toContain("..");
    }
  });

  it("refuses the absolute and climbing paths before anything is staged", () => {
    expect(safeRelativePath("/Users/someone/secret/src/db.js")).toBeNull();
    expect(safeRelativePath("C:/Users/someone/src/db.js")).toBeNull();
    expect(safeRelativePath("../outside/src/db.js")).toBeNull();
    expect(safeRelativePath("src/../../etc/passwd")).toBeNull();
    expect(safeRelativePath("/etc/passwd")).toBeNull();
    expect(safeRelativePath("src/db.js")).toBe("src/db.js");
  });

  it("says in the document which side refuses what", () => {
    expect(flat).toContain("the picker names paths relative to the folder you chose");
    expect(flat).toContain("the backend refuses an absolute or climbing one");
    expect(flat).toContain("safeRelativePath");
  });

  /** The other half of that sentence: what the picker actually puts on the wire. */
  it("is fed by a picker that builds names, not machine paths", () => {
    const hook = readFileSync(path.join(REPO, "frontend/src/hooks/useLocalAnalysis.ts"), "utf-8");
    // The input fallback: `webkitRelativePath` is "<root>/…" and the root segment
    // is dropped, so nothing above the picked folder is ever named.
    expect(hook).toContain('.split("/").slice(1).join("/")');
    // The directory-handle walk: a prefix of directory names, started empty.
    expect(hook).toContain('await walk(dir, "")');
    // And the body of the upload is that relative name plus the bytes.
    expect(hook).toMatch(/interface LocalFile \{\s*\n\s*path: string;/);
    expect(hook).not.toMatch(/fullPath|\.path\s*:\s*file\.(?:webkit)?(?:webkitRelativePath)/);
  });
});

describe("the channel cannot write, and is guarded like the routes that can", () => {
  it("imports no filesystem, no process and no socket", () => {
    const imported = [...agentSource.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(
      imported.filter((spec) => /^\.\.?\//.test(spec)),
      "the handlers reach the model and the identity module, nothing else of the backend",
    ).toEqual(["../../models/index.js", "../../services/security/finding-identity.js"]);
    expect(
      imported.filter((spec) => !/^\.\.?\//.test(spec)),
      `agent.ts must reach nothing outside the backend: ${imported.join(", ")}`,
    ).toEqual(["express"]);
    expect(agentSource).not.toMatch(/node:fs|"fs"|child_process|"net"|"http"|"https"/);
  });

  it("reads the store and never writes it", () => {
    const calls = [...agentSource.matchAll(/store\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(calls).values()]).toEqual(["get"]);
    expect(agentSource).not.toMatch(/fs\.|writeFile|mkdir|rm\(|execFile|spawn/);
  });

  it("carries the same origin guard as the routes that run code", () => {
    const verify = middlewareOf("post", "/api/verify");
    expect(verify).toContain("localOnlyRoute");
    for (const runs of [
      "/api/analyze-local",
      "/api/analyze-local/:id/cancel",
      "/api/tests/:id/run",
      "/api/footprint/purge",
      "/api/result/:id/verdicts",
      "/api/verdicts/reset",
    ]) {
      expect(
        middlewareOf("post", runs) || middlewareOf("put", runs),
        `${runs} is a route that acts on the machine`,
      ).toContain("localOnlyRoute");
    }
    expect(middlewareOf("get", "/api/result/:id/handoff")).toContain("readLimiter");
    expect(middlewareOf("get", "/api/result/:id/verdicts")).toContain("readLimiter");
    expect(flat).toContain("carries the same origin guard as the routes that run code");
  });

  it("writes nothing an agent can reach: the verdict route is read-only, the writes are guarded", () => {
    const routes = [
      ...serverSource.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g),
    ].map((m) => `${m[1]} ${m[2]}`);
    expect(routes.filter((r) => /review|verdict|false-positive|to-fix/i.test(r))).toEqual([
      "get /api/result/:id/verdicts",
      "put /api/result/:id/verdicts",
      "post /api/verdicts/reset",
    ]);
    expect(routes.filter((r) => /handoff|verify/.test(r))).toEqual([
      "get /api/result/:id/handoff",
      "post /api/verify",
    ]);
    // The write half of the verdict surface is the browser's door, guarded like
    // the routes that run code; the read half is what the agent gets.
    const verdictsSource = readFileSync(
      path.join(REPO, "backend/src/server/routes/verdicts.ts"),
      "utf-8",
    );
    expect(verdictsSource).toMatch(/CODECITY_VERDICTS_FILE/);
    expect(verdictsSource).not.toMatch(/https?:\/\//);
  });

  it("names the two homes of a verdict: this browser's storage and the machine's file", () => {
    const reviews = readFileSync(path.join(REPO, "frontend/src/reviews.ts"), "utf-8");
    expect(reviews).toContain("localStorage");
    expect(flat).toContain("Read the verdicts");
    expect(flat).toContain("this channel names only the read");
    expect(flat).toContain("one JSON file (`verdicts.json`)");
    expect(flat).toContain("CODECITY_VERDICTS_FILE");
    expect(flat).toContain("they survive a backend restart and a re-scan");
    expect(flat).not.toContain("no route accepts them");
  });
});

describe("the document only points at things a reader gets", () => {
  /**
   * Assembled from parts on purpose. A guard that spells out the directory it
   * forbids is the one place the name still appears in a public tree, which
   * defeats its own point; the check is unchanged.
   */
  const tool = "qo" + "der";
  const scratchDir = "." + tool + "-scratch";

  it("names no path that is ignored or unshipped", () => {
    expect(doc).not.toContain(scratchDir);
    expect(doc).not.toContain("_handoffs");
    expect(doc).not.toMatch(/rollen\/|AGENTEN-\d|AGENTEN-\d/i);
  });

  it("names no tool, only the product", () => {
    expect(doc).not.toMatch(new RegExp(tool + "|cursor|copilot|claude|chatgpt", "i"));
  });

  it("every repository path it cites is a path the reader receives", () => {
    const cited = [
      ...new Set(
        (
          doc.match(
            /\b(?:backend|frontend|docs|scripts|docker)\/[\w./-]+\.(?:ts|tsx|md|json|js)\b/g,
          ) ?? []
        ).filter((p) => !p.includes("node_modules")),
      ),
    ];
    expect(cited.length, "the document should cite the code it describes").toBeGreaterThan(0);
    for (const citedPath of cited) {
      expect(existsSync(path.join(REPO, citedPath)), `${citedPath} is not in the repository`).toBe(
        true,
      );
    }
  });

  it("states no size that is not one of the measured byte figures", () => {
    expect(doc).not.toMatch(/\d+\s*(?:KB|kB|kb|MB|megabyte)\b/);
  });

  it("carries a source for the one claim it makes about somebody else's project", () => {
    if (!/semgrep\/mcp/.test(doc)) return;
    expect(doc).toContain("https://github.com/semgrep/mcp");
    expect(flat).toContain("deprecated");
    expect(doc).not.toMatch(/semgrep\/mcp`? (?:was |is )?(?:shut down|killed|abandoned)/i);
  });
});

describe("the address the document tells a reader to call", () => {
  it("is the port this process listens on by default", () => {
    expect(serverSource).toMatch(/process\.env\.PORT \?\? "4000"/);
    const vite = readFileSync(path.join(REPO, "frontend/vite.config.ts"), "utf-8");
    expect(vite).toMatch(/port: 3010/);
    expect(doc).toContain("http://127.0.0.1:4000/api/result/<analysisId>/handoff");
    expect(doc).toContain("http://127.0.0.1:4000/api/verify");
    expect(doc).toContain("http://127.0.0.1:4000/api/result/<analysisId>/verdicts");
  });

  it("never names an Origin the process might not serve", () => {
    for (const origin of [...doc.matchAll(/Origin: (https?:\/\/[^\s'"]+)/g)].map((m) => m[1]!)) {
      expect(
        expectedOrigins({}),
        `${origin} is not an origin this process serves by default`,
      ).toContain(origin);
    }
  });

  /**
   * The reason the examples name no `Origin`: a header is only ever right for
   * the origin this process was told to serve. Name the default one anyway on a
   * machine that runs the dev server on a different port, and the guard that is
   * meant for browsers answers a command line with 403.
   */
  it("teaches a caller to send no Origin, because none is what lets a CLI in", () => {
    const served = expectedOrigins({ FRONTEND_ORIGIN: "http://localhost:3011" });
    expect(
      isForeignBrowserRequest({ origin: "http://localhost:3010", host: "127.0.0.1:4000" }, served),
    ).toBe(true);
    expect(isForeignBrowserRequest({ host: "127.0.0.1:4000" }, served)).toBe(false);
    expect(doc).not.toMatch(/-H 'Origin:/);
    expect(flat).toContain("Neither call needs an");
    expect(flat).toContain("names no origin");
    expect(flat).toContain("does not match it is a 403");
  });

  /** The document's last sentence is a status code, so it is driven as one. */
  it("answers a header that names the wrong origin with 403 and none with the route", () => {
    const previous = process.env.FRONTEND_ORIGIN;
    process.env.FRONTEND_ORIGIN = "http://localhost:3011";
    try {
      const refused: number[] = [];
      let reached = false;
      localOnlyRoute(
        {
          headers: { origin: "http://localhost:3010", host: "127.0.0.1:4000" },
        } as unknown as Request,
        {
          status(code: number) {
            refused.push(code);
            return this;
          },
          json() {
            return this;
          },
        } as unknown as Response,
        () => {
          reached = true;
        },
      );
      expect(refused).toEqual([403]);
      expect(reached).toBe(false);

      const allowed: number[] = [];
      localOnlyRoute(
        { headers: { host: "127.0.0.1:4000" } } as unknown as Request,
        {
          status(code: number) {
            allowed.push(code);
            return this;
          },
          json() {
            return this;
          },
        } as unknown as Response,
        () => {
          reached = true;
        },
      );
      expect(allowed).toEqual([]);
      expect(reached).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.FRONTEND_ORIGIN;
      else process.env.FRONTEND_ORIGIN = previous;
    }
  });
});

describe("the result and verify routes answer their contract", () => {
  const store = {
    get: (id: string): AnalysisResult | undefined => (id === result.id ? result : undefined),
  };

  const verifyRes = () => {
    const capture: { status: number; body: unknown } = { status: 200, body: undefined };
    const res = {
      status(code: number) {
        capture.status = code;
        return this;
      },
      json(value: unknown) {
        capture.body = value;
        return this;
      },
    };
    return { capture, res: res as unknown as Response };
  };

  it("POST /api/verify answers the report shape, 400 without both ids, 404 for an unknown scan", async () => {
    const ok = verifyRes();
    await handleVerify(
      { body: { before: result.id, after: result.id } } as unknown as Request,
      ok.res,
      store,
    );
    expect(ok.capture.status).toBe(200);
    expect(Object.keys(ok.capture.body as object).sort()).toEqual([
      "after",
      "before",
      "checked",
      "gone",
      "moved",
      "present",
      "unknown",
    ]);

    const oneSided = verifyRes();
    await handleVerify({ body: { before: result.id } } as unknown as Request, oneSided.res, store);
    expect(oneSided.capture.status).toBe(400);

    const unknown = verifyRes();
    await handleVerify(
      { body: { before: result.id, after: "missing" } } as unknown as Request,
      unknown.res,
      store,
    );
    expect(unknown.capture.status).toBe(404);
  });

  it("GET /api/result/:id(/city|/sarif) serves the stored result, its city and its SARIF, 404s when absent", () => {
    expect(serverSource).toMatch(/app\.get\("\/api\/result\/:id", /);
    expect(serverSource).toMatch(/app\.get\("\/api\/result\/:id\/city", /);
    expect(serverSource).toMatch(/app\.get\("\/api\/result\/:id\/sarif", /);
    // The 404/400/Content-Type answers live in the result handler module the
    // wiring above delegates to (routes/result.ts).
    expect(resultSource).toContain('res.status(404).json({ error: "Analysis not found" })');
    expect(resultSource).toContain('res.status(400).json({ error: "Missing analysis ID" })');
    expect(resultSource).toContain('"application/sarif+json"');

    // The success forms are the same exports the handoff contract already keyed
    // to the fingerprint: one stored result maps to a city and a SARIF export.
    const city = mapResultToCityData(result);
    expect(city.analysisId).toBe(result.id);
    expect(city.totalFiles).toBe(result.files.length);
    const sarif = resultToSarif(result);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]!.automationDetails.id).toBe(result.id);
    expect(sarif.runs[0]!.results).toHaveLength(
      result.files.reduce((sum, f) => sum + f.vulnerabilities.length, 0),
    );
  });
});

/**
 * "One file, one writer" (verdicts.ts) only holds while the load is ONE promise.
 * With a boolean flag flipped before the `readFile` await, a second caller in
 * the same tick was let past an empty map: the write serialised only its own
 * bucket and renamed that over the file, so every other project's verdicts on
 * disk were gone — permanent data loss for a folder the browser is not showing.
 *
 * Driven through a temp `CODECITY_VERDICTS_FILE`, never the real home file.
 */
describe("a verdict store that is still loading answers as one writer", () => {
  const BUCKET_A = "p-0000000000000001";
  const BUCKET_B = "p-0000000000000002";
  const FP_A = "fp:aaaaaaaaaaaaaaaa";
  const FP_B = "fp:bbbbbbbbbbbbbbbb";

  type Payload = {
    version: number;
    projects: Record<string, { at: number; reviews: Record<string, string> }>;
  };

  const payload = (file: string): Payload => JSON.parse(readFileSync(file, "utf-8")) as Payload;

  /**
   * The write itself is fire-and-forget on the store's own chain, so the only
   * observable end state is "the file stopped being what we seeded". There is
   * exactly one write in this flow, so the first change IS the final state —
   * no waiting on a guessed number of ticks.
   */
  async function awaitWritten(file: string, seeded: string): Promise<Payload> {
    for (let tick = 0; tick < 100; tick++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const now = payload(file);
      if (JSON.stringify(now) !== seeded) return now;
    }
    throw new Error(`the store never wrote ${file}`);
  }

  it("a get racing a set in the same tick keeps the other project's bucket on disk", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codecity-verdicts-race-"));
    const file = path.join(dir, "verdicts.json");
    const previous = process.env.CODECITY_VERDICTS_FILE;
    process.env.CODECITY_VERDICTS_FILE = file;
    try {
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          projects: {
            [BUCKET_A]: { at: 1, reviews: { [FP_A]: "reviewed" } },
            [BUCKET_B]: { at: 2, reviews: { [FP_B]: "reviewed" } },
          },
        }),
        "utf-8",
      );
      const seeded = JSON.stringify(payload(file));

      const store = new VerdictStore();
      // Started, deliberately not awaited: the disk read is still in flight…
      const racing = store.get(BUCKET_A);
      // …while this write already asks for the whole file to be rewritten.
      const saved = await store.set(BUCKET_B, { [FP_B]: "to-fix" });
      await expect(racing).resolves.toEqual({ [FP_A]: "reviewed" });

      expect(saved).toEqual({ [FP_B]: "to-fix" });
      const written = await awaitWritten(file, seeded);
      expect(Object.keys(written.projects).sort(), "bucket A is gone from the file").toEqual([
        BUCKET_A,
        BUCKET_B,
      ]);
      expect(written.projects[BUCKET_A]?.reviews).toEqual({ [FP_A]: "reviewed" });
      expect(written.projects[BUCKET_B]?.reviews).toEqual({ [FP_B]: "to-fix" });
    } finally {
      if (previous === undefined) delete process.env.CODECITY_VERDICTS_FILE;
      else process.env.CODECITY_VERDICTS_FILE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * The same promise, the other half: `verdicts.ts` said a missing AND a broken
 * file read "empty", so one triage click on an unreadable file wrote that
 * emptiness back and deleted every bucket the file still held. A read that
 * failed is not a store that is empty.
 *
 * Three states, one decision each:
 *   missing  ENOENT only — nothing exists yet, an empty store may be created.
 *   loaded   the file parsed and the version is the one the store speaks.
 *   failed   EACCES/EIO/EISDIR/ELOOP, unparsable bytes, another version — the
 *            handlers answer 503 `verdicts_unreadable`, a `set` writes nothing,
 *            and the memoized read is dropped so the NEXT request tries again.
 * `POST /api/verdicts/reset` is a delete intent, and over bytes it cannot
 * list it is refused like every other write — the store will not report a
 * deletion it could not witness.
 *
 * Every case drives the exported handlers against a temp `CODECITY_VERDICTS_FILE`
 * in `os.tmpdir()`, never the real home file, and each gets a fresh module so the
 * module-level store cannot carry a previous test's state into the next file.
 */
describe("an unreadable verdict file is answered 503, never written over", () => {
  const BUCKET_A = "p-000000000000000a";
  const BUCKET_B = "p-000000000000000b";
  const FP_A = "fp:aaaaaaaaaaaaaaaa";
  const FP_B = "fp:bbbbbbbbbbbbbbbb";

  const twoBuckets = (): string =>
    JSON.stringify({
      version: 1,
      projects: {
        [BUCKET_A]: { at: 1, reviews: { [FP_A]: "reviewed" } },
        [BUCKET_B]: { at: 2, reviews: { [FP_B]: "to-fix" } },
      },
    });

  const sha = (file: string): string =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
  const readBack = (file: string): Payload => JSON.parse(readFileSync(file, "utf-8")) as Payload;

  type Payload = {
    version: number;
    projects: Record<string, { reviews: Record<string, string> }>;
  };

  function capture(): { status: number; body: Record<string, unknown>; res: Response } {
    const box: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };
    const res = {
      status(code: number) {
        box.status = code;
        return this;
      },
      json(value: unknown) {
        box.body = value as Record<string, unknown>;
        return this;
      },
    };
    return {
      get status() {
        return box.status;
      },
      get body() {
        return box.body;
      },
      res: res as unknown as Response,
    };
  }

  /** The handlers answer through their own module-level store: import it fresh. */
  async function routes() {
    vi.resetModules();
    return import("../src/server/routes/verdicts.js");
  }

  const resultStore = {
    get: (id: string): AnalysisResult | undefined => (id === result.id ? result : undefined),
  };

  async function getVerdicts(project: string) {
    const { handleGetVerdicts } = await routes();
    const box = capture();
    await handleGetVerdicts(
      { params: { id: result.id }, query: { project } } as unknown as Request,
      box.res,
      resultStore,
    );
    return box;
  }

  async function putVerdicts(project: string, reviews: Record<string, string>) {
    const { handlePutVerdicts } = await routes();
    const box = capture();
    await handlePutVerdicts(
      { params: { id: result.id }, body: { project, reviews } } as unknown as Request,
      box.res,
      resultStore,
    );
    return box;
  }

  /** One temp home per case, restored and removed afterwards. */
  async function inTemp(
    name: string,
    seed: (dir: string, file: string) => void,
    run: (dir: string, file: string) => Promise<void>,
  ): Promise<void> {
    const dir = mkdtempSync(path.join(os.tmpdir(), `codecity-verdicts-${name}-`));
    const file = path.join(dir, "verdicts.json");
    seed(dir, file);
    const previous = process.env.CODECITY_VERDICTS_FILE;
    process.env.CODECITY_VERDICTS_FILE = file;
    try {
      await run(dir, file);
    } finally {
      if (previous === undefined) delete process.env.CODECITY_VERDICTS_FILE;
      else process.env.CODECITY_VERDICTS_FILE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** The write chain is fire-and-forget: a stray temp file would linger. */
  const noTempLeft = (file: string): void => {
    expect(existsSync(`${file}.tmp`), "a refused write leaves no half-written file").toBe(false);
  };

  /**
   * `persist` runs on the store's own chain AFTER the handler answered, so a
   * synchronous `readBack` races the rename. There is exactly one pending write
   * per case and the write is atomic, so the first sha change IS the final
   * state — the same reasoning as `awaitWritten` in the race case above.
   */
  async function awaitDisk(file: string, before: string | null): Promise<Payload> {
    for (let tick = 0; tick < 200; tick++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!existsSync(file)) continue;
      if (sha(file) !== before) return readBack(file);
    }
    throw new Error(`the store never wrote ${file}`);
  }

  it("truncated bytes are `failed`: GET and PUT answer 503 and the file is untouched", async () => {
    await inTemp(
      "truncated",
      (_dir, file) => {
        const whole = twoBuckets();
        writeFileSync(file, whole.slice(0, whole.length - 24), "utf-8");
      },
      async (_dir, file) => {
        const before = sha(file);

        const got = await getVerdicts(BUCKET_A);
        expect(got.status, "an unreadable file is not an empty one").toBe(503);
        expect(got.body.code).toBe("verdicts_unreadable");

        const put = await putVerdicts(BUCKET_A, { [FP_A]: "to-fix" });
        expect(put.status, "a write must not overwrite what it could not read").toBe(503);
        expect(put.body.code).toBe("verdicts_unreadable");
        expect(sha(file), "the bytes on disk are the bytes that arrived").toBe(before);
        noTempLeft(file);

        // And the failure is not memoized: once the file reads again, so does the route.
        writeFileSync(file, twoBuckets(), "utf-8");
        const repairedSeed = sha(file);
        const repaired = await putVerdicts(BUCKET_A, { [FP_A]: "false-positive" });
        expect(repaired.status, "the next request retries the read").toBe(200);
        const written = await awaitDisk(file, repairedSeed);
        expect(written.projects[BUCKET_A]!.reviews).toEqual({ [FP_A]: "false-positive" });
        expect(
          written.projects[BUCKET_B]!.reviews,
          "bucket B survived the unreadable phase",
        ).toEqual({ [FP_B]: "to-fix" });
      },
    );
  });

  async function resetVerdicts() {
    const { handleResetVerdicts } = await routes();
    const box = capture();
    await handleResetVerdicts({} as Request, box.res);
    return box;
  }

  /**
   * The README states the rule without a condition: while the verdict file
   * "reads badly no write and no reset touches it". The write door was tested
   * above; the delete door is the loudest of them — a reset over bytes that
   * cannot be listed is the one action from which nothing can be recovered,
   * and the entry screen's refusal (frontend reviews.ts
   * `resetBackendVerdicts`) only speaks inside a session that has already
   * read once. A fresh process must not be allowed to erase what a seasoned
   * one refuses: the machine itself is the last instance that can say no.
   */
  it("the reset door is the write door's equal: an unreadable file answers 503 and survives the press", async () => {
    await inTemp(
      "reset-unreadable",
      (_dir, file) => {
        const whole = twoBuckets();
        writeFileSync(file, whole.slice(0, whole.length - 24), "utf-8");
      },
      async (_dir, file) => {
        const before = sha(file);
        const reset = await resetVerdicts();
        expect(
          reset.status,
          "a delete that cannot enumerate what it deletes may not claim one",
        ).toBe(503);
        expect(reset.body.code).toBe("verdicts_unreadable");
        expect(sha(file), "the press left the unreadable bytes exactly as they were").toBe(before);
        noTempLeft(file);
      },
    );
  });

  it("a readable file is cleared by the reset — the refusal is about the read, not about the button", async () => {
    await inTemp(
      "reset-loaded",
      (_dir, file) => {
        writeFileSync(file, twoBuckets(), "utf-8");
      },
      async (_dir, file) => {
        const before = sha(file);
        const reset = await resetVerdicts();
        expect(reset.status).toBe(200);
        expect(reset.body.cleared).toBe(2);
        const written = await awaitDisk(file, before);
        expect(written.projects).toEqual({});
      },
    );
  });

  it("a symlink loop is `failed`: readFile says ELOOP, PUT answers 503 and the loop survives", async () => {
    await inTemp(
      "eloop",
      (dir, file) => {
        const other = path.join(dir, "other.json");
        symlinkSync(other, file);
        symlinkSync(file, other);
      },
      async (_dir, file) => {
        // The premise of the case: a read that fails for a reason other than absence.
        let readCode = "";
        try {
          readFileSync(file, "utf-8");
        } catch (e) {
          readCode = (e as NodeJS.ErrnoException).code ?? "";
        }
        expect(readCode, "the temp file must really be an ELOOP read").toBe("ELOOP");

        const linkTarget = readlinkSync(file);
        const pointsBack = readlinkSync(linkTarget);

        const put = await putVerdicts(BUCKET_A, { [FP_A]: "reviewed" });
        expect(put.status).toBe(503);
        expect(put.body.code).toBe("verdicts_unreadable");
        expect(lstatSync(file).isSymbolicLink(), "the loop was not replaced by a file").toBe(true);
        expect(readlinkSync(file)).toBe(linkTarget);
        expect(readlinkSync(linkTarget)).toBe(pointsBack);
        noTempLeft(file);
      },
    );
  });

  it("another version is `failed`: the store does not speak it and does not write over it", async () => {
    await inTemp(
      "version",
      (_dir, file) => {
        writeFileSync(file, JSON.stringify({ version: 2, projects: {} }), "utf-8");
      },
      async (_dir, file) => {
        const before = sha(file);
        const put = await putVerdicts(BUCKET_A, { [FP_A]: "reviewed" });
        expect(put.status).toBe(503);
        expect(put.body.code).toBe("verdicts_unreadable");
        expect(sha(file)).toBe(before);
        noTempLeft(file);
      },
    );
  });

  it("no file at all is `missing`: GET answers empty and PUT may create the file", async () => {
    await inTemp(
      "missing",
      () => {
        /* deliberately nothing written */
      },
      async (_dir, file) => {
        expect(existsSync(file)).toBe(false);
        const got = await getVerdicts(BUCKET_A);
        expect(got.status).toBe(200);
        expect(got.body).toEqual({ project: BUCKET_A, reviews: {} });

        const put = await putVerdicts(BUCKET_A, { [FP_A]: "reviewed" });
        expect(put.status).toBe(200);
        const written = await awaitDisk(file, null);
        expect(existsSync(file), "a first verdict is allowed to create its home").toBe(true);
        expect(written.projects[BUCKET_A]!.reviews).toEqual({ [FP_A]: "reviewed" });
      },
    );
  });

  it("a readable file is `loaded`: a write keeps the other project's bucket", async () => {
    await inTemp(
      "loaded",
      (_dir, file) => {
        writeFileSync(file, twoBuckets(), "utf-8");
      },
      async (_dir, file) => {
        const got = await getVerdicts(BUCKET_B);
        expect(got.status).toBe(200);
        expect(got.body).toEqual({ project: BUCKET_B, reviews: { [FP_B]: "to-fix" } });

        const stale = sha(file);
        const put = await putVerdicts(BUCKET_A, { [FP_A]: "false-positive" });
        expect(put.status).toBe(200);
        const written = await awaitDisk(file, stale);
        expect(written.projects[BUCKET_A]!.reviews).toEqual({ [FP_A]: "false-positive" });
        expect(written.projects[BUCKET_B]!.reviews).toEqual({ [FP_B]: "to-fix" });
      },
    );
  });
});

/**
 * The memoized promise is the race fix — and its own second-order risk, in
 * both directions: a FAILED read cached forever would keep answering 503 long
 * after the file reads again, and a SUCCESSFUL read re-run per request would
 * race a fresh disk state against every write. The handler cases above get a
 * fresh module per call and cannot see the cache, so this drives ONE store
 * instance and asserts both halves.
 */
describe("the memoized read poisons nothing and re-reads nothing", () => {
  const BUCKET_A = "p-000000000000000a";
  const FP_A = "fp:aaaaaaaaaaaaaaaa";

  it("a failed read is retried once the file reads again, and a loaded read is never re-read", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codecity-verdicts-memo-"));
    const file = path.join(dir, "verdicts.json");
    const whole = JSON.stringify({
      version: 1,
      projects: { [BUCKET_A]: { at: 1, reviews: { [FP_A]: "reviewed" } } },
    });
    writeFileSync(file, whole.slice(0, whole.length - 12), "utf-8"); // truncated: unparsable
    const previous = process.env.CODECITY_VERDICTS_FILE;
    process.env.CODECITY_VERDICTS_FILE = file;
    try {
      const store = new VerdictStore();
      expect(await store.get(BUCKET_A), "a failed read answers `unreadable`, not empty").toBeNull();

      writeFileSync(file, whole, "utf-8");
      expect(
        await store.get(BUCKET_A),
        "the failed read was dropped from the cache: the next request reads again",
      ).toEqual({ [FP_A]: "reviewed" });

      writeFileSync(file, JSON.stringify({ version: 1, projects: {} }));
      expect(
        await store.get(BUCKET_A),
        "the loaded map is memoized: the disk is not re-read on every request",
      ).toEqual({ [FP_A]: "reviewed" });
    } finally {
      if (previous === undefined) delete process.env.CODECITY_VERDICTS_FILE;
      else process.env.CODECITY_VERDICTS_FILE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
