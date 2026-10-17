import type { Request, Response } from "express";
import { APP_VERSION } from "../../version.js";

export interface HealthResponse {
  status: "ok";
  uptime: number;
  timestamp: string;
  version: string;
}

export async function getHealth(): Promise<HealthResponse> {
  return {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
}

/**
 * GET /api/health — the liveness answer the frontend and a reverse proxy read.
 *
 * The city link's lifetime is a fact about this process, not about the defaults
 * in the text: ANALYSIS_MAX_ENTRIES / ANALYSIS_TTL_MS can move, and the screen
 * has to say the value that is actually in force — so it is read from the store
 * the process built, never restated.
 */
export async function handleHealth(
  _req: Request,
  res: Response,
  analysisStore: { maxEntries: number; ttlMs: number },
): Promise<void> {
  const health = await getHealth();
  res.json({
    ...health,
    cityStore: { maxEntries: analysisStore.maxEntries, ttlMs: analysisStore.ttlMs },
  });
}
