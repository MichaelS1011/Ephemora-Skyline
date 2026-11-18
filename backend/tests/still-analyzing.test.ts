import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { handleResultCity, handleResultSarif } from "../src/server/routes/result.js";
import { handleResultChallenge } from "../src/server/routes/challenge.js";
import { handleHandoff, handleVerify } from "../src/server/routes/agent.js";
import {
  handleGetVerdicts,
  handlePutVerdicts,
  VerdictStore,
} from "../src/server/routes/verdicts.js";
import type { AnalysisResult } from "../src/models/index.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";

/**
 * While a scan runs, the store already holds its skeleton — `{status:
 * "analyzing"}` with no files. `/api/result/:id` has always folded that into
 * `pending`; the derived views did not. They mapped the skeleton and served
 * it as if it were finished: an empty world, an empty SARIF run, an empty
 * handoff, a verdict save against a scan nobody has seen complete yet. A
 * permalink opened mid-scan rendered a confident zero — for a teacher that
 * reads as "the class found nothing", not as "not done yet".
 *
 * Every derived route now answers the same 409 the status route tells, with
 * a Retry-After, and the answer is asserted on a real socket: an HTTP status
 * asserted off a mock res proves the branch ran, not that a client can read
 * it.
 */

const SCAN_ID = "2f8a6b1c-9d3e-4c21-8a5f-6b0e1d2c3a45";
const PROJECT_KEY = "p-0123456789abcdef";

