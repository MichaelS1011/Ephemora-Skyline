import type { AnalysisResult } from "../models/index.js";
import type { RunArchive } from "./run-archive.js";

/**
 * Bounded in-memory store for analysis results (LRU + TTL).
 *
 * Without bounds, every analysis accumulates in RAM until restart. The TTL is a
 * promise about when a city stops being served, so it is enforced on the way
 * OUT — a `get()` of an entry past its stamp removes it rather than re-stamping
 * it while someone reads it. `now` is injectable so a test can fast-forward the
 * clock the same way `pruneStaleUploadDirs` does.
 *
 * With a `RunArchive`, a completed result is also written to disk and a miss
 * (including a TTL-expired entry) is rehydrated from it. The TTL then bounds
 * the RAM cache, not the product's memory: the archive keeps the newest 20
 * completed runs, so a link survives a restart until newer scans push it out.
 */
/**
 * Parse a positive integer from an environment variable, falling back to a
 * default when the value is missing or not a usable positive integer. Never
 * returns NaN, 0 or a negative — any of which would silently disable or
 * corrupt a store bound (see the constructor).
 */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.warn(
      `analysis-store: ${name}=${JSON.stringify(raw)} is not a positive integer — using ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

export class AnalysisStore {
  private map = new Map<string, AnalysisResult>();
  private stamps = new Map<string, number>();
  /** Read with a getter, not stored as a copy: the address-lifetime line asks
   *  the running process what its bounds are, so an operator's environment
   *  cannot be contradicted by a number quoted elsewhere. */
  readonly maxEntries: number;
  readonly ttlMs: number;

  constructor(private readonly archive?: RunArchive) {
    // A typo in these environment variables must not silently unbind the
    // store: `parseInt("twenty", 10)` is NaN, every `> NaN` comparison is
    // false, and the TTL and size cap then never fire — the two bounds whose
    // whole job is to fire. Same shape for `0` or a negative: the eviction
    // loop would empty the store on every write. An unusable value falls back
    // to the default and says so on the console once.
    this.maxEntries = readPositiveInt("ANALYSIS_MAX_ENTRIES", 20);
    this.ttlMs = readPositiveInt("ANALYSIS_TTL_MS", 24 * 60 * 60 * 1000);
  }

  get(id: string, now: number = Date.now()): AnalysisResult | undefined {
    const result = this.map.get(id);
    if (!result) return this.rehydrate(id, now);
    // The TTL wall: an entry past its stamp leaves RAM, then the archive answers
    // if it still holds the run. The TTL is a cache bound, not a product promise.
    const stamp = this.stamps.get(id);
    if (stamp !== undefined && now - stamp > this.ttlMs) {
      this.forget(id);
      return this.rehydrate(id, now);
    }
    // LRU touch for the size cap only: re-insert to move to the back of the
    // eviction order. It must not touch the stamp — a read is not a renewal.
    this.map.delete(id);
    this.map.set(id, result);
    return result;
  }

  set(id: string, result: AnalysisResult, now: number = Date.now()): void {
    this.insert(id, result, now);
    this.evict(now);
    if (result.status === "complete") this.archive?.save(id, result);
  }

  delete(id: string): void {
    this.forget(id);
    this.archive?.remove(id);
  }

  private rehydrate(id: string, now: number): AnalysisResult | undefined {
    const archived = this.archive?.load(id);
    if (!archived) return undefined;
    this.insert(id, archived, now);
    this.evict(now);
    return archived;
  }

  private insert(id: string, result: AnalysisResult, now: number): void {
    this.map.delete(id);
    this.stamps.delete(id);
    this.map.set(id, result);
    this.stamps.set(id, now);
  }

  /** Drop the RAM copy only; the archive is what outlives a read or a restart. */
  private forget(id: string): void {
    this.map.delete(id);
    this.stamps.delete(id);
  }

  private evict(now: number): void {
    for (const [id, stamp] of this.stamps) {
      if (now - stamp > this.ttlMs) this.forget(id);
    }
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.forget(oldest);
    }
  }
}
