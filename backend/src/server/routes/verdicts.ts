/**
 * verdicts — the machine-local home of the human's triage decisions.
 *
 * The browser writes them through (`PUT /api/result/:id/verdicts`, guarded like
 * every route that acts on the machine); a re-scan and a coding agent read them
 * back (`GET /api/result/:id/verdicts`, read-only). The store is ONE JSON file
 * on this machine, keyed by the project bucket the frontend derives
 * (`projectKey` in `frontend/src/reviews.ts`) — the key is derived in exactly
 * one place, the backend stores it opaquely. That is what makes a verdict
 * outlive the backend process AND the scan that produced it, and what makes a
 * different folder answer a different bucket. Nothing here leaves the machine.
 *
 * Bounds, because local persistence without a limit is the failure the working
 * backwards round named: at most MAX_PROJECTS buckets in the file (the oldest
 * goes first), at most MAX_ENTRIES verdicts per bucket, and every write is
 * validated (key shape, status whitelist) before it touches the disk.
 */

import type { Request, Response } from "express";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { guardStillAnalyzing } from "./still-analyzing.js";

/** The three verdicts the panel can set — the same words reviews.ts validates. */
const REVIEW_STATUSES = new Set(["reviewed", "false-positive", "to-fix"]);

/** The bucket id the frontend mints: `p-` plus 16 hex characters. */
const PROJECT_KEY = /^p-[0-9a-f]{16}$/;
/** Scan ids are `crypto.randomUUID()` — the shape a registration is keyed by. */
const SCAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A verdict key: the finding's fingerprint, or the positional fallback. */
const REVIEW_KEY = /^(fp:[0-9a-f]{8,64}|f-[0-9a-f]{12}#\d{1,6})$/;

const MAX_PROJECTS = 50;
const MAX_ENTRIES = 500;

export type VerdictStatus = "reviewed" | "false-positive" | "to-fix";
export type VerdictMap = Record<string, VerdictStatus>;

/** Where the verdicts live. Env-overridable so tests and drives own their copy. */
export function verdictsFile(): string {
  const configured = process.env.EPHEMORA_VERDICTS_FILE?.trim();
  return configured || path.join(os.homedir(), ".ephemora-skyline", "verdicts.json");
}

interface VerdictBucket {
  at: number;
  reviews: VerdictMap;
}

/** Drop what is not a verdict, cap what is — the disk never sees garbage. */
export function sanitizeReviews(raw: unknown): VerdictMap {
  const clean: VerdictMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([k, v]) => typeof v === "string" && REVIEW_STATUSES.has(v) && REVIEW_KEY.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_ENTRIES);
  for (const [k, v] of entries) clean[k] = v as VerdictStatus;
  return clean;
}

/**
 * One file, one writer. Reads happen on first use; writes are serialized and
 * atomic (temp file + rename), so a killed process leaves either the old or the
 * new state, never a torn one. A missing file reads as empty — a first verdict
 * may create its home. A file that cannot be read or parsed is NOT empty: the
 * handlers answer 503 and `set` refuses to write, because serving an empty map
 * for an unreadable store would tell a human "nothing was ever found" and the
 * next click would delete every bucket the file still holds. The failed read is
 * dropped from the cache, so the next request tries the disk again.
 */
export class VerdictStore {
  private projects = new Map<string, VerdictBucket>();
  /**
   * Which project bucket each scan's verdicts live in, keyed by scan id. This
   * lives in the file next to the buckets themselves — not in RAM: the agent
   * channel asks by scan id after a restart, when the browser that registered
   * the mapping is long gone. An old file without this key simply has no
   * registrations; that is an empty answer, not an unreadable store.
   */
  private scans = new Map<string, string>();
  /**
   * The load as ONE memoized promise, never a flag flipped before the await:
   * an early flag lets the next caller in the same tick past an empty map, and
   * a `set()` then serialises that half-initialised store as the whole file —
   * every other project's bucket deleted on disk. A reader that arrives while
   * the read is still in flight awaits the same read instead. The promise
   * resolves `true` when the disk state is safe to serve and write over,
   * `false` when the read failed — and a `false` is dropped from the cache,
   * so the NEXT request reads again instead of inheriting the failure.
   */
  private load: Promise<boolean> | null = null;
  private chain: Promise<void> = Promise.resolve();

  private ensureLoaded(): Promise<boolean> {
    this.load ??= this.readFromDisk().then((ok) => {
      if (!ok) this.load = null;
      return ok;
    });
    return this.load;
  }

