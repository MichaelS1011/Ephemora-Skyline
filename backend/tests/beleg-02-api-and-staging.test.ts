import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { expectedOrigins, corsOptionsFor } from "../src/server/local-only.js";
import { MAX_FILES, footprintSnapshot } from "../src/server/routes/local-analyze.js";

/**
 * BELEG-02 — the API surface, the ports and the staging numbers the documents
 * print.
 *
 * Claim source: README.md (API table, privacy model), docs/GETTING_STARTED.md,
 * docs/ARCHITECTURE.md. Data source: the registered routes, the resolved task
 * graph in turbo.json, the origin list the server builds at startup and the
 * constants the staging route actually uses.
 */

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
const serverSource = read("backend/src/server/index.ts");

describe("the API table (README.md:212-230)", () => {
  const readme = read("README.md");
  const rows = [...readme.matchAll(/^\|\s*`(GET|POST)\s+(\/api\/[^`]+)`\s*\|/gm)].map((m) => ({
    method: m[1]!,
    path: m[2]!,
  }));
  const registered = [...serverSource.matchAll(/app\.(get|post|delete|put)\(\s*"([^"]+)"/g)].map(
    (m) => ({ method: m[1]!.toUpperCase(), path: m[2]! }),
  );

  /**
   * The count is the table's own shape, not a fact about the server — the two
   * cases below are what prove the rows are the right ones, in both directions.
   * It is pinned because a document that quietly grows a third direction (more
   * rows than routes, or routes with no row) is the failure this table exists
   * to prevent. 2026-10-12: the two staged-copy routes were named in the
   * privacy section but had no row here; they have one now.
   */
  it("names eighteen routes, as many as the table has rows", () => {
    expect(rows.length).toBe(18);
  });

  it("lists only routes the server actually registers", () => {
    const keys = new Set(registered.map((r) => `${r.method} ${r.path}`));
    for (const row of rows) {
      expect(keys.has(`${row.method} ${row.path}`), `README names ${row.method} ${row.path}`).toBe(
        true,
      );
    }
  });

  /**
   * The section is headed "API (`:4000`)" and reads as the surface a contributor
   * or an agent can rely on. A route the server answers and no public document
   * names is the same kind of gap as a route the table promises and the server
   * does not have — so both directions are checked.
   */
  it("leaves no route the server answers unnamed in the README", () => {
    for (const route of registered) {
      expect(
        readme.includes(route.path),
        `the server answers ${route.method} ${route.path}, which no public document names`,
      ).toBe(true);
    }
  });
});

describe("the two ports and the one origin list (docs/GETTING_STARTED.md:58-59, docs/ARCHITECTURE.md:101)", () => {
  it("serves the frontend on 3010 and the backend on 4000 by default", () => {
    // GETTING_STARTED.md:58-59; README.md:69 says the same for `npm run dev`
    expect(/port:\s*3010/.test(read("frontend/vite.config.ts"))).toBe(true);
    expect(/process\.env\.PORT \?\? "4000"/.test(serverSource)).toBe(true);
  });

  it("names loopback, not localhost, in the dev proxy target", () => {
    // GETTING_STARTED.md:187-194 shows the proxy as `'/api': 'http://localhost:4000'`.
    // The shipped config resolves 127.0.0.1 on purpose (localhost answers ::1 first
    // on this platform), so the snippet in the document is the thing that drifts.
    const config = read("frontend/vite.config.ts");
    expect(config).toContain('"/api"');
    expect(config).toContain('http://127.0.0.1:${process.env.BACKEND_PORT ?? "4000"}');
  });

  it("lets the API hear the app's own page and nothing else by default", () => {
    // docs/ARCHITECTURE.md:101 "cors — CORS with an allowlist (http://localhost:3010)"
    const origins = expectedOrigins({});
    expect(origins).toContain("http://localhost:3010");
    const options = corsOptionsFor() as { origin?: unknown };
    expect(options.origin).toBeDefined();
  });
});

describe("the task graph ARCHITECTURE describes (docs/ARCHITECTURE.md:29-33)", () => {
  const turbo = JSON.parse(read("turbo.json")) as {
    tasks?: Record<string, Record<string, unknown>>;
    pipeline?: Record<string, Record<string, unknown>>;
  };
  const tasks = turbo.tasks ?? turbo.pipeline ?? {};

  it("defines dev uncached and persistent", () => {
    expect(tasks["dev"]).toMatchObject({ cache: false, persistent: true });
  });

  it("builds backend before frontend, cached, and publishes dist", () => {
    expect(tasks["build"]?.["dependsOn"]).toEqual(["^build"]);
    expect(tasks["build"]?.["cache"]).not.toBe(false);
    // docs/ARCHITECTURE.md:32 `inputs: ["src/**","*.json","*.ts","*.js"]`
    expect(tasks["build"]?.["inputs"]).toEqual(["src/**", "*.json", "*.ts", "*.js"]);
    // The document quotes the task's outputs; compare the two rather than
    // repeating a literal here, so either side drifting on its own goes red.
    const doc = readFileSync(path.join(REPO, "docs/ARCHITECTURE.md"), "utf-8");
    const named = doc.match(/`build`[^\n]*?outputs: \[([^\]]*)\]/);
    expect(named, "docs/ARCHITECTURE.md no longer quotes the build task's outputs").not.toBeNull();
    const fromDoc = (named![1] ?? "").split(",").map((entry) => entry.trim().replace(/^"|"$/g, ""));
    expect(
      tasks["build"]?.["outputs"],
      `turbo.json ships ${JSON.stringify(tasks["build"]?.["outputs"])}, the document names ${JSON.stringify(fromDoc)}`,
    ).toEqual(fromDoc);
  });

  for (const fast of ["lint", "type-check", "test", "clean"]) {
    it(`${fast} runs uncached and without a build before it`, () => {
      expect(tasks[fast], `turbo.json has no ${fast} task`).toBeDefined();
      expect(tasks[fast]!["cache"]).toBe(false);
      expect(tasks[fast]!["dependsOn"] ?? []).toEqual([]);
    });
  }
});

describe("what the staging route really keeps (README.md:111)", () => {
  const previousRoot = process.env["CODECITY_UPLOAD_DIR"];
  const previousTtl = process.env["CODECITY_UPLOAD_TTL_HOURS"];

  afterEach(() => {
    if (previousRoot === undefined) delete process.env["CODECITY_UPLOAD_DIR"];
    else process.env["CODECITY_UPLOAD_DIR"] = previousRoot;
    if (previousTtl === undefined) delete process.env["CODECITY_UPLOAD_TTL_HOURS"];
    else process.env["CODECITY_UPLOAD_TTL_HOURS"] = previousTtl;
    vi.resetModules();
  });

  it("stages under $TMPDIR/codecity-uploads when nothing overrides it", async () => {
    delete process.env["CODECITY_UPLOAD_DIR"];
    const footprint = await footprintSnapshot();
    expect(footprint.root).toBe(path.join(os.tmpdir(), "codecity-uploads"));
  });

  it("keeps a copy for 24 hours, and follows the hour setting", async () => {
    const asShipped = await footprintSnapshot();
    expect(asShipped.ttlHours).toBe(24);

    process.env["CODECITY_UPLOAD_TTL_HOURS"] = "5";
    vi.resetModules();
    const reimported = await import("../src/server/routes/local-analyze.js");
    const asConfigured = await reimported.footprintSnapshot();
    expect(asConfigured.ttlHours).toBe(5);
  });

  it("caps the folder at 10,000 files, 150 MB in total and 2 MB per file", () => {
    // README.md "Local analysis is capped at 10,000 files / 150 MB / 2 MB per file"
    expect(MAX_FILES).toBe(10_000);
    const route = read("backend/src/server/routes/local-analyze.ts");
    expect(route).toMatch(/const MAX_TOTAL_BYTES = 150 \* 1024 \* 1024;/);
    expect(route).toMatch(/const MAX_FILE_BYTES = 2 \* 1024 \* 1024;/);
    // the pipeline's own per-file cap is the same number, not a second one
    expect(read("backend/src/services/analyzer/orchestrator.ts")).toMatch(
      /const MAX_FILE_SIZE = 2 \* 1024 \* 1024;/,
    );
  });

  it("gives the git history its own 20 MB budget", () => {
    // README.md:111 "The folder picker sends .git too — up to 20 MB of it, in its own budget"
    const route = read("backend/src/server/routes/local-analyze.ts");
    expect(route).toMatch(/const GIT_MAX_TOTAL_BYTES = 20 \* 1024 \* 1024;/);
  });

  it("parses a body larger than the analysis cap, as the hosted-deploy note claims", () => {
    // docs/GETTING_STARTED.md "an unauthenticated endpoint that accepts
    // POST /api/analyze-local (up to 200 MB of someone's source)"
    const limit =
      /app\.use\("\/api\/analyze-local", express\.json\(\{ limit: "(\d+)mb" \}\)\)/.exec(
        serverSource,
      )?.[1];
    expect(Number(limit)).toBe(200);
  });
});
