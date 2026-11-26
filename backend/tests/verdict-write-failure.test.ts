import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { AnalysisResult } from "../src/models/index.js";

/**
 * A readable verdict file can still become unwritable between the read and the
 * atomic rename. The API must not answer a saved count when that rename failed,
 * and its memoized RAM copy must not outlive the bytes that actually survived.
 */
describe("a failed verdict write is not reported as saved", () => {
  const SCAN_ID = "11111111-1111-4111-8111-111111111111";
  const PROJECT = "p-000000000000000a";
  const OLD_FP = "fp:aaaaaaaaaaaaaaaa";
  const NEW_FP = "fp:bbbbbbbbbbbbbbbb";
  const seed = JSON.stringify({
    version: 1,
    projects: { [PROJECT]: { at: 1, reviews: { [OLD_FP]: "reviewed" } } },
    scans: {},
  });
  const resultStore = {
    get: (id: string): AnalysisResult | undefined =>
      id === SCAN_ID ? ({ id: SCAN_ID, status: "complete" } as AnalysisResult) : undefined,
  };

  let dir: string | undefined;
  let server: http.Server | undefined;
  let previousFile: string | undefined;

  afterEach(async () => {
    if (server?.listening) {
      const activeServer = server;
      activeServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        activeServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
    server = undefined;
    if (previousFile === undefined) delete process.env.EPHEMORA_VERDICTS_FILE;
    else process.env.EPHEMORA_VERDICTS_FILE = previousFile;
    previousFile = undefined;
    vi.resetModules();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function startApi(): Promise<{ base: string; file: string; route: string }> {
    dir = mkdtempSync(path.join(os.tmpdir(), "ephemora-skyline-verdict-write-failure-"));
    const file = path.join(dir, "verdicts.json");
    writeFileSync(file, seed, { mode: 0o600 });
    previousFile = process.env.EPHEMORA_VERDICTS_FILE;
    process.env.EPHEMORA_VERDICTS_FILE = file;
    vi.resetModules();

    const { handleGetVerdicts, handlePutVerdicts, handleResetVerdicts } =
      await import("../src/server/routes/verdicts.js");
    const app = express();
    app.use(express.json());
    app.get(
      "/api/result/:id/verdicts",
      (req, res) => void handleGetVerdicts(req, res, resultStore),
    );
    app.put(
      "/api/result/:id/verdicts",
      (req, res) => void handlePutVerdicts(req, res, resultStore),
    );
    app.post("/api/verdicts/reset", (_req, res) => void handleResetVerdicts(_req, res));
    server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, file, route: `${base}/api/result/${SCAN_ID}/verdicts?project=${PROJECT}` };
  }

  function blockRename(file: string): string {
    // The store has read the file. Replacing its path with a non-empty directory
    // leaves that memoized read usable but makes the atomic rename impossible.
    rmSync(file);
    mkdirSync(file);
    const marker = path.join(file, "keep.txt");
    writeFileSync(marker, "not a verdict file");
    return marker;
  }

  it("answers 503, preserves the old file, and reloads the old verdict after repair", async () => {
    const { base, file, route } = await startApi();
    const loaded = await fetch(route);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual({ project: PROJECT, reviews: { [OLD_FP]: "reviewed" } });

    const marker = blockRename(file);
    const attempted = await fetch(`${base}/api/result/${SCAN_ID}/verdicts`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: PROJECT, reviews: { [NEW_FP]: "to-fix" } }),
    });
    expect(attempted.status, "a failed rename must not answer a saved count").toBe(503);
    expect(await attempted.json()).toMatchObject({ code: "verdicts_write_failed" });
    expect(readFileSync(marker, "utf8")).toBe("not a verdict file");
    expect(existsSync(`${file}.tmp`), "a failed write must remove its temporary file").toBe(false);

    // Repair the path. A fresh read must expose the durable old verdict, not the
    // failed write that only reached the store's memoized maps.
    rmSync(file, { recursive: true, force: true });
    writeFileSync(file, seed, { mode: 0o600 });
    const repaired = await fetch(route);
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toEqual({ project: PROJECT, reviews: { [OLD_FP]: "reviewed" } });
  });

  it("does not report a reset as cleared when its write failed", async () => {
    const { base, file, route } = await startApi();
    const loaded = await fetch(route);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual({ project: PROJECT, reviews: { [OLD_FP]: "reviewed" } });

    const marker = blockRename(file);
    const attempted = await fetch(`${base}/api/verdicts/reset`, { method: "POST" });
    expect(attempted.status, "a failed reset must not report a cleared count").toBe(503);
    expect(await attempted.json()).toMatchObject({ code: "verdicts_write_failed" });
    expect(readFileSync(marker, "utf8")).toBe("not a verdict file");
    expect(existsSync(`${file}.tmp`), "a failed reset must remove its temporary file").toBe(false);

    rmSync(file, { recursive: true, force: true });
    writeFileSync(file, seed, { mode: 0o600 });
    const repaired = await fetch(route);
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toEqual({ project: PROJECT, reviews: { [OLD_FP]: "reviewed" } });
  });
});
