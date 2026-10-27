/**
 * git-churn — Extracts per-file change-frequency data from a git clone.
 *
 * Runs ONE `git log --numstat` pass while the clone is still alive and
 * derives a normalized churn score per file (commit frequency, change
 * volume, recency). Files in hotspots erode visually; stable files stay
 * smooth granite.
 *
 * Meaningful history requires more than one commit — a --depth=1 clone
 * yields no usable signal, so `meaningful` reports honestly and callers
 * skip the dimension instead of showing fabricated erosion.
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** How much history the churn pass needs before scores are trustworthy. */
const MIN_MEANINGFUL_COMMITS = 2;

/** Normalization ceilings: anything beyond counts as the max factor (1). */
const MAX_COMMITS = 30;
const MAX_CHANGED_LINES = 2000;
const RECENCY_WINDOW_DAYS = 180;

export interface FileChurn {
  commits: number;
  addedLines: number;
  deletedLines: number;
  /**
   * Whole days between `lastCommitAt` and the scan moment — derived from the
   * SAME `now` the dates are read with, so the two can never disagree. It is
   * a snapshot: a city opened hours later from the local index ages with the
   * shelf time, which is why the absolute fields below ship alongside it and
   * every surface quoting this number names its reference moment.
   */
  daysSinceLastCommit: number;
  /** Epoch-ms (integer, second-resolution as git reports it) of the path's earliest commit, rename chains followed */
  firstCommitAt: number;
  /** Epoch-ms of the path's known last commit */
  lastCommitAt: number;
  authors: number;
  /** Developer with the most commits on this file ("author territory") */
  topAuthor?: string;
  /** 0..1 — normalized hotspot score (0.5 commits + 0.3 volume + 0.2 recency) */
  score: number;
}

export interface ChurnResult {
  byPath: Map<string, FileChurn>;
  /** Total commits seen in the available history */
  totalCommits: number;
  /** True when history was deep enough for trustworthy scores */
  meaningful: boolean;
}

interface RawChurn {
  commits: number;
  addedLines: number;
  deletedLines: number;
  firstCommitMs: number;
  lastCommitMs: number;
  /** author → number of commits touching this file */
  authorCommits: Map<string, number>;
}

