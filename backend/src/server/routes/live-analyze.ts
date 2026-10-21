/**
 * POST /api/analyze-local/:id/live — fold a change set into a finished scan.
 *
 * The contract is intentionally narrow, because a delta that silently misses
 * a file would make the city lie:
 * — `manifest` is the COMPLETE set of analyzed paths with their SHA-256, so
 *   deletions are paths that left the manifest;
 * — `files` carries content ONLY for paths that were added or changed. Every
 *   other manifest path must still match the SHA the server stored; a changed
 *   path without content is refused, not reused.
 *
 * A live run executes the built-in rules per changed file and nothing
 * project-wide. The result names the engines whose answer is still from the
 * last full scan (`scanProvenance.live.stale`), and changed files carry
 * `liveRefreshed` so the city can mark them as built-in-only ground.
 */
import type { Request, Response } from "express";
import { promises as fs } from "fs";
import path from "path";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import { isScanCandidate } from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, FileAnalysis, LiveScanInfo } from "../../models/index.js";
import {
  MAX_FILES,
  MAX_PATH_LEN,
  MAX_TOTAL_BYTES,
  getStagedDir,
  isJobCancelled,
  safeRelativePath,
  sanitizeDropped,
} from "./local-analyze.js";
import { getLiveConfig, getLiveManifest, sha256Hex, updateLiveManifest } from "../live-sessions.js";
import type { ResolvedScanConfig } from "../../services/security/scan-config.js";
import { resolveConfig } from "../../services/security/scan-config.js";
import {
  liveStaleEngines,
  mergeLiveFiles,
  summarizeLive,
  type LiveManifestEntry,
} from "../../services/analyzer/live-delta.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SHA_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** One delta at a time per analysis; overlapping writes would lose a change. */
const LIVE_RUNNING = new Set<string>();

interface DeltaFile {
  path: string;
  content: string;
}

function readManifest(value: unknown): { entries?: LiveManifestEntry[]; error?: string } {
  if (!Array.isArray(value)) return { error: "manifest must be an array" };
  if (value.length === 0) return { error: "manifest is empty" };
  if (value.length > MAX_FILES) return { error: `manifest exceeds ${MAX_FILES} paths` };
  const entries: LiveManifestEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "manifest entry is not an object" };
    const { path: rawPath, sha } = raw as { path?: unknown; sha?: unknown };
    if (typeof rawPath !== "string" || typeof sha !== "string") {
      return { error: "manifest entry needs path and sha" };
    }
    const rel = safeRelativePath(rawPath);
    if (!rel) return { error: `unsafe manifest path: ${rawPath.slice(0, MAX_PATH_LEN)}` };
    if (!isScanCandidate(rel)) {
      // The browser may still carry a support or tool-output path the scan
      // itself never admits. It is not part of this result, and saying so is
      // the response's `paths`; refusing the whole delta for it would turn a
      // harmless reader difference into a dead live session.
      continue;
    }
    if (!SHA_HEX.test(sha)) return { error: `malformed sha for ${rel}` };
    if (seen.has(rel)) return { error: `duplicate manifest path: ${rel}` };
    seen.add(rel);
    entries.push({ path: rel, sha });
  }
  if (entries.length === 0) return { error: "manifest has no analyzed paths" };
  return { entries };
}

function readFiles(
  value: unknown,
  manifest: ReadonlyMap<string, string>,
): { files?: DeltaFile[]; error?: string; code?: string } {
  if (!Array.isArray(value)) return { error: "files must be an array", code: "bad_files" };
  const files: DeltaFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== "object")
      return { error: "file is not an object", code: "bad_files" };
    const { path: rawPath, content } = raw as { path?: unknown; content?: unknown };
    if (typeof rawPath !== "string" || typeof content !== "string") {
      return { error: "file needs path and content", code: "bad_files" };
    }
    const rel = safeRelativePath(rawPath);
    if (!rel)
      return { error: `unsafe path: ${rawPath.slice(0, MAX_PATH_LEN)}`, code: "unsafe_path" };
    if (!manifest.has(rel)) {
      return { error: `content for a path outside the manifest: ${rel}`, code: "not_in_manifest" };
    }
    if (seen.has(rel)) return { error: `duplicate file: ${rel}`, code: "bad_files" };
    const declared = manifest.get(rel) as string;
    if (sha256Hex(content) !== declared) {
      return { error: `content does not match the declared sha: ${rel}`, code: "sha_mismatch" };
    }
    if (content.length > MAX_FILE_BYTES) {
      return { error: `file too large: ${rel}`, code: "too_large" };
    }
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { error: "delta exceeds the source budget", code: "too_much_source" };
    }
    seen.add(rel);
    files.push({ path: rel, content });
  }
  return { files };
}

function readSkipped(value: unknown): { files: number; directories: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { files?: unknown; directories?: unknown };
  const num = (n: unknown): number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(1_000_000, Math.floor(n)) : 0;
  return { files: num(raw.files), directories: num(raw.directories) };
}

