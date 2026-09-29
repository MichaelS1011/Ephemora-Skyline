/**
 * duplicates — Copy-paste detection over the analyzed file set.
 *
 * Sliding-window hashing: normalize every line, hash 6-line windows, and
 * count how often each window hash co-occurs in two files. Files sharing
 * at least MIN_CLONE_LINES identical normalized lines are reported as
 * clone partners. Cheap (one pass, pair counting only for shared hashes)
 * and deterministic — no external tooling needed.
 */

const MIN_CLONE_LINES = 6;
/** Window buckets larger than this are boilerplate (license headers etc.) */
const MAX_BUCKET = 24;
/** Clone partners kept per file */
const PARTNERS_PER_FILE = 3;

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function hashWindow(lines: string[]): string {
  // FNV-1a over the joined normalized window
  let h = 2166136261;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x1f; // line separator
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface ClonePair {
  a: string;
  b: string;
  /** Number of shared normalized 6-line windows (≈ duplicated lines) */
  lines: number;
}

export interface DuplicateResult {
  byPath: Map<string, Array<{ path: string; lines: number }>>;
  pairs: ClonePair[];
}

/**
 * @param contents — path → raw file content, only analyzed files
 */
export function detectDuplicates(contents: Map<string, string>): DuplicateResult {
  // window hash → files containing it (dedup per file via Set semantics)
  const buckets = new Map<string, string[]>();
  for (const [filePath, content] of contents) {
    const lines = content.split("\n").map(normalizeLine);
    if (lines.length < MIN_CLONE_LINES) continue;
    const seen = new Set<string>();
    for (let i = 0; i + MIN_CLONE_LINES <= lines.length; i++) {
      const h = hashWindow(lines.slice(i, i + MIN_CLONE_LINES));
      if (seen.has(h)) continue;
      seen.add(h);
      const bucket = buckets.get(h);
      if (bucket) {
        if (bucket.length < MAX_BUCKET) bucket.push(filePath);
      } else {
        buckets.set(h, [filePath]);
      }
    }
  }

  // Co-occurrence counting per pair
  const pairCounts = new Map<string, number>();
  const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const key = pairKey(bucket[i]!, bucket[j]!);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const byPath = new Map<string, Array<{ path: string; lines: number }>>();
  const pairs: ClonePair[] = [];
  for (const [key, count] of pairCounts) {
    if (count < MIN_CLONE_LINES) continue;
    const [a, b] = key.split("\u0000");
    if (!a || !b) continue;
    pairs.push({ a, b, lines: count });
    const listA = byPath.get(a) ?? [];
    listA.push({ path: b, lines: count });
    byPath.set(a, listA);
    const listB = byPath.get(b) ?? [];
    listB.push({ path: a, lines: count });
    byPath.set(b, listB);
  }

  // Top partners per file, deterministic (lines desc, then path)
  for (const list of byPath.values()) {
    list.sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
    list.length = Math.min(list.length, PARTNERS_PER_FILE);
  }
  pairs.sort((x, y) => y.lines - x.lines || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  return { byPath, pairs };
}
