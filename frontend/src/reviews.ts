import type { ReviewStatus } from "./city/types";
import { getWorkspaceRoot } from "./editor/deepLink";
import { readStoredJson, type StoredRead } from "./storageRead";

/**
 * Per-finding review states, persisted local-first in localStorage keyed by
 * the PROJECT (`projectKey`) and, inside it, by each finding's fingerprint.
 * No account, no server — a verdict survives reloads and re-scans of the same
 * folder for as long as the browser keeps the storage.
 */

const PREFIX = "codecity-reviews:";

export type { ReviewStatus };

/**
 * The browser bucket as three states — the one mechanism of `storageRead.ts`,
 * per project bucket. Corrupt bytes answer `unreadable` and are kept verbatim
 * under `<key>:unreadable`; the next `saveReviews` may rewrite the live key,
 * it never touches that slot. That closes the door this loader had: the same
 * case the saved pack selection had, one bucket further down the machine.
 *
 * Dropping statuses a newer schema rejected stays a `read` — honouring is
 * not refusing; only bytes the shape rule cannot run over at all refuse.
 */
export function loadReviewsRead(analysisId: string): StoredRead<Record<string, ReviewStatus>> {
  if (typeof window === "undefined" || !analysisId) return { state: "absent" };
  return readStoredJson<Record<string, ReviewStatus>>(PREFIX + analysisId, (parsed) =>
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? cleanReviews(parsed)
      : undefined,
  );
}

export function loadReviews(analysisId: string): Record<string, ReviewStatus> {
  const stored = loadReviewsRead(analysisId);
  return stored.state === "read" ? stored.value : {};
}

/**
 * Write a project's verdicts.
 *
 * Returns whether the storage accepted them. A full quota used to be swallowed
 * here (`catch {}`), so a day of triage could die with the tab while the screen
 * still looked saved. The caller is the one place that knows what to say about
 * it (`useStore.setReview` → `verdictsBlocked`).
 */
export function saveReviews(analysisId: string, reviews: Record<string, ReviewStatus>): boolean {
  if (typeof window === "undefined" || !analysisId) return false;
  try {
    window.localStorage.setItem(PREFIX + analysisId, JSON.stringify(reviews));
    return true;
  } catch {
    // Storage full or disabled — the verdicts live in this session only
    return false;
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
 *
 * The three-state door. A corrupt bucket whose legacy copy still answers is
 * `read` of the rescued map — nothing was lost, no word is owed, and the
 * corrupt bytes are quarantined before the adoption write touches the live
 * key. Only a failed read with nothing to rescue from is `unreadable`, and
 * that is the fact the panel's verdict note carries.
 */
export function loadReviewsForCityRead(city?: {
  repo: { owner: string; name: string };
  tree?: { children?: Array<{ name?: string }> };
}): StoredRead<Record<string, ReviewStatus>> {
  const key = bucketKeyFor(city);
  if (!key || !city) return { state: "absent" };
  const primary = loadReviewsRead(key);
  if (primary.state === "read" && Object.keys(primary.value).length > 0) return primary;
  const legacyKey = projectKey(city.repo);
  if (legacyKey === key) return primary;
  const legacy = loadReviewsRead(legacyKey);
  if (legacy.state === "read" && Object.keys(legacy.value).length > 0) {
    saveReviews(key, legacy.value);
    return legacy;
  }
  return primary;
}

export function loadReviewsForCity(city?: {
  repo: { owner: string; name: string };
  tree?: { children?: Array<{ name?: string }> };
}): Record<string, ReviewStatus> {
  const stored = loadReviewsForCityRead(city);
  return stored.state === "read" ? stored.value : {};
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
 *
 * Resolution mirrors `reviewKeyFor`: a key matches when a finding carries the
 * fingerprint (`fp:<fp>`) or, for payloads without fingerprints, when it is
 * the positional key of a file (`<fileId>#<index>`) the city still holds. The
 * first version counted every positional key as stranded, so a payload without
 * fingerprints reported its own matched verdicts as orphans — the S-P4 tally
 * would have counted the same verdict twice (once judged, once stranded).
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
      for (let i = 0; i < o.findings.length; i++) {
        const v = o.findings[i] as { fingerprint?: string } | undefined;
        if (typeof o.id === "string" && o.id) getragen.add(findingKey(o.id, i));
        if (v?.fingerprint) getragen.add(`fp:${v.fingerprint}`);
      }
    }
    for (const v of Object.values(o)) stack.push(v);
  }
  let stranded = 0;
  for (const key of Object.keys(reviews)) {
    if (!getragen.has(key)) stranded++;
  }
  return stranded;
}

