import type { Request, Response } from "express";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import {
  supportedExtensionsLabel,
  emptyDroppedFiles,
  isExcludedPath,
  sumDroppedFiles,
  ScanCancelledError,
} from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, DroppedFiles, GitHubRepo } from "../../models/index.js";
import { promises as fs, type Dirent } from "fs";
import os from "os";
import path from "path";
import { deleteJobProgress } from "./job-progress.js";
import { makeSkeleton, makeProgressWriter, failJob } from "./job-progress.js";
import { resolveConfig, type ResolvedScanConfig } from "../../services/security/scan-config.js";
import { isOffline } from "../../services/security/network-policy.js";
import { deleteLiveSession, registerLiveManifest } from "../live-sessions.js";

/**
 * Upload caps — a local dev folder should always fit comfortably.
 *
 * The file count and the byte budget used to contradict each other: at the
 * measured average of this repository's source files (25 KB), 40 MB arrived long
 * before 3,000 files did, so the file cap was a limit nothing could reach. Both
 * numbers now describe one folder: 10,000 files, 150 MB.
 * `frontend/tests/upload-caps.test.ts` and `backend/tests/beleg-02-api-and-staging.test.ts`
 * pin these to the browser's copies.
 */
export const MAX_FILES = 10_000;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // matches the pipeline's MAX_FILE_SIZE
const MAX_NAME_LEN = 80;
/**
 * Path bound of the upload. Real deep trees (Java/Kotlin module layouts) do hit
 * it, so a path that leaves here is counted in `dropped.pathTooLong` and the
 * number reaches the city payload — an invisible cap is a defect, not a limit.
 */
export const MAX_PATH_LEN = 512;
/**
 * The .git folder rides along so the scanner can read real git history
 * (churn, author districts). Binary payloads arrive base64-encoded and live
 * in their own budget — git metadata must never crowd out source files.
 */
const GIT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const GIT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const isGitPath = (rel: string): boolean => rel === ".git" || rel.startsWith(".git/");

// ── Staged-directory registry ──────────────────────────────────────────────
// Staged copies outlive the scan so the test runner can execute the
// project's own tests from the city ("run my tests"). A TTL sweeper prunes
// directories whose analysis is old — nothing accumulates forever.
const STAGED_DIRS = new Map<string, { dir: string; lastUsed: number }>();
const STAGED_TTL_MS =
  Math.max(1, Number(process.env.CODECITY_UPLOAD_TTL_HOURS ?? 24)) * 60 * 60 * 1000;

/** The one directory this app stages into; nothing outside it is ever removed. */
export function uploadsRoot(): string {
  // An escape hatch for tests and for a machine whose /tmp is too small — the
  // sweeper only ever looks inside this root.
  //
  // Blank means unset, not "here": `CODECITY_UPLOAD_DIR=` is the line the shipped
  // template carries, and that template says the empty value means the system
  // temp folder. Read as a path, "" is the directory the server was started from,
  // so every staged copy of the user's source would land in the project tree and
  // the sweep would chase whatever the current folder happens to be.
  const configured = process.env.CODECITY_UPLOAD_DIR?.trim();
  return configured || path.join(os.tmpdir(), "codecity-uploads");
}

/** A staged dir is a direct child named by the id the route generated. */
const STAGED_DIR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function registerUploadDir(analysisId: string, dir: string): void {
  STAGED_DIRS.set(analysisId, { dir, lastUsed: Date.now() });
}

export function getStagedDir(analysisId: string): string | null {
  const entry = STAGED_DIRS.get(analysisId);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  return entry.dir;
}

/**
 * Jobs the person who started them asked to stop.
 *
 * Aborting the browser's fetch is only half of an abort: the server has already
 * staged a copy of the folder and is running the scanners over it. Without this
 * registry an abandoned scan keeps reading files nobody waits for, keeps its
 * copy of the source on disk for the full TTL, and can still write a finished
 * result into the store behind the user's back.
 */
const cancelledJobs = new Set<string>();
/** Jobs whose runner is alive right now — only they may delete their own dir. */
const runningJobs = new Set<string>();

export function isJobCancelled(analysisId: string): boolean {
  return cancelledJobs.has(analysisId);
}

function markCancelled(analysisId: string): void {
  cancelledJobs.add(analysisId);
  // Bounded: a long-lived server must not accumulate ids forever. The Set keeps
  // insertion order, so the oldest cancellation is the one that goes.
  if (cancelledJobs.size > 200) {
    const oldest = cancelledJobs.values().next().value;
    if (oldest !== undefined) cancelledJobs.delete(oldest);
  }
}

