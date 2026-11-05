import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AnalysisStore } from "../src/server/analysis-store.js";
import { RunArchive, RUN_ARCHIVE_MAX } from "../src/server/run-archive.js";
import type { AnalysisResult } from "../src/models/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "ephemora-skyline-runs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function result(id: string, status: AnalysisResult["status"] = "complete"): AnalysisResult {
  return {
    id,
    repo: { owner: "local", name: "repo", branch: "local", cloneUrl: "", analyzedAt: "" },
    files: [],
    directories: [],
    summary: {
      totalFiles: 0,
      totalDirectories: 0,
      totalLines: 0,
      avgCyclomatic: 0,
      maxCyclomatic: 0,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
    },
    createdAt: "",
    status,
  };
}

function fileFor(id: string): string {
  return path.join(dir, `${id}.json`);
}

describe("the run archive", () => {
  it("writes a completed run owner-only and reads the same record back", () => {
    const archive = new RunArchive(dir);
    const id = randomUUID();
    archive.save(id, result(id));

    expect((statSync(fileFor(id)).mode & 0o777).toString(8)).toBe("600");
    expect((statSync(dir).mode & 0o777).toString(8)).toBe("700");
    expect(archive.load(id)).toMatchObject({ id, status: "complete" });
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps the newest 20 and drops the oldest", () => {
    const archive = new RunArchive(dir);
    const ids = Array.from({ length: RUN_ARCHIVE_MAX + 1 }, () => randomUUID());
    const base = 1_700_000_000;
    ids.forEach((id, i) => {
      archive.save(id, result(id));
      utimesSync(fileFor(id), base + i, base + i);
    });
    archive.prune();

    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(RUN_ARCHIVE_MAX);
    expect(existsSync(fileFor(ids[0]!))).toBe(false);
    expect(existsSync(fileFor(ids.at(-1)!))).toBe(true);
  });

  it("never writes a non-complete result or an id that is not a uuid", () => {
    const archive = new RunArchive(dir);
    const id = randomUUID();
    archive.save(id, result(id, "analyzing"));
    archive.save("demo-001", result("demo-001"));
    expect(readdirSync(dir)).toEqual([]);
  });

  it("ignores a corrupt file instead of serving it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const archive = new RunArchive(dir);
    const id = randomUUID();
    writeFileSync(fileFor(id), "{not json");
    expect(archive.load(id)).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("refuses an id that would leave the archive folder", () => {
    const archive = new RunArchive(dir);
    expect(archive.load("../escape")).toBeUndefined();
    archive.save("../escape", result("../escape"));
    archive.remove("../escape");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("never reads, writes or removes a file beside the archive folder", () => {
    const archiveDir = path.join(dir, "runs");
    const outside = path.join(dir, "escape.json");
    writeFileSync(outside, "keep");
    const archive = new RunArchive(archiveDir);

    expect(archive.load("../escape")).toBeUndefined();
    archive.save("../escape", result("../escape"));
    archive.remove("../escape");

    expect(readFileSync(outside, "utf-8")).toBe("keep");
    expect(existsSync(path.join(archiveDir, "escape.json"))).toBe(false);
  });

  it("serves a run to a fresh store after a restart", () => {
    const id = randomUUID();
    new AnalysisStore(new RunArchive(dir)).set(id, result(id));

    const restarted = new AnalysisStore(new RunArchive(dir));
    expect(restarted.get(id)).toMatchObject({ id, status: "complete" });
  });

  it("rehydrates after the RAM TTL instead of answering 404", () => {
    vi.stubEnv("ANALYSIS_TTL_MS", "10");
    const id = randomUUID();
    const store = new AnalysisStore(new RunArchive(dir));
    vi.unstubAllEnvs();

    store.set(id, result(id), 0);
    expect(store.get(id, 1000)).toMatchObject({ id, status: "complete" });
    expect(existsSync(fileFor(id))).toBe(true);
  });

  it("removes the file only on an explicit delete, not on a TTL read", () => {
    vi.stubEnv("ANALYSIS_TTL_MS", "10");
    const id = randomUUID();
    const store = new AnalysisStore(new RunArchive(dir));
    vi.unstubAllEnvs();

    store.set(id, result(id), 0);
    store.get(id, 1000);
    expect(existsSync(fileFor(id))).toBe(true);
    store.delete(id);
    expect(existsSync(fileFor(id))).toBe(false);
  });
});
