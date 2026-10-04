import type { ReviewStatus } from "./city/types";

/**
 * Per-finding review states, persisted local-first in localStorage keyed by
 * the PROJECT (`projectKey`) and, inside it, by each finding's fingerprint.
 * No account, no server — a verdict survives reloads and re-scans of the same
 * folder for as long as the browser keeps the storage.
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

/**
 * The key a verdict is stored under.
 *
 * A finding that carries a fingerprint is keyed by it, so the same finding in a
 * later scan of the same project reads back the same verdict. Findings from a
 * payload that predates fingerprints keep the positional key — and stay where
 * they are, because a scan of the old payload resolves it the same way.
 */
export function reviewKeyFor(
  file: { id: string },
  index: number,
  finding?: { fingerprint?: string },
): string {
  return finding?.fingerprint ? `fp:${finding.fingerprint}` : findingKey(file.id, index);
}

/**
 * Which project a review bucket belongs to.
 *
 * Hashed rather than plain `owner/name` because localStorage on a synced
 * browser profile would otherwise publish the names of everything a person has
 * scanned. This is obfuscation, not protection: anyone who can read the storage
 * can also guess a folder name. What it does guarantee is that nothing in the
 * key is human-readable by default.
 */
export function projectKey(repo: { owner: string; name: string }): string {
  const input = `${repo.owner}/${repo.name}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  return `p-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/**
 * Verdicts stored under an older, per-scan key that the current project bucket
 * cannot reach. Reported so the panel can say "these exist and did not carry
 * over" instead of looking like the reviewer never triaged anything.
 */
export function countOrphanedReviews(currentKey: string): number {
  if (typeof window === "undefined") return 0;
  let total = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX) || key === PREFIX + currentKey) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, ReviewStatus>;
      total += Object.keys(parsed).length;
    }
  } catch {
    return 0;
  }
  return total;
}
