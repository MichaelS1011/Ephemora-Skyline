/**
 * Live progress for background analysis jobs, keyed by analysis id.
 * Read by GET /api/status/:id — the only progress channel the product has.
 */

import type { AnalysisResult, GitHubRepo, ProgressEvent } from "../../models/index.js";

const jobProgress = new Map<string, ProgressEvent>();

function setJobProgress(id: string, progress: ProgressEvent): void {
  jobProgress.set(id, progress);
}

export function getJobProgress(id: string): ProgressEvent | undefined {
  return jobProgress.get(id);
}

export function deleteJobProgress(id: string): void {
  jobProgress.delete(id);
}

/**
 * Skeleton result so polling endpoints can observe a running job.
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
 * Where the pipeline's progress events go: the map a polling client reads.
 */
export function makeProgressWriter(analysisId: string): (event: ProgressEvent) => void {
  return (event): void => {
    setJobProgress(analysisId, event);
  };
}

/**
 * Fail a job: mark the skeleton as failed (with the reason) so polling
 * clients see the real error instead of an eternal "analyzing", clear live
 * progress. A failed analysis must never look like a completed empty city —
 * nor like a vanished job.
 */
export function failJob(
  analysisId: string,
  message: string,
  analysisStore: {
    set(id: string, result: AnalysisResult): void;
    get(id: string): AnalysisResult | undefined;
  },
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
}
