import type { Request, Response } from "express";
import type { AnalysisResult } from "../../models/index.js";
import { mapResultToCityData } from "../../utils/cityMapper.js";
import { resultToSarif } from "../../utils/sarif.js";

/** Structural subset of the analysis store the result reads need. */
type ResultStore = { get(id: string): AnalysisResult | undefined };

/** GET /api/result/:id — a completed analysis as it was stored. */
export function handleResult(req: Request, res: Response, analysisStore: ResultStore): void {
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

  if (result.status === "analyzing") {
    res.json({ status: "pending", progress: 0 });
    return;
  }

  res.json(result);
}

/** GET /api/result/:id/city — the analysis mapped to city data. */
export function handleResultCity(req: Request, res: Response, analysisStore: ResultStore): void {
  const id = req.params["id"];
  const result = analysisStore.get(typeof id === "string" ? id : "");
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.json(mapResultToCityData(result));
}

/** GET /api/result/:id/sarif — SARIF export for InfoPanel + CI. */
export function handleResultSarif(req: Request, res: Response, analysisStore: ResultStore): void {
  const id = req.params["id"];
  const result = analysisStore.get(typeof id === "string" ? id : "");
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.setHeader("Content-Type", "application/sarif+json");
  res.json(resultToSarif(result));
}
