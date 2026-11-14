import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { handleResultChallenge } from "../src/server/routes/challenge.js";
import { registerUploadDir, pruneStaleUploadDirs } from "../src/server/routes/local-analyze.js";
import type { AnalysisResult, SecurityIssue } from "../src/models/index.js";
import type { Request, Response } from "express";
import { usePrivateStaging } from "./helpers/privateStaging.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";

/**
 * The classroom route, judged end-to-end on the responses a browser sees:
 * the scoreboard for a graded exercise, three honest 404/422 shapes instead
 * of a stack trace for everything else, and — the pedagogical load-bearer —
 * a not-found item that leaks no path, no line, no type. The key file is
 * attacker-supplied upload content, so it also has to stay inside the copy.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "uebung");
const KEY_FILE = ".skyline-uebung.json";

const STAGING = await usePrivateStaging("uebung-route");

function issue(type: string, line: number): SecurityIssue {
  return {
    type,
    severity: "P1",
    score: 7,
    line,
    code: "x",
    message: `${type} at ${line}`,
  };
}

/** Scan of the webshop exercise: the SQL injection found, the secret not. */
const GRADED = makeResult([
  makeFile({ path: "src/db.js", vulnerabilities: [issue("SQL_INJECTION", 13)] }),
  makeFile({ path: "src/config.js", vulnerabilities: [] }),
  // The key is scanned like any source file — its own findings must not count.
  makeFile({
    path: KEY_FILE,
    language: "JSON",
    vulnerabilities: [issue("HARDCODED_SECRET", 4)],
  }),
]);

/** Minimal express-like response capture (pattern of source-endpoint.test.ts). */
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

async function callChallenge(store: Map<string, AnalysisResult>, id: string) {
  const res = makeRes();
  const req = { params: { id } } as unknown as Request;
  await handleResultChallenge(req, res as unknown as Response, store);
  return res;
}

async function stagedDirWithKey(keySource: string | null): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ephemora-skyline-uebung-"));
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "db.js"), "const q = 'SELECT ' + name;", "utf-8");
  if (keySource !== null) {
    await fs.copyFile(path.join(FIXTURES, keySource), path.join(dir, KEY_FILE));
  }
  return dir;
}

const store = new Map<string, AnalysisResult>();
const dirs: string[] = [];

async function stage(id: string, result: AnalysisResult, keySource: string | null): Promise<void> {
  store.set(id, result);
  const dir = await stagedDirWithKey(keySource);
  dirs.push(dir);
  registerUploadDir(id, dir);
}

beforeAll(async () => {
  await stage("graded", GRADED, "webshop-key.json");
  await stage("plain-project", makeResult([makeFile({ path: "app.js" })]), null);
  await stage("broken-key", GRADED, "broken-key.txt");
  await stage("future-key", GRADED, "future-schema-key.json");
});

afterAll(async () => {
  for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await pruneStaleUploadDirs(Date.now() + 25 * 60 * 60 * 1000);
  await STAGING.release();
});

describe("GET /api/result/:id/challenge", () => {
  it("grades the scan and answers with the pinned scoreboard shape", async () => {
    const res = await callChallenge(store, "graded");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      exercise: {
        id: "webshop-basics",
        title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
        level: "sek1",
      },
      items: [
        {
          id: "sql-concat",
          points: 10,
          categoryHint: "injection",
          hint: {
            en: "Look closely at how the query string is assembled.",
            de: "Schau genau hin, wie der Query-String zusammengesetzt wird.",
          },
          found: true,
        },
        {
          id: "hardcoded-key",
          points: 5,
          categoryHint: "secrets",
          hint: {
            en: "Where does the API key really come from?",
            de: "Woher kommt der API-Key wirklich?",
          },
          found: false,
        },
      ],
      foundCount: 1,
      totalCount: 2,
      pointsEarned: 10,
      pointsTotal: 15,
      finished: false,
    });
  });

  it("leaks nothing about the unfound item — not even through the key file's own findings", async () => {
    const res = await callChallenge(store, "graded");
    const body = JSON.stringify(res.body);
    // src/config.js:4 / HARDCODED_SECRET exists verbatim in the key AND as a
    // finding on the scanned key file — neither may surface.
    expect(body).not.toContain("config.js");
    expect(body).not.toContain("HARDCODED_SECRET");
  });

  it("answers 404 for an unknown analysis, like every result route", async () => {
    const res = await callChallenge(store, "no-such-id");
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Analysis not found" });
  });

  it("answers a clean 404 for a project without a key file", async () => {
    const res = await callChallenge(store, "plain-project");
    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe("no_exercise_key");
    expect(JSON.stringify(res.body)).not.toContain("Traceback");
  });

  it("answers a clean 404 when the staged copy aged out", async () => {
    // "gone" is in the store but was never registered as a staged upload.
    store.set("gone", GRADED);
    const res = await callChallenge(store, "gone");
    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe("no_exercise_key");
  });

  it("answers 422 with a named code when the key is not valid JSON", async () => {
    const res = await callChallenge(store, "broken-key");
    expect(res.statusCode).toBe(422);
    expect((res.body as { code?: string }).code).toBe("malformed_key");
  });

  it("answers 422 with unsupported_schema for a future key version", async () => {
    const res = await callChallenge(store, "future-key");
    expect(res.statusCode).toBe(422);
    expect((res.body as { code?: string }).code).toBe("unsupported_schema");
  });

  it("refuses a key file that symlinks out of the staged copy", async () => {
    const outside = path.join(STAGING.root, "leaked-key.json");
    await fs.copyFile(path.join(FIXTURES, "webshop-key.json"), outside);
    store.set("symlinked", GRADED);
    const dir = await stagedDirWithKey(null);
    dirs.push(dir);
    await fs.symlink(outside, path.join(dir, KEY_FILE));
    registerUploadDir("symlinked", dir);

    const res = await callChallenge(store, "symlinked");
    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe("no_exercise_key");
  });
});
