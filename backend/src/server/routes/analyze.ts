import type { Request, Response } from "express";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, GitHubRepo, WebSocketEvent } from "../../models/index.js";
import type { WebSocket as WsWebSocket } from "ws";
import { setJobProgress, deleteJobProgress, getJobProgress } from "./job-progress.js";
import { resolveConfig, type ResolvedScanConfig } from "../../services/security/scan-config.js";

export { getJobProgress };

/**
 * Strict GitHub URL parsing — only https://github.com/<owner>/<name>[.git]
 * (plus the git@github.com:owner/name.git SSH form). A loose
 * `url.includes('github.com')` would also accept https://evil.com/?x=github.com.
 */
export function parseGitHubUrl(raw: string): { owner: string; name: string } | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.hostname !== "github.com") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    const owner = segs[0]!;
    const name = segs[1]!.replace(/\.git$/, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;
    return { owner, name };
  } catch {
    const m = raw.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (m) return { owner: m[1]!, name: m[2]! };
    return null;
  }
}

/** Keep internal messages out of client responses (paths, credentials) */
function sanitizeMessage(message: string): string {
  const token = process.env.GITHUB_TOKEN;
  let out = token ? message.replaceAll(token, "[redacted]") : message;
  out = out.replaceAll(/\/tmp\/[\w./-]+/g, "[path]");
  return out.slice(0, 300);
}

/**
 * Send a message to a WebSocket client, silently ignoring closed sockets.
 */
function wsSend(ws: WsWebSocket | null | undefined, payload: unknown): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* WS already closed — ignore */
  }
}

/** Skeleton result so polling endpoints can observe a running job */
export function makeSkeleton(analysisId: string, repo: GitHubRepo): AnalysisResult {
  return {
    id: analysisId,
    repo,
    files: [],
    directories: [],
    summary: {
      totalFiles: 0,
      totalDirectories: 0,
      totalLines: 0,
      avgCyclomatic: 0,
      maxCyclomatic: 0,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
    },
    createdAt: new Date().toISOString(),
    status: "analyzing",
  };
}

/**
 * Shared progress forwarder: job-progress map + optional WS client.
 * Returns a `finished()` probe so callers can avoid double-complete events.
 */
export function makeOnEvent(
  analysisId: string,
  ws?: WsWebSocket | null,
): { onEvent: (event: WebSocketEvent) => void; finished: () => boolean } {
  let completeSent = false;
  return {
    onEvent: (event: WebSocketEvent): void => {
      if (event.type === "analysis_progress" && typeof event.payload.progress === "number") {
        setJobProgress(analysisId, {
          progress: event.payload.progress,
          stage: String(event.payload.stage ?? ""),
        });
        if (ws) {
          wsSend(ws, {
            type: "analysis_progress",
            payload: { progress: event.payload.progress, stage: event.payload.stage },
            timestamp: event.timestamp,
          });
        }
      } else if (event.type === "analysis_complete" && !completeSent) {
        completeSent = true;
        if (ws) {
          wsSend(ws, {
            type: "analysis_complete",
            payload: event.payload,
            timestamp: event.timestamp,
          });
        }
      }
    },
    finished: () => completeSent,
  };
}

/**
 * Fail a job: mark the skeleton as failed (with the reason) so polling
 * clients see the real error instead of an eternal "analyzing", clear live
 * progress, notify the WS client. A failed analysis must never look like a
 * completed empty city — nor like a vanished job.
 */
export function failJob(
  analysisId: string,
  message: string,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
  },
  ws?: WsWebSocket | null,
): void {
  deleteJobProgress(analysisId);
  const skeleton = analysisStore.get(analysisId);
  if (skeleton) {
    analysisStore.set(analysisId, {
      ...skeleton,
      status: "failed",
      error: message,
    });
  }
  if (ws) wsSend(ws, { type: "error", payload: { message }, timestamp: new Date().toISOString() });
}

