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

/** The three verdicts the panel can set — the same words reviews.ts validates. */
const REVIEW_STATUSES = new Set(["reviewed", "false-positive", "to-fix"]);

/** The bucket id the frontend mints: `p-` plus 16 hex characters. */
const PROJECT_KEY = /^p-[0-9a-f]{16}$/;

/** A verdict key: the finding's fingerprint, or the positional fallback. */
const REVIEW_KEY = /^(fp:[0-9a-f]{8,64}|f-[0-9a-f]{12}#\d{1,6})$/;

const MAX_PROJECTS = 50;
const MAX_ENTRIES = 500;

export type VerdictStatus = "reviewed" | "false-positive" | "to-fix";
export type VerdictMap = Record<string, VerdictStatus>;

/** Where the verdicts live. Env-overridable so tests and drives own their copy. */
export function verdictsFile(): string {
  const configured = process.env.CODECITY_VERDICTS_FILE?.trim();
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
 * new state, never a torn one. A file that is missing or corrupt reads as
 * empty — a verdict store must not be able to take the server down.
 */
export class VerdictStore {
  private projects = new Map<string, VerdictBucket>();
  private loaded = false;
  private chain: Promise<void> = Promise.resolve();

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const file = verdictsFile();
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`verdicts: ${file} is unreadable — starting empty`, e);
      }
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; projects?: unknown };
      if (parsed?.version !== 1 || !parsed.projects || typeof parsed.projects !== "object") return;
      for (const [k, v] of Object.entries(parsed.projects as Record<string, unknown>)) {
        if (!PROJECT_KEY.test(k)) continue;
        const bucket = v as { at?: unknown; reviews?: unknown } | null;
        const at = typeof bucket?.at === "number" ? bucket.at : 0;
        this.projects.set(k, { at, reviews: sanitizeReviews(bucket?.reviews) });
      }
    } catch {
      console.error(`verdicts: ${file} does not parse — starting empty`);
    }
  }

  private persist(payload: string): void {
    this.chain = this.chain
      .then(async () => {
        const file = verdictsFile();
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }).catch(() => {});
        await fs.chmod(path.dirname(file), 0o700).catch(() => {});
        const tmp = `${file}.tmp`;
        await fs.writeFile(tmp, payload, { mode: 0o600 });
        await fs.rename(tmp, file);
      })
      .catch((e) => {
        console.error(`verdicts: could not write ${verdictsFile()}`, e);
      });
  }

  async get(project: string): Promise<VerdictMap | undefined> {
    await this.ensureLoaded();
    return this.projects.get(project)?.reviews;
  }

  /** Replace one project's verdicts; returns what the disk will hold. */
  async set(project: string, reviews: unknown): Promise<VerdictMap> {
    await this.ensureLoaded();
    const clean = sanitizeReviews(reviews);
    const at = Date.now();
    this.projects.delete(project);
    this.projects.set(project, { at, reviews: clean });
    while (this.projects.size > MAX_PROJECTS) {
      const oldest = this.projects.keys().next().value;
      if (oldest === undefined) break;
      this.projects.delete(oldest);
    }
    this.persist(
      JSON.stringify({
        version: 1,
        projects: Object.fromEntries(this.projects),
      }),
    );
    return clean;
  }

  /** The "delete my verdicts" button: everything, everywhere, at once. */
  async clear(): Promise<number> {
    await this.ensureLoaded();
    const cleared = this.projects.size;
    this.projects.clear();
    this.persist(JSON.stringify({ version: 1, projects: {} }));
    return cleared;
  }
}

export const verdictStore = new VerdictStore();

/**
 * Which project a scan's verdicts belong to, as the browser that triaged it
 * registered them. RAM-only, like the results themselves: a new scan registers
 * itself again. The registration is what lets an agent ask by scan id.
 */
const scanProjects = new Map<string, string>();
const MAX_SCAN_PROJECTS = 200;

export function registerScanProject(scanId: string, project: string): void {
  scanProjects.delete(scanId);
  scanProjects.set(scanId, project);
  while (scanProjects.size > MAX_SCAN_PROJECTS) {
    const oldest = scanProjects.keys().next().value;
    if (oldest === undefined) break;
    scanProjects.delete(oldest);
  }
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
 * previous process wrote before any new registration exists.
 */
export async function handleGetVerdicts(
  req: Request,
  res: Response,
  store: ResultStore,
): Promise<void> {
  const id = resultId(req);
  if (!id || store.get(id) === undefined) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const asked = readProjectQuery(req);
  if (asked !== undefined && !PROJECT_KEY.test(asked)) {
    res.status(400).json({ error: "Malformed project key" });
    return;
  }
  const project = asked ?? scanProjects.get(id) ?? "";
  const reviews = project ? ((await verdictStore.get(project)) ?? {}) : {};
  res.json({ project, reviews });
}

/**
 * PUT /api/result/:id/verdicts — the human's browser writes the verdicts it
 * holds for the project of the scan on screen. Replaces the bucket (the
 * browser always carries the full map, and a cleared verdict must be able to
 * delete its entry) and registers the scan so an agent can read by scan id.
 */
export async function handlePutVerdicts(
  req: Request,
  res: Response,
  store: ResultStore,
): Promise<void> {
  const id = resultId(req);
  if (!id || store.get(id) === undefined) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const body = req.body as { project?: unknown; reviews?: unknown } | undefined;
  const project = typeof body?.project === "string" ? body.project : "";
  if (!PROJECT_KEY.test(project)) {
    res.status(400).json({ error: "A project bucket key is required", code: "bad_project" });
    return;
  }
  const saved = await verdictStore.set(project, body?.reviews);
  registerScanProject(id, project);
  res.json({ project, saved: Object.keys(saved).length });
}

/** POST /api/verdicts/reset — the entry screen's "delete my verdicts" button. */
export async function handleResetVerdicts(_req: Request, res: Response): Promise<void> {
  const cleared = await verdictStore.clear();
  scanProjects.clear();
  res.json({ cleared });
}
