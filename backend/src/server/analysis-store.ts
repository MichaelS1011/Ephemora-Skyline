import type { AnalysisResult } from "../models/index.js";

/**
 * Bounded in-memory store for analysis results (LRU + TTL).
 *
 * Without bounds, every analysis accumulates in RAM until restart. The TTL is a
 * promise about when a city stops being served, so it is enforced on the way
 * OUT — a `get()` of an entry past its stamp returns nothing and removes it,
 * rather than waiting for the next `set()` to sweep it and re-stamping it while
 * someone reads it. `now` is injectable so a test can fast-forward the clock
 * the same way `pruneStaleUploadDirs` does.
 */
export class AnalysisStore {
  private map = new Map<string, AnalysisResult>();
  private stamps = new Map<string, number>();
  /** Read with a getter, not stored as a copy: the address-lifetime line asks
   *  the running process what its bounds are, so an operator's environment
   *  cannot be contradicted by a number quoted elsewhere. */
  readonly maxEntries: number;
  readonly ttlMs: number;

  constructor() {
    this.maxEntries = parseInt(process.env.ANALYSIS_MAX_ENTRIES || "20", 10);
    this.ttlMs = parseInt(process.env.ANALYSIS_TTL_MS || String(24 * 60 * 60 * 1000), 10);
  }

  get(id: string, now: number = Date.now()): AnalysisResult | undefined {
    const result = this.map.get(id);
    if (!result) return undefined;
    // The TTL wall: an entry past its stamp is gone, not served and not renewed.
    const stamp = this.stamps.get(id);
    if (stamp !== undefined && now - stamp > this.ttlMs) {
      this.delete(id);
      return undefined;
    }
    // LRU touch for the size cap only: re-insert to move to the back of the
    // eviction order. It must not touch the stamp — a read is not a renewal.
    this.map.delete(id);
    this.map.set(id, result);
    return result;
  }

  set(id: string, result: AnalysisResult, now: number = Date.now()): void {
    this.map.delete(id);
    this.stamps.delete(id);
    this.map.set(id, result);
    this.stamps.set(id, now);
    this.evict(now);
  }

  delete(id: string): void {
    this.map.delete(id);
    this.stamps.delete(id);
  }

  private evict(now: number): void {
    for (const [id, stamp] of this.stamps) {
      if (now - stamp > this.ttlMs) {
        this.map.delete(id);
        this.stamps.delete(id);
      }
    }
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.stamps.delete(oldest);
    }
  }
}