/** Does this directory look like a git work tree? */
export async function hasGitHistory(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Split a rename path into source and target. Git emits two shapes:
 * "dir/{old => new}/rest" (partial) and "old => new" (full-path).
 */
function parseRename(pathRaw: string): { from?: string; to: string } {
  const brace = /^([^{]*)\{([^{}]*)=>([^{}]*)\}(.*)$/.exec(pathRaw);
  if (brace) {
    const pre = brace[1] ?? "";
    const oldSeg = brace[2] ?? "";
    const newSeg = brace[3] ?? "";
    const post = brace[4] ?? "";
    return {
      from: (pre + oldSeg.trim() + post).trim(),
      to: (pre + newSeg.trim() + post).trim(),
    };
  }
  const arrow = /^(.*)=>(.*)$/.exec(pathRaw);
  if (arrow) return { from: arrow[1]!.trim(), to: arrow[2]!.trim() };
  return { to: pathRaw.trim() };
}

/**
 * Parse one `git log --numstat` numstat line ("added\tdeleted\tpath").
 * Binary files report "-\t-"; renames carry both old and new paths so the
 * caller can merge history forward.
 */
export function parseNumstatLine(
  line: string,
): { path: string; added: number; deleted: number; renamedFrom?: string } | null {
  const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
  if (!m) return null;
  const [, addedRaw, deletedRaw, pathRaw] = m;
  if (!pathRaw) return null;

  const { from, to } = parseRename(pathRaw.trim());
  const added = addedRaw === "-" ? 0 : parseInt(addedRaw ?? "0", 10) || 0;
  const deleted = deletedRaw === "-" ? 0 : parseInt(deletedRaw ?? "0", 10) || 0;
  return { path: to, added, deleted, renamedFrom: from };
}

/**
 * Collect raw per-path churn over all available history.
 *
 * Known limits of this one pass (they describe the git call, not the fields):
 * `--no-merges` never sees a path that only appears on a merged branch, and a
 * deleted file has no entry here because the scan analyses the current tree —
 * a file that was deleted before the scan is simply not in the city.
 */
export async function collectGitChurn(dirPath: string, timeoutMs = 120_000): Promise<ChurnResult> {
  const args = ["-C", dirPath, "log", "--numstat", "--format=%H%x1f%aI%x1f%an", "--no-merges"];
  const { stdout } = await execFileAsync("git", args, {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  const raw = new Map<string, RawChurn>();
  const renameEdges: Array<{ from: string; to: string }> = [];
  let totalCommits = 0;
  let currentCommitMs = 0;
  let currentAuthor = "";

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes("\x1f")) {
      // Commit header: sha\x1fISO-date\x1fauthor
      const [, isoDate, author] = trimmed.split("\x1f");
      totalCommits++;
      if (!isoDate || !author) continue;
      const ts = Date.parse(isoDate);
      if (Number.isNaN(ts)) continue;
      // Header lines carry no numstat — author/date are used per numstat row
      // via the enclosing commit, tracked implicitly below. We register the
      // commit time only when a file row follows (see currentCommitMs).
      currentCommitMs = ts;
      currentAuthor = author;
      continue;
    }

    const row = parseNumstatLine(trimmed);
    if (!row || currentCommitMs === 0) continue;
    let entry = raw.get(row.path);
    if (!entry) {
      entry = {
        commits: 0,
        addedLines: 0,
        deletedLines: 0,
        firstCommitMs: currentCommitMs,
        lastCommitMs: currentCommitMs,
        authorCommits: new Map(),
      };
      raw.set(row.path, entry);
    }
    entry.commits += 1;
    entry.addedLines += row.added;
    entry.deletedLines += row.deleted;
    entry.firstCommitMs = Math.min(entry.firstCommitMs, currentCommitMs);
    entry.lastCommitMs = Math.max(entry.lastCommitMs, currentCommitMs);
    entry.authorCommits.set(currentAuthor, (entry.authorCommits.get(currentAuthor) ?? 0) + 1);

    // Renames are recorded here but merged AFTER parsing: `git log` lists
    // newest-first, so the old path's history is only visible later.
    if (row.renamedFrom && row.renamedFrom !== row.path) {
      renameEdges.push({ from: row.renamedFrom, to: row.path });
    }
  }

  // Merge rename chains oldest-first so a→b→c collapses fully into c.
  for (const { from, to } of [...renameEdges].reverse()) {
    const prev = raw.get(from);
    const cur = raw.get(to);
    if (!prev || !cur || prev === cur) continue;
    cur.commits += prev.commits;
    cur.addedLines += prev.addedLines;
    cur.deletedLines += prev.deletedLines;
    cur.firstCommitMs = Math.min(cur.firstCommitMs, prev.firstCommitMs);
    cur.lastCommitMs = Math.max(cur.lastCommitMs, prev.lastCommitMs);
    for (const [a, n] of prev.authorCommits) {
      cur.authorCommits.set(a, (cur.authorCommits.get(a) ?? 0) + n);
    }
    raw.delete(from);
  }

  const now = Date.now();
  const byPath = new Map<string, FileChurn>();
  for (const [filePath, r] of raw) {
    const commitFactor = Math.min(r.commits / MAX_COMMITS, 1);
    const volumeFactor = Math.min((r.addedLines + r.deletedLines) / MAX_CHANGED_LINES, 1);
    const days = Math.max(0, Math.floor((now - r.lastCommitMs) / 86_400_000));
    const recencyFactor = 1 - Math.min(days / RECENCY_WINDOW_DAYS, 1);
    // Author with the most commits — the file's "territory"
    let topAuthor: string | undefined;
    let topCount = 0;
    for (const [author, n] of r.authorCommits) {
      if (n > topCount) {
        topCount = n;
        topAuthor = author;
      }
    }
    byPath.set(filePath, {
      commits: r.commits,
      addedLines: r.addedLines,
      deletedLines: r.deletedLines,
      // One clock, one moment: the day count is derived from `lastCommitAt`
      // and the same `now` above, so the two fields can never disagree.
      daysSinceLastCommit: days,
      firstCommitAt: r.firstCommitMs,
      lastCommitAt: r.lastCommitMs,
      authors: r.authorCommits.size,
      topAuthor,
      score: 0.5 * commitFactor + 0.3 * volumeFactor + 0.2 * recencyFactor,
    });
  }

  return { byPath, totalCommits, meaningful: totalCommits >= MIN_MEANINGFUL_COMMITS };
}
