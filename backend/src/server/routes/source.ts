/**
 * source — serves the raw source code of one analyzed file.
 *
 * GET /api/result/:id/source/:fileId → 200 { path, language, lines: string[] }
 *
 * fileId is the CityFile id minted by cityMapper (`fileIdForPath`: `f-` plus a
 * SHA-256 prefix of the file's relative path); the file's own relative path and
 * the legacy positional `f-<index>` form are accepted as well. The
 * content is read from the staged upload copy — the same mechanism the
 * test runner uses (getStagedDir). There is no other source directory
 * (the GitHub-clone flow was removed), so a missing staged copy answers
 * 404 "source not available" instead of pretending.
 */

import { promises as fs } from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult } from "../../models/index.js";
import { getStagedDir } from "./local-analyze.js";
import { fileIdForPath } from "../../utils/cityMapper.js";

/** Structural subset of the analysis store the handler needs */
type ResultStore = {
  get(id: string): AnalysisResult | undefined;
};

/**
 * fileId → analyzed file entry. `f-<sha256(path) prefix>` follows cityMapper's
 * id contract (`fileIdForPath`); a literal relative path from the analyzed file
 * set works too, as does the legacy positional `f-<index>` form.
 */
function resolveFileEntry(
  result: AnalysisResult,
  fileId: string,
): AnalysisResult["files"][number] | undefined {
  const indexMatch = /^f-(\d+)$/.exec(fileId);
  if (indexMatch) return result.files[Number(indexMatch[1])];
  return result.files.find((f) => f.path === fileId || fileIdForPath(f.path) === fileId);
}

/** Split file content into lines without line endings (CRLF-safe) */
function toLines(content: string): string[] {
  const lines = content.split("\n");
  // A trailing newline marks a line terminator, not an extra empty line
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

export async function handleSource(
  req: Request,
  res: Response,
  analysisStore: ResultStore,
): Promise<void> {
  const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
  const fileId = typeof req.params["fileId"] === "string" ? req.params["fileId"] : "";

  const result = id ? analysisStore.get(id) : undefined;
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const entry = fileId ? resolveFileEntry(result, fileId) : undefined;
  if (!entry) {
    res.status(404).json({ error: "Unknown file" });
    return;
  }

  const stagedDir = getStagedDir(id);
  if (!stagedDir) {
    res.status(404).json({
      error:
        "Source not available — the scanned copy of this project is gone (24h TTL); scan the folder again.",
    });
    return;
  }

  // Belt and braces: analysis paths are relative, but never leave the copy
  const fullPath = path.resolve(stagedDir, entry.path);
  if (!fullPath.startsWith(stagedDir + path.sep)) {
    res.status(404).json({ error: "Source not available" });
    return;
  }

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    res.json({ path: entry.path, language: entry.language, lines: toLines(content) });
  } catch {
    res.status(404).json({ error: "Source not available" });
  }
}