/* ── Machine-local copy ──────────────────────────────────────────────────────
   The browser's own storage is one copy of the verdicts, and the one the
   screen reads synchronously. The machine copy — one JSON file the local
   backend owns, keyed by the SAME projectKey — is what makes a verdict survive
   a backend restart and a re-scan even when this browser profile is gone, and
   what gives the agent channel its read-only view. The key is derived here and
   only here; the backend stores it opaquely. */

const verdictsRoute = (analysisId: string): string =>
  `/api/result/${encodeURIComponent(analysisId)}/verdicts`;

/**
 * What asking the machine copy for its verdicts can answer.
 *
 * `read` — the file answered; the map is what it holds, and an empty map is a
 * real answer ("nothing judged yet"). `absent` — the backend did not answer, or
 * this scan is not known to it: the browser copy stands alone, exactly as before
 * the route existed. `unreadable` — the route answered 503 with the body code
 * `verdicts_unreadable`: the file is there and its bytes cannot be read.
 * Reading that as `absent` is the failure this function used to have: the person
 * who triaged forty findings yesterday got a city that looked unreviewed, and
 * the delete door stayed open over bytes that might still be recoverable.
 */
export type VerdictRead =
  | { state: "read"; reviews: Record<string, ReviewStatus> }
  | { state: "absent" }
  | { state: "unreadable" };

/**
 * Latched by a read that came back unreadable and cleared by one that did not.
 * It is what closes the write doors for the rest of the visit — the same fact
 * the backend enforces on disk, applied on the side that has to stop asking.
 */
let machineCopyUnreadable = false;

/**
 * The machine copy for a scan, asked by the project bucket this browser
 * derived.
 */
export async function fetchBackendReviews(
  analysisId: string,
  project: string,
): Promise<VerdictRead> {
  if (!analysisId || !project) return { state: "absent" };
  try {
    const res = await fetch(`${verdictsRoute(analysisId)}?project=${encodeURIComponent(project)}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 503) {
      // Only the code the store itself names is read as a broken file: a 503
      // from something else in front of it is a server that is not answering,
      // and saying "your verdicts could not be read" about that would be a new
      // alarm with no evidence behind it.
      const code = await res
        .json()
        .then((b) => (b as { code?: unknown } | undefined)?.code)
        .catch(() => undefined);
      if (code === "verdicts_unreadable") {
        machineCopyUnreadable = true;
        return { state: "unreadable" };
      }
      return { state: "absent" };
    }
    if (!res.ok) return { state: "absent" };
    const body = (await res.json()) as { reviews?: Record<string, ReviewStatus> };
    machineCopyUnreadable = false;
    return { state: "read", reviews: cleanReviews(body.reviews) };
  } catch {
    return { state: "absent" };
  }
}

function cleanReviews(raw: unknown): Record<string, ReviewStatus> {
  const clean: Record<string, ReviewStatus> = {};
  if (!raw || typeof raw !== "object") return clean;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "reviewed" || v === "false-positive" || v === "to-fix") clean[k] = v;
  }
  return clean;
}

/**
 * Write the full map through to the machine copy, serialized so two quick
 * verdicts cannot land out of order. Failures are tolerated: the browser copy
 * still holds the verdict, and the next load adopts and re-pushes it. While the
 * copy answers unreadable nothing is sent at all — the backend refuses to write
 * over a file it could not read, so asking repeatedly would only dress a refused
 * write up as a saved one.
 */
let verdictWriteChain: Promise<void> = Promise.resolve();

export function pushBackendReviews(
  analysisId: string,
  project: string,
  reviews: Record<string, ReviewStatus>,
): void {
  if (!analysisId || !project || machineCopyUnreadable) return;
  const body = JSON.stringify({ project, reviews });
  verdictWriteChain = verdictWriteChain
    .then(() =>
      fetch(verdictsRoute(analysisId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    )
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * The entry screen's "delete my verdicts" clears the machine copy too.
 *
 * Returns whether the door was used. While the last read answered
 * `verdicts_unreadable` it is not: a reset writes an empty file, so pressing
 * delete over bytes that cannot currently be listed is how a person's whole
 * triage history becomes unrecoverable — with the screen having just told them
 * there was nothing to find. The browser buckets the button names are still
 * cleared by the caller; only the machine copy is left alone.
 */
export function resetBackendVerdicts(): boolean {
  if (machineCopyUnreadable) return false;
  fetch("/api/verdicts/reset", { method: "POST" }).catch(() => undefined);
  return true;
}
