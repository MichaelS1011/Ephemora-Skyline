/**
 * Live progress for background analysis jobs, keyed by analysis id.
 * Shared by the git-clone route (/api/analyze) and the local-folder route
 * (/api/analyze-local); read by GET /api/status/:id.
 */

import type { AnalysisResult, GitHubRepo, WebSocketEvent } from "../../models/index.js";
import type { WebSocket as WsWebSocket } from "ws";

export interface JobProgress {
  progress: number;
  stage: string;
}

const jobProgress = new Map<string, JobProgress>();

export function setJobProgress(id: string, progress: JobProgress): void {
  jobProgress.set(id, progress);
}

export function getJobProgress(id: string): JobProgress | undefined {
  return jobProgress.get(id);
}

export function deleteJobProgress(id: string): void {
  jobProgress.delete(id);
}

/**
 * Skeleton result so polling endpoints can observe a running job
 * (moved here when the GitHub clone path was removed — these are
 * job-lifecycle helpers, not GitHub-specific).
 */
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

function wsSend(ws: WsWebSocket | null | undefined, payload: unknown): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* WS already closed — ignore */
  }
}
