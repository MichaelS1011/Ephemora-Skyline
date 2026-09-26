import type { Request, Response } from "express";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, GitHubRepo } from "../../models/index.js";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { deleteJobProgress } from "./job-progress.js";
import { makeSkeleton, makeOnEvent, failJob } from "./analyze.js";

/** Upload caps — a local dev folder should always fit comfortably */
const MAX_FILES = 3000;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // matches the pipeline's MAX_FILE_SIZE
const MAX_NAME_LEN = 80;
const MAX_PATH_LEN = 512;

export interface UploadedFile {
  path: string;
  content: string;
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
 */
export async function handleLocalAnalyze(
  req: Request,
  res: Response,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    delete(id: string): void;
  },
): Promise<void> {
  const body = req.body as { name?: unknown; files?: unknown } | undefined;
  const name = safeDisplayName(typeof body?.name === "string" ? body.name : "");
  const files = body?.files;

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "No files received — pick a folder and try again" });
    return;
  }
  if (files.length > MAX_FILES) {
    res.status(400).json({
      error: `Folder too large: ${files.length} files (maximum ${MAX_FILES}). Skip node_modules/dist — CodeCity ignores them anyway.`,
    });
    return;
  }

  // Validate + normalize everything BEFORE touching the disk
  const cleaned: UploadedFile[] = [];
  let totalBytes = 0;
  for (const f of files as Array<{ path?: unknown; content?: unknown }>) {
    if (typeof f?.path !== "string" || typeof f?.content !== "string") continue;
    const rel = safeRelativePath(f.path);
    if (!rel) continue; // silently drop unsafe paths — the picker only sends real files
    const byteLen = f.content.length; // chars ≈ bytes upper bound for UTF-8 code files
    if (byteLen > MAX_FILE_BYTES) continue; // pipeline skips oversized files anyway
    totalBytes += byteLen;
    if (totalBytes > MAX_TOTAL_BYTES) {
      res.status(400).json({
        error: `Folder too large: over ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB of source code. Exclude build artifacts and try again.`,
      });
      return;
    }
    cleaned.push({ path: rel, content: f.content });
  }
  if (cleaned.length === 0) {
    res.status(400).json({
      error:
        "No analyzable source files in that folder (supported: ts, tsx, js, jsx, py, go, rs, java, rb, html, css, json, yaml)",
    });
    return;
  }

  // Isolated upload dir under the OS temp dir
  const analysisId = crypto.randomUUID();
  const uploadDir = path.join(os.tmpdir(), "codecity-uploads", analysisId);
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    for (const f of cleaned) {
      const target = path.resolve(uploadDir, f.path);
      if (!target.startsWith(uploadDir + path.sep)) continue; // belt and braces
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, f.content, "utf-8");
    }
  } catch (error) {
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : "Failed to stage uploaded files";
    res.status(500).json({ error: message });
    return;
  }

  const repo: GitHubRepo = {
    owner: "local",
    name,
    branch: "local",
    cloneUrl: "",
    analyzedAt: new Date().toISOString(),
  };

  analysisStore.set(analysisId, makeSkeleton(analysisId, repo));

  res.status(202).json({
    id: analysisId,
    status: "analyzing",
    statusUrl: `/api/status/${analysisId}`,
  });

  void runLocalAnalysis(analysisId, uploadDir, repo, orchestrator, analysisStore).catch(() => {});
}

/** Background runner for local-folder analyses — never awaited */
async function runLocalAnalysis(
  analysisId: string,
  uploadDir: string,
  repo: GitHubRepo,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    delete(id: string): void;
  },
): Promise<void> {
  const { onEvent, finished } = makeOnEvent(analysisId);
  try {
    const result = await orchestrator.analyzeDirectory(analysisId, uploadDir, repo, onEvent);
    deleteJobProgress(analysisId);

    if (result.status === "failed" || result.summary.totalFiles === 0) {
      const message =
        result.error ??
        "No analyzable files found in that folder — supported languages: ts, tsx, js, jsx, py, go, rs, java, rb, html, css, json, yaml";
      failJob(analysisId, message, analysisStore);
      return;
    }

    analysisStore.set(result.id, result);
    if (!finished()) {
      // Polling-only clients learn completion through /api/status/:id
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    failJob(analysisId, message, analysisStore);
  } finally {
    // The uploaded copy is never reused — remove it right away
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
  }
}
