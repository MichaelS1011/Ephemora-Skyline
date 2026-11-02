/**
 * How many completed cities the link can outlive.
 *
 * The RAM store still answers `/api/health` with its 20/24 h bounds, but the
 * link is no longer a pointer into one process: completed runs are written to
 * `~/.ephemora-skyline/runs` and the newest 20 are kept, so a restart does not
 * kill the address. This sentence asks the server for the archive's own bound
 * instead of reciting a default.
 */
import { formatCount, t, type Lang } from "./i18n";

export interface RunArchiveBounds {
  maxEntries: number;
}

/** Ask the server; a server that does not answer is reported, not guessed at. */
export async function readRunArchiveBounds(): Promise<RunArchiveBounds | null> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return null;
    const body = (await res.json()) as { runArchive?: Partial<RunArchiveBounds> };
    const { maxEntries } = body.runArchive ?? {};
    return typeof maxEntries === "number" && Number.isInteger(maxEntries) && maxEntries > 0
      ? { maxEntries }
      : null;
  } catch {
    return null;
  }
}

export async function cityLinkNotice(lang: Lang): Promise<string> {
  const bounds = await readRunArchiveBounds();
  if (!bounds) return t(lang, "actions.linkCopiedUnknown");
  return t(lang, "actions.linkCopied", { max: formatCount(lang, bounds.maxEntries) });
}