const analyzing = { id: SCAN_ID, status: "analyzing", files: [] } as unknown as AnalysisResult;
const done = {
  id: SCAN_ID,
  status: "done",
  files: [],
  summary: {},
  repo: { owner: "o", name: "n", branch: "b" },
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as AnalysisResult;

let dir = "";
let server: Server;
let base = "";

beforeAll(async () => {
  // The verdict file is per-process state; the tests write through the PUT
  // route, so point it at a throwaway file instead of the real one in $HOME.
  dir = await mkdtemp(path.join(tmpdir(), "skyline-still-analyzing-"));
  process.env.EPHEMORA_VERDICTS_FILE = path.join(dir, "verdicts.json");

  const store = {
    get: (id: string): AnalysisResult | undefined => (id === SCAN_ID ? analyzing : undefined),
  };
  const app = express();
  app.use(express.json());
  app.get("/api/result/:id/city", (req, res) => handleResultCity(req, res, store));
  app.get("/api/result/:id/sarif", (req, res) => handleResultSarif(req, res, store));
  app.get("/api/result/:id/challenge", (req, res) => {
    void handleResultChallenge(req, res, store);
  });
  app.get("/api/result/:id/handoff", (req, res) => handleHandoff(req, res, store));
  app.get("/api/result/:id/verdicts", (req, res) => {
    void handleGetVerdicts(req, res, { get: (id) => (id === SCAN_ID ? analyzing : undefined) });
  });
  app.put("/api/result/:id/verdicts", (req, res) => {
    void handlePutVerdicts(req, res, { get: (id) => (id === SCAN_ID ? analyzing : undefined) });
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  delete process.env.EPHEMORA_VERDICTS_FILE;
  await rm(dir, { recursive: true, force: true });
});

const still = (body: Record<string, unknown>) =>
  expect(body).toMatchObject({ code: "still_analyzing" });

describe("a scan that is not finished answers 409 instead of an empty truth", () => {
  const routes: Array<{ name: string; method: string; url: string; body?: unknown }> = [
    { name: "city", method: "GET", url: `/api/result/${SCAN_ID}/city` },
    { name: "sarif", method: "GET", url: `/api/result/${SCAN_ID}/sarif` },
    { name: "challenge", method: "GET", url: `/api/result/${SCAN_ID}/challenge` },
    { name: "handoff", method: "GET", url: `/api/result/${SCAN_ID}/handoff` },
    { name: "verdicts read", method: "GET", url: `/api/result/${SCAN_ID}/verdicts` },
    {
      name: "verdicts save",
      method: "PUT",
      url: `/api/result/${SCAN_ID}/verdicts`,
      body: { project: PROJECT_KEY, reviews: {} },
    },
  ];

  for (const route of routes) {
    it(`${route.name} refuses to serve a skeleton as a result`, async () => {
      const res = await fetch(`${base}${route.url}`, {
        method: route.method,
        headers: { "content-type": "application/json" },
        body: route.body === undefined ? undefined : JSON.stringify(route.body),
      });
      expect(res.status, route.name).toBe(409);
      expect(res.headers.get("retry-after"), route.name).toBe("5");
      still((await res.json()) as Record<string, unknown>);
    });
  }

  it("an unknown id still answers 404, not 409 — the two states stay distinct", async () => {
    const res = await fetch(`${base}/api/result/nope-not-here/city`);
    expect(res.status).toBe(404);
  });

  it("a finished scan passes the guard — the 409 never blocks real results", async () => {
    const app = express();
    // The real fixture factory, not a hand-typed object: the mapper reads a
    // complete FileAnalysis, and a skeleton here would test the mapper's
    // error handling instead of the guard's absence.
    const finished = makeResult([makeFile({ path: "a.js" })], { id: SCAN_ID });
    app.get("/api/result/:id/city", (req, res) =>
      handleResultCity(req, res, { get: (id) => (id === SCAN_ID ? finished : undefined) }),
    );
    const verifier = app.listen(0, "127.0.0.1");
    await once(verifier, "listening");
    try {
      const res = await fetch(
        `http://127.0.0.1:${(verifier.address() as AddressInfo).port}/api/result/${SCAN_ID}/city`,
      );
      expect(res.status).toBe(200);
      const city = (await res.json()) as { totalFiles: number };
      expect(city.totalFiles).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        verifier.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

describe("the scan→project binding survives a restart", () => {
  it("a PUT registers the scan, and a fresh store instance still knows it", async () => {
    // A store instance of its own — the singleton would hide whether the
    // mapping truly lives on disk or only in this process's memory. The
    // earlier implementation kept it in a module Map, and a restart forgot
    // every binding while the verdicts themselves were still on disk.
    const fresh = new VerdictStore();
    expect(await fresh.scanProject(SCAN_ID)).toBeUndefined();

    const saved = await fresh.set(PROJECT_KEY, { [`${SCAN_ID}:a`]: "to-fix" });
    expect(saved).toBeTruthy();
    await fresh.registerScan(SCAN_ID, PROJECT_KEY);

    const afterRestart = new VerdictStore();
    expect(await afterRestart.scanProject(SCAN_ID)).toBe(PROJECT_KEY);
  });
});

describe("verify cannot stamp a green report over an empty wish", () => {
  it("an explicit empty fingerprints list answers 400 instead of verifying everything", async () => {
    // An empty list used to fall into the full-diff branch: every finding of
    // the new scan reported "still present" — a false green for the agent.
    const app = express();
    app.use(express.json());
    const doneStore = {
      get: (id: string): AnalysisResult | undefined => (id === SCAN_ID ? done : undefined),
    };
    app.post("/api/verify", (req, res) => {
      void handleVerify(req, res, doneStore);
    });
    const verifier = app.listen(0, "127.0.0.1");
    await once(verifier, "listening");
    try {
      const url = `http://127.0.0.1:${(verifier.address() as AddressInfo).port}/api/verify`;
      const empty = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ before: SCAN_ID, after: SCAN_ID, fingerprints: [] }),
      });
      expect(empty.status).toBe(400);
      expect(((await empty.json()) as { error: string }).error).toMatch(/at least one/i);

      const allNonString = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ before: SCAN_ID, after: SCAN_ID, fingerprints: [1, 2] }),
      });
      expect(allNonString.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => {
        verifier.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
