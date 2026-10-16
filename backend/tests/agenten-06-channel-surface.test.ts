import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult, FileAnalysis } from "../src/models/index.js";
import { buildHandoffLines, handleHandoff, handleVerify } from "../src/server/routes/agent.js";
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
    expect(serverSource).toContain('res.status(404).json({ error: "Analysis not found" })');
    expect(serverSource).toContain('res.status(400).json({ error: "Missing analysis ID" })');
    expect(serverSource).toContain('"application/sarif+json"');

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