/** Unregister a staged copy and delete it; true when the directory is gone. */
async function discardStagedDir(analysisId: string): Promise<boolean> {
  const entry = STAGED_DIRS.get(analysisId);
  deleteLiveSession(analysisId);
  if (!entry) return false;
  STAGED_DIRS.delete(analysisId);
  return fs
    .rm(entry.dir, { recursive: true, force: true })
    .then(() =>
      fs
        .stat(entry.dir)
        .then(() => false)
        .catch(() => true),
    )
    .catch(() => false);
}

/**
 * POST /api/analyze-local/:id/cancel — throw away a running local scan.
 * The client that cancels stops its polling on its own; this is the other half:
 * the job leaves the store, its progress stops, and the staged copy of the
 * user's source is deleted instead of sitting out its TTL.
 */
export async function handleCancelLocalAnalyze(
  req: Request,
  res: Response,
  analysisStore: {
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
): Promise<void> {
  const id = req.params["id"];
  if (!id || Array.isArray(id) || !STAGED_DIR_NAME.test(id)) {
    res.status(400).json({ error: "Missing analysis ID", code: "bad_id" });
    return;
  }
  markCancelled(id);
  deleteJobProgress(id);
  const known = analysisStore.get(id) !== undefined;
  analysisStore.delete(id);
  // A runner that is still mid-scan deletes its own copy at its next checkpoint
  // — pulling the directory out from under it would turn a clean abort into a
  // wall of read errors.
  const removedNow = runningJobs.has(id) ? false : await discardStagedDir(id);
  res.json({ cancelled: true, known, stagedRemoved: removedNow });
}

export function pruneStaleUploadDirs(now: number = Date.now()): Promise<void> {
  // `now` injectable so tests can fast-forward the clock — the SAME clock for
  // both halves below. The registry honoured it and the directory sweep read
  // `Date.now()` behind it, so a caller that moved the clock saw one move and
  // the other stay: the sweep is the half that actually finds a restart's
  // leftovers.
  const jobs: Array<Promise<unknown>> = [];
  for (const [id, entry] of STAGED_DIRS) {
    if (now - entry.lastUsed > STAGED_TTL_MS) {
      STAGED_DIRS.delete(id);
      deleteLiveSession(id);
      jobs.push(fs.rm(entry.dir, { recursive: true, force: true }).catch(() => {}));
    }
  }
  // The registry lives in RAM, so a restart forgets every folder it staged —
  // and the copies of the user's source stayed behind (212 of them on this
  // machine). Sweep the staging root itself: only direct children, only the
  // uuid-shaped names this route makes, only real directories, only past TTL.
  // A symlinked child is left alone rather than followed out of the root.
  jobs.push(
    fs
      .readdir(uploadsRoot(), { withFileTypes: true })
      .then((entries) =>
        Promise.all(
          entries
            .filter((e) => e.isDirectory() && !e.isSymbolicLink() && STAGED_DIR_NAME.test(e.name))
            .map(async (e) => {
              const dir = path.join(uploadsRoot(), e.name);
              const stat = await fs.stat(dir).catch(() => null);
              if (!stat || now - stat.mtimeMs <= STAGED_TTL_MS) return;
              deleteLiveSession(e.name);
              return fs.rm(dir, { recursive: true, force: true }).catch(() => {});
            }),
        ),
      )
      .catch(() => undefined),
  );
  return Promise.all(jobs).then(() => undefined);
}

/**
 * What this program leaves on the machine, for the person who owns it.
 *
 * The privacy promise is "nothing is kept forever". That is only reassuring
 * while it is visible: where the staged copies sit, how many, how big, how many
 * are past their TTL, and whether the outbound calls are switched off. The entry
 * screen renders this and offers the sweep, so the claim can be checked and
 * acted on without a terminal.
 */
export interface Footprint {
  root: string;
  copies: number;
  bytes: number;
  stale: number;
  ttlHours: number;
  offline: boolean;
  /** Entries skipped while summing sizes — a big tree is measured, not walked forever */
  approx: boolean;
}

const WALK_CAP = 30_000;

/** Sum the bytes under one staged copy, yielding to the event loop as it goes. */
async function directoryBytes(dir: string, budget: { left: number }): Promise<number> {
  let total = 0;
  const stack: string[] = [dir];
  while (stack.length > 0 && budget.left > 0) {
    const current = stack.pop() as string;
    budget.left -= 1;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch((): Dirent[] => []);
    for (const e of entries) {
      const child = path.join(current, e.name);
      if (e.isDirectory()) stack.push(child);
      else total += (await fs.stat(child).catch(() => null))?.size ?? 0;
    }
  }
  return total;
}

async function stagedCopyDirs(): Promise<Array<{ name: string; dir: string }>> {
  const root = uploadsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((): Dirent[] => []);
  return entries
    .filter((e) => e.isDirectory() && STAGED_DIR_NAME.test(e.name))
    .map((e) => ({ name: e.name, dir: path.join(root, e.name) }));
}

export async function footprintSnapshot(): Promise<Footprint> {
  const copies = await stagedCopyDirs();
  const budget = { left: WALK_CAP };
  let bytes = 0;
  let stale = 0;
  for (const c of copies) {
    bytes += await directoryBytes(c.dir, budget);
    const stat = await fs.stat(c.dir).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > STAGED_TTL_MS) stale += 1;
  }
  return {
    root: uploadsRoot(),
    copies: copies.length,
    bytes,
    stale,
    ttlHours: Math.max(1, Math.round(STAGED_TTL_MS / (60 * 60 * 1000))),
    offline: isOffline(),
    approx: budget.left <= 0,
  };
}

