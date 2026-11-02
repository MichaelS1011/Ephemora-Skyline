import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AnalysisResult } from "../models/index.js";

/**
 * The completed cities that outlive the backend process.
 *
 * The in-memory store is a cache: 20 records, 24 h, and a restart empties it.
 * Before this archive existed a `?city=` link was therefore a pointer into one
 * running session, and "come back tomorrow" was a promise the product could
 * not keep. One completed result is written per id, owner-only, atomically,
 * and the newest 20 are kept — the same bound the memory uses, so the archive
 * cannot grow into a second product surface nobody asked for.
 *
 * Only a UUID-shaped id is ever turned into a path: the id arrives from a URL,
 * and the archive must not become a way to read or delete a file elsewhere.
 * A demo id ("demo-001") is not a UUID, so the static demo is never written.
 */

export const RUN_ARCHIVE_MAX = 20;

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function runsDir(): string {
  return process.env.EPHEMORA_RUNS_DIR || path.join(os.homedir(), ".ephemora-skyline", "runs");
}

function isCompleteResult(value: unknown, id: string): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<AnalysisResult>;
  return (
    r.id === id &&
    r.status === "complete" &&
    Array.isArray(r.files) &&
    !!r.summary &&
    typeof r.summary.totalFiles === "number"
  );
}

export class RunArchive {
  constructor(readonly directory: string = runsDir()) {}

  private fileFor(id: string): string {
    return path.join(this.directory, `${id}.json`);
  }

  /** Write one completed result; a failure is logged and never fails the scan. */
  save(id: string, result: AnalysisResult): void {
    if (!RUN_ID.test(id) || result.status !== "complete") return;
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      fs.chmodSync(this.directory, 0o700);
      const file = this.fileFor(id);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(result), { mode: 0o600 });
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, file);
      this.prune();
    } catch (error) {
      console.error(`runs: could not write ${this.fileFor(id)}`, error);
    }
  }

  /** The stored result for an id, or nothing — a corrupt file is not a city. */
  load(id: string): AnalysisResult | undefined {
    if (!RUN_ID.test(id)) return undefined;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.fileFor(id), "utf-8"));
      if (isCompleteResult(parsed, id)) return parsed;
      console.error(`runs: ${this.fileFor(id)} is not a completed result — ignoring it`);
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`runs: ${this.fileFor(id)} does not parse — ignoring it`);
      }
      return undefined;
    }
  }

  /** Delete one run on purpose (failure, cancellation, a re-run of the same id). */
  remove(id: string): void {
    if (!RUN_ID.test(id)) return;
    try {
      fs.rmSync(this.fileFor(id), { force: true });
    } catch (error) {
      console.error(`runs: could not remove ${this.fileFor(id)}`, error);
    }
  }

  /** Keep the newest RUN_ARCHIVE_MAX .json files; a crashed tmp file is swept too. */
  prune(): void {
    try {
      if (!fs.existsSync(this.directory)) return;
      const entries = fs.readdirSync(this.directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".tmp")) {
          fs.rmSync(path.join(this.directory, entry.name), { force: true });
        }
      }
      const files = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".json") &&
            RUN_ID.test(entry.name.slice(0, -".json".length)),
        )
        .map((entry) => {
          const file = path.join(this.directory, entry.name);
          return { file, mtime: fs.statSync(file).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      for (const { file } of files.slice(RUN_ARCHIVE_MAX)) {
        fs.rmSync(file, { force: true });
      }
    } catch (error) {
      console.error(`runs: could not prune ${this.directory}`, error);
    }
  }
}
