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
 * Verdicts in this project's bucket that no finding in the city on screen
 * carries any more.
 *
 * That is what actually happens after a rename or a rewrite: the fingerprint
 * moves, the verdict stays behind, and nothing about it is visible — the panel
 * reads as if the person had never triaged. Reported so the panel can say it,
 * rather than letting the work look lost or the count look right.
 */
export function countStrandedVerdicts(
  reviews: Record<string, ReviewStatus>,
  city: unknown,
): number {
  const getragen = new Set<string>();
  const stack: unknown[] = [city];
  const gesehen = new WeakSet<object>();
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object" || gesehen.has(n as object)) continue;
    gesehen.add(n as object);
    if (Array.isArray(n)) {
      for (const k of n) stack.push(k);
      continue;
    }
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.findings)) {
      for (const v of o.findings as { fingerprint?: string }[]) {
        if (v?.fingerprint) getragen.add(v.fingerprint);
      }
    }
    for (const v of Object.values(o)) stack.push(v);
  }
  let stranded = 0;
  for (const key of Object.keys(reviews)) {
    if (key.startsWith("fp:") ? !getragen.has(key.slice(3)) : true) stranded++;
  }
  return stranded;
}