  /** `false` = unreadable bytes or a version this store does not speak. */
  private async readFromDisk(): Promise<boolean> {
    const file = verdictsFile();
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return true;
      console.error(
        `verdicts: ${file} is unreadable — refusing to serve or write until it reads again`,
        e,
      );
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; projects?: unknown };
      if (parsed?.version !== 1 || !parsed.projects || typeof parsed.projects !== "object") {
        console.error(
          `verdicts: ${file} is not a shape this store speaks — refusing to serve or write over it`,
        );
        return false;
      }
      for (const [k, v] of Object.entries(parsed.projects as Record<string, unknown>)) {
        if (!PROJECT_KEY.test(k)) continue;
        const bucket = v as { at?: unknown; reviews?: unknown } | null;
        const at = typeof bucket?.at === "number" ? bucket.at : 0;
        this.projects.set(k, { at, reviews: sanitizeReviews(bucket?.reviews) });
      }
      // Scan→project registrations ride along in the same file. An absent key
      // (a file written before this field existed) simply carries none.
      const scans = (parsed as { scans?: unknown }).scans;
      if (scans && typeof scans === "object") {
        for (const [scanId, project] of Object.entries(scans as Record<string, unknown>)) {
          if (!SCAN_ID.test(scanId) || typeof project !== "string" || !PROJECT_KEY.test(project))
            continue;
          this.scans.set(scanId, project);
          while (this.scans.size > MAX_SCAN_PROJECTS) {
            const oldest = this.scans.keys().next().value;
            if (oldest === undefined) break;
            this.scans.delete(oldest);
          }
        }
      }
      return true;
    } catch {
      console.error(
        `verdicts: ${file} does not parse — refusing to serve or write until it reads again`,
      );
      return false;
    }
  }

  private async persist(payload: string): Promise<void> {
    const write = this.chain.then(async () => {
      const file = verdictsFile();
      const tmp = `${file}.tmp`;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }).catch(() => {});
        await fs.chmod(path.dirname(file), 0o700).catch(() => {});
        await fs.writeFile(tmp, payload, { mode: 0o600 });
        await fs.rename(tmp, file);
      } catch (e) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw e;
      }
    });
    // Keep the queue usable after a failed write; each caller still sees its own rejection.
    this.chain = write.catch(() => {});
    try {
      await write;
    } catch (e) {
      // RAM now describes bytes that were not committed. The next request must read the disk.
      this.projects.clear();
      this.scans.clear();
      this.load = null;
      console.error(`verdicts: could not write ${verdictsFile()}`, e);
      throw e;
    }
  }

  /** The bucket's verdicts; `null` when the file is unreadable — not `{}`, which would lie. */
  async get(project: string): Promise<VerdictMap | null | undefined> {
    if (!(await this.ensureLoaded())) return null;
    return this.projects.get(project)?.reviews;
  }

  /**
   * Which project bucket a scan belongs to, so an agent that only knows the
   * scan id can still find the verdicts. Reads from the file, so it answers
   * across a restart — the mapping no longer dies with the process that wrote
   * it. `undefined` when the scan never registered a bucket.
   */
  async scanProject(scanId: string): Promise<string | undefined> {
    if (!(await this.ensureLoaded())) return undefined;
    return this.scans.get(scanId);
  }

  /** Record (and persist) which project bucket a scan's verdicts live in. */
  async registerScan(scanId: string, project: string): Promise<void> {
    if (!(await this.ensureLoaded())) return;
    if (!SCAN_ID.test(scanId) || !PROJECT_KEY.test(project)) return;
    this.scans.delete(scanId);
    this.scans.set(scanId, project);
    while (this.scans.size > MAX_SCAN_PROJECTS) {
      const oldest = this.scans.keys().next().value;
      if (oldest === undefined) break;
      this.scans.delete(oldest);
    }
    await this.persist(
      JSON.stringify({
        version: 1,
        projects: Object.fromEntries(this.projects),
        scans: Object.fromEntries(this.scans),
      }),
    );
  }

  /** Replace one project's verdicts; returns what the disk will hold, `null` when the read failed. */
  async set(project: string, reviews: unknown): Promise<VerdictMap | null> {
    if (!(await this.ensureLoaded())) return null;
    const clean = sanitizeReviews(reviews);
    const at = Date.now();
    this.projects.delete(project);
    this.projects.set(project, { at, reviews: clean });
    while (this.projects.size > MAX_PROJECTS) {
      const oldest = this.projects.keys().next().value;
      if (oldest === undefined) break;
      this.projects.delete(oldest);
    }
    await this.persist(
      JSON.stringify({
        version: 1,
        projects: Object.fromEntries(this.projects),
        scans: Object.fromEntries(this.scans),
      }),
    );
    return clean;
  }

  /**
   * The "delete my verdicts" button: everything, everywhere, at once —
   * while it can be read. A failed read does NOT authorize this one either:
   * an explicit delete intent names the verdicts the human holds, and over
   * bytes that cannot be listed the store cannot tell a cleared history
   * from a corrupt one. Writing an empty file there destroys what no other
   * door can still reach (this copy has no quarantine slot), and the screen
   * would report a deletion it did not witness. So the refusal is the
   * machine's, not a session's memory: `null` when the read failed — the
   * same answer `set` gives — and nothing is written.
   */
  async clear(): Promise<number | null> {
    if (!(await this.ensureLoaded())) return null;
    const cleared = this.projects.size;
    this.projects.clear();
    this.scans.clear();
    await this.persist(JSON.stringify({ version: 1, projects: {}, scans: {} }));
    return cleared;
  }
}

