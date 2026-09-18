import type { Request, Response } from "express";
import type { AnalysisOrchestrator } from "../../services/analyzer/orchestrator.js";
import type { AnalysisResult, GitHubRepo, WebSocketEvent } from "../../models/index.js";
import type { WebSocket as WsWebSocket } from "ws";

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

/** Live progress per running analysis id — read by GET /api/status/:id */
const jobProgress = new Map<string, { progress: number; stage: string }>();

export function getJobProgress(id: string): { progress: number; stage: string } | undefined {
  return jobProgress.get(id);
}

/** Background runner — never awaited by the HTTP/WS entry points */
async function runAnalysis(
  analysisId: string,
  repo: GitHubRepo,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
  },
  ws?: WsWebSocket | null,
): Promise<void> {
  let completeSent = false;
  const onEvent = (event: WebSocketEvent): void => {
    if (event.type === "analysis_progress" && typeof event.payload.progress === "number") {
      jobProgress.set(analysisId, {
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
      wsSend(ws, { type: "analysis_complete", payload: event.payload, timestamp: event.timestamp });
    }
  };

  try {
    // Tell the client which job id to poll if the WS connection drops
    wsSend(ws, {
      type: "analysis_started",
      payload: { id: analysisId },
      timestamp: new Date().toISOString(),
    });

    const result = await orchestrator.analyzeRepo(repo, onEvent, analysisId);
    analysisStore.set(result.id, result);
    jobProgress.delete(result.id);

    if (ws && !completeSent) {
      // Belt and braces: some orchestrator paths return without emitting
      // analysis_complete — the client must always learn the result id.
      completeSent = true;
      wsSend(ws, {
        type: "analysis_complete",
        payload: { id: result.id, totalFiles: result.summary.totalFiles },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const message = sanitizeMessage(error instanceof Error ? error.message : "Analysis failed");
    // Surface the failure to polling clients
    const skeleton = analysisStore.get(analysisId);
    if (skeleton) {
      skeleton.status = "failed";
      skeleton.error = message;
      analysisStore.set(analysisId, skeleton);
    }
    jobProgress.delete(analysisId);
    if (ws)
      wsSend(ws, { type: "error", payload: { message }, timestamp: new Date().toISOString() });
  }
}

export async function handleAnalyze(
  req: Request,
  res: Response,
  orchestrator: AnalysisOrchestrator,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
  },
  ws?: WsWebSocket | null,
): Promise<void> {
  try {
    const body = req.body as { url?: string; branch?: string; fullHistory?: boolean } | undefined;
    const { url, branch, fullHistory } = body ?? {};

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
          { headers },
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
    analysisStore.set(analysisId, {
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
    });

    // Respond immediately — clients follow progress via WS events and/or
    // GET /api/status/:id instead of holding the request open for minutes.
    res.status(202).json({
      id: analysisId,
      status: "analyzing",
      statusUrl: `/api/status/${analysisId}`,
    });

    void runAnalysis(analysisId, repo, orchestrator, analysisStore, ws).catch(() => {});
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