/**
 * Delete the copies past their TTL — and only those, only inside the staging
 * root, only under a name this route minted. A running scan's copy is never
 * touched, so the button cannot cut the ground from under the city on screen.
 */
export async function purgeStaleCopies(): Promise<{
  removed: number;
  remaining: number;
  bytesFreed: number;
}> {
  const before = await footprintSnapshot();
  let removed = 0;
  for (const c of await stagedCopyDirs()) {
    const stat = await fs.stat(c.dir).catch(() => null);
    if (!stat || Date.now() - stat.mtimeMs <= STAGED_TTL_MS) continue;
    const registered = STAGED_DIRS.get(c.name);
    if (registered && Date.now() - registered.lastUsed <= STAGED_TTL_MS) continue;
    // Only count what actually went: a copy that resists deletion (permissions,
    // an immutable flag, a busy file) must not be reported as freed space.
    const gone = await fs
      .rm(c.dir, { recursive: true, force: true })
      .then(() =>
        fs
          .stat(c.dir)
          .then(() => false)
          .catch(() => true),
      )
      .catch(() => false);
    if (!gone) continue;
    STAGED_DIRS.delete(c.name);
    deleteLiveSession(c.name);
    removed += 1;
  }
  const after = await footprintSnapshot();
  return { removed, remaining: after.copies, bytesFreed: Math.max(0, before.bytes - after.bytes) };
}

export interface UploadedFile {
  path: string;
  content: string;
  /** "base64" for binary .git payloads — everything else is utf-8 text */
  encoding?: "base64";
}

/**
 * The client's own read accounting, clamped. It arrives with the upload because
 * a file the browser never opened is invisible to the server: only the reader
 * knows how many paths it skipped. Garbage in the field degrades to zero rather
 * than to a number the UI would then quote.
 */
export function sanitizeDropped(value: unknown): DroppedFiles {
  const out = emptyDroppedFiles();
  if (!value || typeof value !== "object") return out;
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(out) as Array<keyof DroppedFiles>) {
    const n = raw[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      out[key] = Math.min(1_000_000, Math.floor(n));
    }
  }
  return out;
}

/**
 * Did the browser hang up? The response side is the reliable witness: a request
 * whose body was read to the end reports `req.destroyed === true` as a matter of
 * course, and treating that as an abort swallows every upload.
 */
function clientGone(req: Request, res: Response): boolean {
  return res.destroyed === true || res.writableEnded === true || req.aborted === true;
}

/** Normalize + validate an uploaded relative path; null when unsafe */
export function safeRelativePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LEN) return null;
  const p = raw.replaceAll("\\", "/");
  if (p.includes("\0")) return null;
  if (path.isAbsolute(p)) return null;
  // Strict: no parent segments and no drive letters at all — legitimate file
  // picks from the browser never contain them
  if (/(^|\/)\.\.($|\/)/.test(p) || /^[a-zA-Z]:\//.test(p)) return null;
  const resolved = path.resolve("/", p).slice(1); // collapses ./ and // against a fake root
  if (resolved.length === 0 || resolved.endsWith("/")) return null;
  return resolved;
}