/** Background runner for git-clone analyses — never awaited by entry points */
async function runAnalysis(
  analysisId: string,
  repo: GitHubRepo,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
  ws?: WsWebSocket | null,
  config?: ResolvedScanConfig,
): Promise<void> {
  const { onEvent, finished } = makeOnEvent(analysisId, ws);

  try {
    // Tell the client which job id to poll if the WS connection drops
    wsSend(ws, {
      type: "analysis_started",
      payload: { id: analysisId },
      timestamp: new Date().toISOString(),
    });

    const result = await orchestrator.analyzeRepo(repo, onEvent, analysisId, config);
    deleteJobProgress(analysisId);

    if (result.status === "failed" || result.summary.totalFiles === 0) {
      const message =
        result.error ??
        "No analyzable files found — check that the repository is public and the branch exists";
      failJob(analysisId, message, analysisStore, ws);
      return;
    }

    analysisStore.set(result.id, result);

    if (ws && !finished()) {
      // Belt and braces: some orchestrator paths return without emitting
      // analysis_complete — the client must always learn the result id.
      wsSend(ws, {
        type: "analysis_complete",
        payload: { id: result.id, totalFiles: result.summary.totalFiles },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const message = sanitizeMessage(error instanceof Error ? error.message : "Analysis failed");
    failJob(analysisId, message, analysisStore, ws);
  }
}

export async function handleAnalyze(
  req: Request,
  res: Response,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
    delete(id: string): void;
  },
  ws?: WsWebSocket | null,
): Promise<void> {
  try {
    const body = req.body as
      { url?: string; branch?: string; fullHistory?: boolean; config?: unknown } | undefined;
    const { url, branch, fullHistory, config } = body ?? {};
    const resolvedScanConfig = resolveConfig(config).config;

    const parsedUrl = url ? parseGitHubUrl(url) : null;
    if (!url || !parsedUrl) {
      const error = { error: "Invalid GitHub URL. Expected: https://github.com/owner/name" };
      if (ws)
        wsSend(ws, {
          type: "error",
          payload: { message: error.error },
          timestamp: new Date().toISOString(),
        });
      res.status(400).json(error);
      return;
    }

    const { owner, name } = parsedUrl;
    let repoBranch = branch || "main";

    // Auto-detect the repository's default branch when none was given —
    // hardcoding 'main' breaks repos that still use 'master' (e.g. express).
    if (!branch) {
      try {
        const headers: Record<string, string> = { "User-Agent": "codecity-cyberdefense" };
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        const apiRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
          { headers, signal: AbortSignal.timeout(5000) },
        );
        if (apiRes.ok) {
          const meta = (await apiRes.json()) as { default_branch?: unknown };
          if (typeof meta.default_branch === "string" && meta.default_branch) {
            repoBranch = meta.default_branch;
          }
        }
      } catch {
        // keep the 'main' fallback
      }
    }

    const repo: GitHubRepo = {
      owner,
      name,
      branch: repoBranch,
      cloneUrl: url,
      analyzedAt: new Date().toISOString(),
      fullHistory: Boolean(fullHistory),
    };

    // Register a skeleton result so polling endpoints can observe the job
    const analysisId = crypto.randomUUID();
    analysisStore.set(analysisId, makeSkeleton(analysisId, repo));

    // Respond immediately — clients follow progress via WS events and/or
    // GET /api/status/:id instead of holding the request open for minutes.
    res.status(202).json({
      id: analysisId,
      status: "analyzing",
      statusUrl: `/api/status/${analysisId}`,
    });

    void runAnalysis(analysisId, repo, orchestrator, analysisStore, ws, resolvedScanConfig).catch(
      () => {},
    );
  } catch (error) {
    const message = sanitizeMessage(
      error instanceof Error ? error.message : "Internal server error",
    );
    if (ws)
      wsSend(ws, { type: "error", payload: { message }, timestamp: new Date().toISOString() });
    if (typeof res.status === "function") {
      res.status(500).json({ error: message });
    }
  }
}
