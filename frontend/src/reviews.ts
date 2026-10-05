import type { ReviewStatus } from "./city/types";
import { getWorkspaceRoot } from "./editor/deepLink";

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
 *
 * `owner/name` alone was not enough. A local scan hard-codes the owner to
 * `local` and names the folder's basename, so `proj-a/backend` and
 * `proj-b/backend` shared one bucket and each one's verdicts surfaced as the
 * other's. Callers pass what tells the two apart: the project root when the
 * person configured one, otherwise the folder's top-level shape. With no hints
 * the value is the one stored before this existed, so old verdicts keep reading.
 */
export function projectKey(
  repo: { owner: string; name: string },
  hints?: { root?: string; shape?: string[] },
): string {
  const distinguishing = hints?.root
    ? `|root:${hints.root}`
    : hints?.shape?.length
      ? `|shape:${hints.shape.join(",")}`
      : "";
  const input = `${repo.owner}/${repo.name}${distinguishing}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  return `p-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/** The picked folder's top-level directory names, sorted — what two folders sharing a basename differ by. */
export function projectShape(city?: { tree?: { children?: Array<{ name?: string }> } }): string[] {
  return [
    ...new Set((city?.tree?.children ?? []).map((d) => d?.name ?? "").filter(Boolean)),
  ].sort();
}

/**
 * The bucket a city's verdicts belong to.
 *
 * A configured project root wins, because a path does not change when the code
 * in it does; the folder's top-level shape is the fallback and is a guess —
 * adding a top-level directory moves the bucket, and a folder with no
 * subdirectories at all falls back to the name-only key. `bucketKeyFor` reads
 * the root stored under the plaintext `owner/name` that the editor deep link
 * already uses, so a configured "open in editor" path survives unchanged.
 */
export function bucketKeyFor(city?: {
  repo: { owner: string; name: string };
  tree?: { children?: Array<{ name?: string }> };
}): string {
  if (!city) return "";
  const root = getWorkspaceRoot(`${city.repo.owner}/${city.repo.name}`);
  return projectKey(city.repo, { root, shape: projectShape(city) });
}

/**
 * Read a city's verdicts, carrying forward the ones recorded while the bucket
 * was named after the folder alone. Without this the fix would strand every
 * verdict already on the machine; with it, the first re-scan adopts them.
 */
export function loadReviewsForCity(city?: {
  repo: { owner: string; name: string };
  tree?: { children?: Array<{ name?: string }> };
}): Record<string, ReviewStatus> {
  const key = bucketKeyFor(city);
  if (!key || !city) return {};
  const reviews = loadReviews(key);
  if (Object.keys(reviews).length > 0) return reviews;
  const legacyKey = projectKey(city.repo);
  if (legacyKey === key) return reviews;
  const legacy = loadReviews(legacyKey);
  if (Object.keys(legacy).length === 0) return reviews;
  saveReviews(key, legacy);
  return legacy;
}

/**
 * Whether the project's identity is a guess.
 *
 * Without a configured root the bucket rests on the folder's basename plus its
 * top-level shape — good enough to tell two `backend` folders apart, but it is
 * still inferred, and the reader is the only one who knows whether this is the
 * project they meant. Saying so is cheaper than letting a triage look lost.
 */
export function identityIsGuessed(city?: { repo: { owner: string; name: string } }): boolean {
  if (!city) return false;
  return getWorkspaceRoot(`${city.repo.owner}/${city.repo.name}`) === "";
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