/** Sanitize the display name of a picked folder */
function safeDisplayName(raw: string): string {
  const cleaned = String(raw ?? "")
    .replaceAll(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return cleaned || "local folder";
}

/**
 * POST /api/analyze-local — analyze a folder picked in the browser.
 * Body: { name: string, files: Array<{ path, content }> }
 * Responds 202 { id, statusUrl } immediately; the analysis runs in the
 * background with progress on GET /api/status/:id.
 *
 * `createOrchestrator` is called per request on purpose: the scanner holds the
 * resolved config and per-run adapter state, so one shared instance would let
 * two analyses running at the same time answer with each other's profile.
 */
export async function handleLocalAnalyze(
  req: Request,
  res: Response,
  createOrchestrator: (config: ResolvedScanConfig) => AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
): Promise<void> {
  const body = req.body as
    { name?: unknown; files?: unknown; config?: unknown; dropped?: unknown } | undefined;
  const name = safeDisplayName(typeof body?.name === "string" ? body.name : "");
  const files = body?.files;
  const { config, errors: configErrors } = resolveConfig(body?.config);
  if (configErrors.length > 0) {
    res.status(400).json({ error: "Invalid scan config", details: configErrors });
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "No files received — pick a folder and try again" });
    return;
  }
  if (files.length > MAX_FILES) {
    res.status(400).json({
      error: `Folder too large: ${files.length} files (maximum ${MAX_FILES}). Ephemora Skyline ignores build output and whatever your .gitignore sets aside — if the folder is still this big, open a subfolder of it instead.`,
      code: "too_many_files",
      found: files.length,
      max: MAX_FILES,
    });
    return;
  }

  // Validate + normalize everything BEFORE touching the disk
  const cleaned: UploadedFile[] = [];
  /** Every path that left the scan on the way in, counted rather than dropped */
  const dropped = sanitizeDropped(body?.dropped);
  let totalBytes = 0;
  let gitBytes = 0;
  const excludes = config.excludePaths;
  for (const f of files as Array<{ path?: unknown; content?: unknown; encoding?: unknown }>) {
    if (typeof f?.path !== "string" || typeof f?.content !== "string") {
      dropped.unsafePath += 1;
      continue;
    }
    // The length bound gets its own counter before the shape checks: a deep
    // Java/Kotlin tree hits it for real, and "30 of 62 files unread" has to be
    // a number the user can see rather than a `continue`.
    if (f.path.length > MAX_PATH_LEN) {
      dropped.pathTooLong += 1;
      continue;
    }
    const rel = safeRelativePath(f.path);
    if (!rel) {
      dropped.unsafePath += 1;
      continue;
    }
    const encoding = f.encoding === "base64" ? "base64" : undefined;
    const byteLen = f.content.length; // chars ≈ bytes upper bound for UTF-8 code files
    if (isGitPath(rel)) {
      if (encoding !== "base64") continue; // binary git data must arrive exactly
      if (byteLen > GIT_MAX_FILE_BYTES * 1.4 || gitBytes + byteLen > GIT_MAX_TOTAL_BYTES * 1.4) {
        dropped.tooLarge += 1; // base64 inflates ~4/3 — cap on the encoded size with headroom
        continue;
      }
      gitBytes += byteLen;
      cleaned.push({ path: rel, content: f.content, encoding });
      continue;
    }
    // The user's exclude folders are honoured here as well as in the walk, so
    // an excluded subtree neither stages on disk nor counts as source.
    if (isExcludedPath(rel, excludes)) {
      dropped.excluded += 1;
      continue;
    }
    if (byteLen > MAX_FILE_BYTES) {
      dropped.tooLarge += 1;
      continue; // pipeline skips oversized files anyway
    }
    totalBytes += byteLen;
    if (totalBytes > MAX_TOTAL_BYTES) {
      res.status(400).json({
        error: `Folder too large: over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB of source code. Exclude build artifacts and try again.`,
        code: "too_much_source",
        found: cleaned.length,
        maxBytes: MAX_TOTAL_BYTES,
      });
      return;
    }
    cleaned.push({ path: rel, content: f.content });
  }
  if (!cleaned.some((f) => !isGitPath(f.path))) {
    res.status(400).json({
      error:
        "No analyzable source files in that folder — Ephemora Skyline reads: " +
        supportedExtensionsLabel(),
      code: "no_source",
      dropped,
    });
    return;
  }

  // The browser can abort this very request (its own "Analyse abbrechen"). Then
  // nothing must be staged and no job may start for a client that is gone.
  if (clientGone(req, res)) return;

  // Isolated upload dir under the OS temp dir. The staged copy is the user's
  // source code, so it is created owner-only: /tmp is one shared directory, and
  // a world-readable copy of somebody's repository is a leak the product itself
  // would cause.
  const analysisId = crypto.randomUUID();
  const uploadDir = path.join(uploadsRoot(), analysisId);
  try {
    // mkdir(mode) does not reach parents: the staging root itself came out of
    // umask at 0755, so a name like `f2053.ts` was world-readable even though
    // every directory below it was 0700. Own the parent before writing into it.
    const root = uploadsRoot();
    await fs.mkdir(root, { recursive: true, mode: 0o700 }).catch(() => {});
    await fs.chmod(root, 0o700).catch(() => {});
    await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    await fs.chmod(uploadDir, 0o700).catch(() => {});
    for (const f of cleaned) {
      const target = path.resolve(uploadDir, f.path);
      if (!target.startsWith(uploadDir + path.sep)) {
        dropped.unsafePath += 1; // belt and braces — counted, never silently skipped
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const data =
        f.encoding === "base64"
          ? Buffer.from(f.content, "base64")
          : Buffer.from(f.content, "utf-8");
      await fs.writeFile(target, data, { mode: 0o600 });
    }
    // The client may have aborted while the copy was being written. Staging is
    // the user's source code sitting in a temp directory — a scan nobody asked
    // for any more must not leave it behind.
    if (clientGone(req, res)) {
      await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
      return;
    }
  } catch (error) {
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : "Failed to stage uploaded files";
    res.status(500).json({ error: message });
    return;
  }
  registerUploadDir(analysisId, uploadDir);

  const repo: GitHubRepo = {
    owner: "local",
    name,
    branch: "local",
    cloneUrl: "",
    analyzedAt: new Date().toISOString(),
  };

  const skeleton = makeSkeleton(analysisId, repo);
  // The upload-side counts ride on the job from the first moment: a scan that
  // never finishes still tells how many paths it left out.
  skeleton.summary.dropped = dropped;
  analysisStore.set(analysisId, skeleton);

  res.status(202).json({
    id: analysisId,
    status: "analyzing",
    statusUrl: `/api/status/${analysisId}`,
    dropped,
    // The manifest is registered when the scan finishes; the client may start
    // its watch as soon as the city arrives.
    live: true,
  });

  void runLocalAnalysis(
    analysisId,
    uploadDir,
    repo,
    createOrchestrator(config),
    analysisStore,
    config,
    dropped,
  ).catch(() => {});
}

