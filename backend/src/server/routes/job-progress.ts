/**
 * Live progress for background analysis jobs, keyed by analysis id.
 * Shared by the git-clone route (/api/analyze) and the local-folder route
 * (/api/analyze-local); read by GET /api/status/:id.
 */

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
