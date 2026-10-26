/**
 * MASTER-2027 §03.09 — the read a reader left behind.
 *
 * Measured, not assumed (`unterbrechung-messung.json`, 2026-10-24): a folder read
 * keeps running after its tab is gone. The server answered `analyzing` at
 * reload+307 ms, reached `complete` at reload+4 830 ms, and `GET
 * /api/result/:id/city` then served the city — while the browser held nothing at
 * all (`keysHeld: []`), so the reader came back to an empty start screen and a
 * greeting, with a finished city one address away.
 *
 * So this holds one thing: the id of the read the server is still working on.
 * Not a name, not a path, not a progress value — a job id the landing can ask
 * about once. When the answer is "complete", the reader is offered the city that
 * finished in their absence; when it is "not found", the record is dropped.
 *
 * It cannot resume the read. The folder lives behind a picker only a person can
 * open, so an interrupted read restarts from zero — pretending otherwise would
 * be the false progress §22 forbids. What is recoverable here is only the result
 * the server already produced.
 */

const KEY = "codecity-pending-run:v1";

/** The shape `crypto.randomUUID()` makes on the server (`local-analyze.ts:483`). */
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Note the read the server started.
 *
 * Called the moment the 202 answer names an id — that is the first instant a
 * run exists outside this tab, and the last instant before the tab could die.
 */
export function notePendingRun(id: string): void {
  if (typeof window === "undefined" || !JOB_ID.test(id)) return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // No record: the finished city stays as unreachable as it was before.
  }
}

/**
 * The read left running, if this browser knows of one.
 *
 * A value that is not a job id is read as none, so a hand-edited or synced-in
 * key can never become a path segment in a request the app makes.
 */
export function readPendingRun(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw && JOB_ID.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Forget a read — but only the one named.
 *
 * The guard matters: a late answer from an older run must not delete the record
 * of the run that replaced it, which is the same rule `runRef` enforces in the
 * analysis hook.
 */
export function clearPendingRun(id: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY) === id) window.localStorage.removeItem(KEY);
  } catch {
    // Storage that throws on read throws here too; nothing is claimed.
  }
}
