import type { Response } from "express";

/**
 * The one answer every finished-view route gives for a scan that is still
 * running. `/api/result/:id` has always said `pending`; the derived views did
 * not — they mapped the `analyzing` skeleton and served it as if it were a
 * finished city: an empty world, an empty SARIF run, an empty handoff. A
 * permalink opened mid-scan rendered a real-looking zero instead of waiting.
 * `409 still_analyzing` is the same truth the status route tells, in the
 * language of "come back when it is done" — `Retry-After` says when.
 *
 * This lives in its own module, not beside the result routes, because the
 * agent channel imports the guard and its surface test (`agenten-06-channel-
 * surface.test.ts`) pins exactly which modules its handlers may reach: the
 * guard must not drag the city mapper and the SARIF writer into a channel
 * that promises to write nothing.
 */
export function replyStillAnalyzing(res: Response): void {
  res.status(409).set("Retry-After", "5").json({
    error: "Analysis still running — poll /api/status/:id and ask again when it is done",
    code: "still_analyzing",
  });
}

/**
 * True when the scan exists but has not finished; answers for the caller.
 * `unknown` on purpose: verdicts stores results loosely, and forcing a cast
 * at each call site would hide exactly the field this check reads.
 */
export function guardStillAnalyzing(result: unknown, res: Response): boolean {
  if (!result || typeof result !== "object") return false;
  if ((result as { status?: unknown }).status !== "analyzing") return false;
  replyStillAnalyzing(res);
  return true;
}