/** Background runner for local-folder analyses — never awaited */
async function runLocalAnalysis(
  analysisId: string,
  uploadDir: string,
  repo: GitHubRepo,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
  config?: ResolvedScanConfig,
  uploadDropped?: DroppedFiles,
): Promise<void> {
  const onEvent = makeProgressWriter(analysisId);
  runningJobs.add(analysisId);
  try {
    const result = await orchestrator.analyzeDirectory(
      analysisId,
      uploadDir,
      repo,
      onEvent,
      config,
      () => isJobCancelled(analysisId),
    );
    deleteJobProgress(analysisId);
    if (isJobCancelled(analysisId)) {
      await discardStagedDir(analysisId);
      analysisStore.delete(analysisId);
      return;
    }

    if (result.status === "failed" || result.summary.totalFiles === 0) {
      const message =
        result.error ??
        `No analyzable files found in that folder — Ephemora Skyline reads: ${supportedExtensionsLabel()}`;
      failJob(analysisId, message, analysisStore);
      return;
    }

    // Two halves of one honest total: what the reader left out and what the
    // server left out, summed before the city is published.
    result.summary.dropped = sumDroppedFiles(uploadDropped, result.summary.dropped);
    analysisStore.set(result.id, result);
    // The content-hash manifest a live delta is measured against. Hashing the
    // staged copy after the city is available keeps the wait unchanged; a scan
    // that cannot be hashed simply has no live mode.
    void registerLiveManifest(result.id, uploadDir, result.files, config).catch(() => {});
  } catch (error) {
    deleteJobProgress(analysisId);
    if (error instanceof ScanCancelledError || isJobCancelled(analysisId)) {
      // Aborted on purpose: no failed job, no leftover copy, nothing that could
      // appear on a screen whose owner said "abbrechen".
      await discardStagedDir(analysisId);
      analysisStore.delete(analysisId);
      return;
    }
    const message = error instanceof Error ? error.message : "Analysis failed";
    failJob(analysisId, message, analysisStore);
  } finally {
    runningJobs.delete(analysisId);
    cancelledJobs.delete(analysisId);
  }
  // The staged copy is KEPT: the test runner reuses it ("run my tests from
  // the city"). A TTL sweeper prunes stale dirs (pruneStaleUploadDirs).
}
