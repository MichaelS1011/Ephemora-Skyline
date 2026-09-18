import type { Request, Response } from 'express';
import type { AnalysisOrchestrator } from '../../services/analyzer/orchestrator.js';
import type { AnalysisResult, GitHubRepo, WebSocketEvent } from '../../models/index.js';
import type { WebSocket as WsWebSocket } from 'ws';

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

export async function handleAnalyze(
  req: Request,
  res: Response,
  orchestrator: AnalysisOrchestrator,
  analysisStore: { set(id: string, result: AnalysisResult): void },
  ws?: WsWebSocket | null,
): Promise<void> {
  try {
    const body = req.body as { url?: string; branch?: string } | undefined;
    const { url, branch } = body ?? {};

    if (!url || !url.includes('github.com')) {
      const error = { error: 'Invalid GitHub URL. Expected: https://github.com/owner/name' };
      if (ws) wsSend(ws, { type: 'error', payload: { message: error.error }, timestamp: new Date().toISOString() });
      res.status(400).json(error);
      return;
    }

    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      const error = { error: 'Could not extract owner/name from URL' };
      if (ws) wsSend(ws, { type: 'error', payload: { message: error.error }, timestamp: new Date().toISOString() });
      res.status(400).json(error);
      return;
    }

    const owner = match[1]!;
    // Strip .git suffix if present
    const name = match[2]!.replace(/\.git$/, '');
    let repoBranch = branch || 'main';

    // Auto-detect the repository's default branch when none was given —
    // hardcoding 'main' breaks repos that still use 'master' (e.g. express).
    if (!branch) {
      try {
        const headers: Record<string, string> = { 'User-Agent': 'codecity-cyberdefense' };
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers });
        if (res.ok) {
          const meta = (await res.json()) as { default_branch?: unknown };
          if (typeof meta.default_branch === 'string' && meta.default_branch) {
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
    };

    // Forward orchestrator events to the WS client: progress for the
    // progress bar, analysis_complete so the frontend loads the new city.
    let completeSent = false;
    const onEvent = (event: WebSocketEvent): void => {
      if (!ws) return;
      if (event.type === 'analysis_progress' && typeof event.payload.progress === 'number') {
        wsSend(ws, {
          type: 'analysis_progress',
          payload: { progress: event.payload.progress, stage: event.payload.stage },
          timestamp: event.timestamp,
        });
      } else if (event.type === 'analysis_complete' && !completeSent) {
        completeSent = true;
        wsSend(ws, { type: 'analysis_complete', payload: event.payload, timestamp: event.timestamp });
      }
    };

    const result = await orchestrator.analyzeRepo(repo, onEvent);
    analysisStore.set(result.id, result);

    if (ws && !completeSent) {
      // Belt and braces: some orchestrator paths return without emitting
      // analysis_complete — the client must always learn the result id.
      completeSent = true;
      wsSend(ws, {
        type: 'analysis_complete',
        payload: { id: result.id, totalFiles: result.summary.totalFiles },
        timestamp: new Date().toISOString(),
      });
    }

    // Only send HTTP response when res is a real Response object (not a no-op stub from WS path)
    if (typeof res.json === 'function') {
      res.json({
        id: result.id,
        status: result.status,
        url: `/api/result/${result.id}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (ws) wsSend(ws, { type: 'error', payload: { message }, timestamp: new Date().toISOString() });
    if (typeof res.status === 'function') {
      res.status(500).json({ error: message });
    }
  }
}
