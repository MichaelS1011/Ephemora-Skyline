import type { Request, Response } from "express";
import type { AnalysisResult } from "../../models/index.js";
import { getJobProgress } from "./job-progress.js";

/**
 * GET /api/status/:id — the progress channel the product actually uses.
 * The result record decides completion; the live map only narrates the run.
 */
export function handleStatus(
  req: Request,
  res: Response,
  analysisStore: { get(id: string): AnalysisResult | undefined },
): void {
  const id = req.params["id"];
  if (!id || Array.isArray(id)) {
    res.status(400).json({ error: "Missing analysis ID" });
    return;
  }

  const result = analysisStore.get(id);
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const live = getJobProgress(id);
  res.json({
    status: result.status,
    progress: result.status === "complete" ? 100 : (live?.progress ?? 0),
    stage: result.status === "complete" ? "Complete" : live?.stage,
    filesParsed: result.files.length,
    totalFiles: result.summary.totalFiles,
    error: result.status === "failed" ? result.error : undefined,
  });
}
