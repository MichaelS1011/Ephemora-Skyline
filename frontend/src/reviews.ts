import type { ReviewStatus } from "./city/types";

/**
 * Per-finding review states, persisted local-first in localStorage keyed by
 * the analysis id. No account, no server — the reviewer's triage progress
 * survives reloads for as long as the browser keeps the storage.
 */

const PREFIX = "codecity-reviews:";

export type { ReviewStatus };

export function loadReviews(analysisId: string): Record<string, ReviewStatus> {
  if (typeof window === "undefined" || !analysisId) return {};
  try {
    const raw = window.localStorage.getItem(PREFIX + analysisId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReviewStatus>;
    // Drop anything that is not a valid status — storage may predate a schema
    const clean: Record<string, ReviewStatus> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "reviewed" || v === "false-positive" || v === "to-fix") clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveReviews(analysisId: string, reviews: Record<string, ReviewStatus>): void {
  if (typeof window === "undefined" || !analysisId) return;
  try {
    window.localStorage.setItem(PREFIX + analysisId, JSON.stringify(reviews));
  } catch {
    // Storage full / disabled — triage state simply stays session-only
  }
}

/** Stable per-analysis key for one finding (index within its file's list). */
export function findingKey(fileId: string, index: number): string {
  return `${fileId}#${index}`;
}
