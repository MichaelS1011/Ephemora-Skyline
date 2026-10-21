/**
 * The large-folder preview.
 *
 * A folder above the full-read cap used to end in an error: "open a subfolder".
 * That is a closed door for monorepos, and the door hid the shape of the thing
 * the person wanted to look at. A preview takes a balanced sample instead — one
 * pass across the top-level districts, not the first 2,000 files of the first
 * folder — and the announcement names what was read and what was not.
 *
 * The sample is sized to stay a preview, not a smaller full scan: 2,000 source
 * files and 60 MB. A top-level directory with 8,000 files and one with 12 both
 * appear in the city; the city is not the whole repository, and it never claims
 * to be.
 */
import { MAX_FILES, MAX_TOTAL_BYTES, type Candidate, type FolderPlan } from "../useLocalAnalysis";

export const PREVIEW_SAMPLE_FILES = 2_000;
export const PREVIEW_SAMPLE_BYTES = 60 * 1024 * 1024;

const topOf = (rel: string): string => {
  const slash = rel.indexOf("/");
  return slash === -1 ? "." : rel.slice(0, slash);
};

/**
 * Round-robin across the top-level folders, so a sample is a cross-section of
 * the repository rather than its alphabetically first district. Git metadata is
 * carried along untouched: it is the history branch of the scan, not a source
 * file competing for the sample budget.
 */
export function buildPreviewSample(
  candidates: Candidate[],
  fileBudget: number,
  byteBudget: number,
): { picked: Candidate[]; sampledFiles: number; sampledBytes: number; districts: number } {
  const git = candidates.filter((c) => c.git);
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    if (candidate.git) continue;
    const key = topOf(candidate.rel);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const cursors = new Map(keys.map((key) => [key, 0]));
  const picked: Candidate[] = [];
  let sampledBytes = 0;
  let full = false;

  while (!full && picked.length < fileBudget) {
    let progressed = false;
    for (const key of keys) {
      if (picked.length >= fileBudget || sampledBytes >= byteBudget) {
        full = true;
        break;
      }
      const group = groups.get(key)!;
      let i = cursors.get(key)!;
      // Skip a file that would cross the byte budget; a later, smaller file in
      // the same district may still fit. Every cursor moves forward once.
      while (i < group.length && sampledBytes + group[i]!.file.size > byteBudget) i += 1;
      cursors.set(key, i);
      if (i >= group.length) continue;
      const candidate = group[i]!;
      picked.push(candidate);
      sampledBytes += candidate.file.size;
      cursors.set(key, i + 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  return {
    picked: [...git, ...picked],
    sampledFiles: picked.length,
    sampledBytes,
    districts: groups.size,
  };
}

/**
 * Replace a plan's candidate list with a balanced sample when the folder crosses
 * the full-read walls. Returns false when the plan is small enough for a full
 * read (or nothing could be sampled), in which case the caller keeps its old
 * path — including the honest over-cap error.
 */
export function applyPreview(
  plan: FolderPlan,
  fileBudget = PREVIEW_SAMPLE_FILES,
  byteBudget = PREVIEW_SAMPLE_BYTES,
): boolean {
  if (plan.found <= MAX_FILES && plan.bytes <= MAX_TOTAL_BYTES) return false;
  const sample = buildPreviewSample(plan.candidates, fileBudget, byteBudget);
  if (sample.sampledFiles === 0) return false;
  plan.preview = {
    totalFiles: plan.found,
    totalBytes: plan.bytes,
    sampledFiles: sample.sampledFiles,
    sampledBytes: sample.sampledBytes,
    districts: sample.districts,
  };
  plan.dropped.preview = Math.max(0, plan.found - sample.sampledFiles);
  plan.candidates = sample.picked;
  plan.found = sample.sampledFiles;
  plan.bytes = sample.sampledBytes;
  plan.overCap = false;
  return true;
}