export async function handleLiveDelta(
  req: Request,
  res: Response,
  createOrchestrator: (config: ResolvedScanConfig) => AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
): Promise<void> {
  const id = req.params["id"];
  if (!id || Array.isArray(id) || !UUID.test(id)) {
    res.status(400).json({ error: "Missing analysis ID", code: "bad_id" });
    return;
  }
  const body = req.body as
    | { manifest?: unknown; files?: unknown; dropped?: unknown; skippedByGitignore?: unknown }
    | undefined;

  const base = analysisStore.get(id);
  if (!base) {
    res.status(404).json({ error: "Analysis not found", code: "no_analysis" });
    return;
  }
  if (base.status !== "complete") {
    res.status(409).json({ error: "The full scan has not finished yet", code: "not_ready" });
    return;
  }
  const stagedDir = getStagedDir(id);
  if (!stagedDir) {
    res.status(409).json({ error: "No staged copy for this analysis", code: "no_live_session" });
    return;
  }
  const previous = getLiveManifest(id);
  if (!previous) {
    res
      .status(409)
      .json({ error: "Live mode is not available for this scan", code: "no_live_session" });
    return;
  }
  if (LIVE_RUNNING.has(id)) {
    res.status(409).json({ error: "A live update is already running", code: "busy" });
    return;
  }

  const manifestResult = readManifest(body?.manifest);
  if (!manifestResult.entries) {
    res.status(400).json({ error: manifestResult.error, code: "bad_manifest" });
    return;
  }
  const manifest = manifestResult.entries;
  const byPath = new Map(manifest.map((entry) => [entry.path, entry.sha]));

  const filesResult = readFiles(body?.files, byPath);
  if (!filesResult.files) {
    res.status(400).json({ error: filesResult.error, code: filesResult.code ?? "bad_files" });
    return;
  }
  const incoming = filesResult.files;
  const incomingPaths = new Set(incoming.map((file) => file.path));

  // Every manifest path that is not in this delta must still be covered by a
  // cached analysis and the hash it was analyzed under. A changed path with no
  // content is refused — that is the one shape that would silently keep old
  // findings. Paths this server never analyzed (language scope, a support file
  // the client still carries) are not an error: they simply do not join the
  // result, and the response's `paths` tells the client what the live set is.
  const basePaths = new Set(base.files.map((file) => file.path));
  for (const entry of manifest) {
    if (incomingPaths.has(entry.path)) continue;
    const priorSha = previous.get(entry.path);
    if (priorSha !== undefined && priorSha !== entry.sha) {
      res.status(400).json({
        error: `manifest lists a changed path without content: ${entry.path}`,
        code: "missing_content",
        path: entry.path,
      });
      return;
    }
  }

  // The manifest the server can act on: paths the result already holds or
  // this delta just analyzed. Everything else stays outside the city exactly
  // as the full scan left it.
  const effective = manifest.filter(
    (entry) => basePaths.has(entry.path) || incomingPaths.has(entry.path),
  );
  const effectiveByPath = new Map(effective.map((entry) => [entry.path, entry.sha]));
  const changed = effective.filter(
    (entry) => previous.has(entry.path) && previous.get(entry.path) !== entry.sha,
  ).length;
  const added = effective.filter((entry) => !previous.has(entry.path)).length;
  const removed = [...previous.keys()].filter((p) => !effectiveByPath.has(p)).length;
  if (incoming.length === 0 && removed === 0 && effective.length === basePaths.size) {
    res.json({
      id,
      status: "complete",
      changed: 0,
      added: 0,
      removed: 0,
      refreshed: 0,
      paths: [...effectiveByPath.keys()],
    });
    return;
  }

  LIVE_RUNNING.add(id);
  try {
    // Built-in rules only: the orchestrator this factory makes has no
    // gitleaks/semgrep/dependency adapters and never enters batch mode.
    const orchestrator = createOrchestrator(getLiveConfig(id) ?? resolveConfig().config);
    const refreshed = new Map<string, FileAnalysis>();
    for (const file of incoming) {
      const analysis = await orchestrator.analyzeContent(file.path, file.content);
      refreshed.set(file.path, analysis);
    }

    if (isJobCancelled(id)) {
      res.status(404).json({ error: "Analysis cancelled", code: "cancelled" });
      return;
    }

    // Stage the new bytes for the test runner, and drop what left the folder.
    for (const file of incoming) {
      const target = path.resolve(stagedDir, file.path);
      if (!target.startsWith(stagedDir + path.sep)) continue;
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, Buffer.from(file.content, "utf-8"), { mode: 0o600 });
      await fs.chmod(target, 0o600).catch(() => {});
    }
    for (const oldPath of previous.keys()) {
      if (effectiveByPath.has(oldPath)) continue;
      const target = path.resolve(stagedDir, oldPath);
      if (!target.startsWith(stagedDir + path.sep)) continue;
      await fs.rm(target, { force: true }).catch(() => {});
    }

    const merged = mergeLiveFiles(base.files, effective, refreshed);
    const now = new Date().toISOString();
    const priorLive = base.summary.scanProvenance?.live;
    const live: LiveScanInfo = {
      at: now,
      fullScanAt: priorLive?.fullScanAt ?? base.createdAt,
      changed,
      added,
      removed,
      refreshed: refreshed.size,
      stale: liveStaleEngines(base.summary.scanProvenance),
    };
    const summary = summarizeLive(base.summary, merged, live);
    if (body?.dropped !== undefined) summary.dropped = sanitizeDropped(body.dropped);
    const skipped = readSkipped(body?.skippedByGitignore);
    if (skipped) summary.skippedByGitignore = skipped;

    const result: AnalysisResult = {
      ...base,
      files: merged,
      summary,
      updatedAt: now,
      status: "complete",
    };
    analysisStore.set(id, result);
    updateLiveManifest(id, effectiveByPath);

    res.json({
      id,
      status: "complete",
      changed,
      added,
      removed,
      refreshed: refreshed.size,
      totalFiles: merged.length,
      paths: [...effectiveByPath.keys()],
      live,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live update failed";
    res.status(500).json({ error: message, code: "live_failed" });
  } finally {
    LIVE_RUNNING.delete(id);
  }
}