export const verdictStore = new VerdictStore();

const MAX_SCAN_PROJECTS = 200;

/**
 * Record which project bucket a scan's verdicts belong to, so an agent that
 * only knows the scan id can read them back. Persisted through the store —
 * not held in this process's memory alone, which let a restart silently
 * forget every mapping and answer a correct scan id with empty verdicts.
 */
export async function registerScanProject(scanId: string, project: string): Promise<void> {
  await verdictStore.registerScan(scanId, project);
}

/** Structural subset of the analysis store the handlers need */
type ResultStore = {
  get(id: string): unknown;
};

function resultId(req: Request): string {
  const id = req.params["id"];
  return typeof id === "string" ? id : "";
}

function readProjectQuery(req: Request): string | undefined {
  const raw = req.query["project"];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * GET /api/result/:id/verdicts — read-only. Without a query it answers what the
 * browser synced for this scan in this process; with `?project=<bucket>` it
 * answers that bucket directly, which is how a re-scan finds verdicts the
 * previous process wrote before any new registration exists. A verdict file
 * that cannot be read or parsed answers 503 `verdicts_unreadable` — an empty
 * map would be a lie about what was ever found.
 */
export async function handleGetVerdicts(
  req: Request,
  res: Response,
  store: ResultStore,
): Promise<void> {
  const id = resultId(req);
  const scan = id ? store.get(id) : undefined;
  if (!scan) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  if (guardStillAnalyzing(scan, res)) return;
  const asked = readProjectQuery(req);
  if (asked !== undefined && !PROJECT_KEY.test(asked)) {
    res.status(400).json({ error: "Malformed project key" });
    return;
  }
  const project = asked ?? (await verdictStore.scanProject(id)) ?? "";
  const stored = project ? await verdictStore.get(project) : undefined;
  if (stored === null) {
    res.status(503).json({ error: "The verdict file is unreadable", code: "verdicts_unreadable" });
    return;
  }
  res.json({ project, reviews: stored ?? {} });
}

/**
 * PUT /api/result/:id/verdicts — the human's browser writes the verdicts it
 * holds for the project of the scan on screen. Replaces the bucket (the
 * browser always carries the full map, and a cleared verdict must be able to
 * delete its entry) and registers the scan so an agent can read by scan id.
 * On an unreadable verdict file it answers 503 `verdicts_unreadable` and
 * writes nothing — a save must not overwrite what it could not read.
 */
export async function handlePutVerdicts(
  req: Request,
  res: Response,
  store: ResultStore,
): Promise<void> {
  const id = resultId(req);
  const scan = id ? store.get(id) : undefined;
  if (!scan) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  if (guardStillAnalyzing(scan, res)) return;
  const body = req.body as { project?: unknown; reviews?: unknown } | undefined;
  const project = typeof body?.project === "string" ? body.project : "";
  if (!PROJECT_KEY.test(project)) {
    res.status(400).json({ error: "A project bucket key is required", code: "bad_project" });
    return;
  }
  let saved: VerdictMap | null;
  try {
    saved = await verdictStore.set(project, body?.reviews);
    if (saved === null) {
      res
        .status(503)
        .json({ error: "The verdict file is unreadable", code: "verdicts_unreadable" });
      return;
    }
    await registerScanProject(id, project);
  } catch {
    res
      .status(503)
      .json({ error: "The verdict file could not be written", code: "verdicts_write_failed" });
    return;
  }
  res.json({ project, saved: Object.keys(saved).length });
}

/**
 * POST /api/verdicts/reset — the entry screen's "delete my verdicts" button.
 * On an unreadable verdict file it answers 503 `verdicts_unreadable` and
 * deletes nothing, exactly like the PUT: the browser's session latch is a
 * courtesy, this store is the door.
 */
export async function handleResetVerdicts(_req: Request, res: Response): Promise<void> {
  let cleared: number | null;
  try {
    cleared = await verdictStore.clear();
  } catch {
    res
      .status(503)
      .json({ error: "The verdict file could not be written", code: "verdicts_write_failed" });
    return;
  }
  if (cleared === null) {
    res.status(503).json({ error: "The verdict file is unreadable", code: "verdicts_unreadable" });
    return;
  }
  res.json({ cleared });
}
