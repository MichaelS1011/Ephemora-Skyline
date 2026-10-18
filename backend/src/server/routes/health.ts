import type { Request, Response } from "express";
import { APP_VERSION } from "../../version.js";
import type { LlmConfig } from "../../services/security/llm-explain.js";

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
 *
 * `localModel` says the same about `EPHEMORA_LLM_URL`. The card would otherwise
 * offer an "ask the model" button that answers 501 after a click, which reads as
 * a broken product rather than as an unconfigured one — and the model's name is
 * included because the honest label for a sentence is the model that wrote it.
 */
export async function handleHealth(
  _req: Request,
  res: Response,
  analysisStore: { maxEntries: number; ttlMs: number },
  localModel: LlmConfig | null = null,
): Promise<void> {
  const health = await getHealth();
  res.json({
    ...health,
    cityStore: { maxEntries: analysisStore.maxEntries, ttlMs: analysisStore.ttlMs },
    localModel: localModel
      ? // The name stays empty when the operator set no `EPHEMORA_LLM_MODEL`: the
        // UI is the one that knows whether it is speaking English or German, and
        // "local model auf diesem Rechner fragen" is what a fallback mints.
        { configured: true, model: localModel.model }
      : { configured: false },
  });
}
