import type { VoxelSectionSpec } from "../city/voxels";
import type { CityFile, CityFinding } from "../city/types";

/**
 * The decisions the file panel makes about a source view, kept apart from the
 * panel that renders them, because these are the part with a right answer: which
 * line falls in which section, which windows of a file are worth loading, when an
 * auto-fetch may start, and whether a focus key points here at all.
 *
 * Tested in tests/sourceView.test.ts against these functions, not against a
 * rendered copy of them.
 */

/* ── Source-view helpers (pure — tested in tests/sourceView.test.ts) ───── */

/** A section paired with the findings whose lines fall inside its range. */
export interface SectionWithFindings {
  section: VoxelSectionSpec;
  findings: CityFinding[];
}

/**
 * Assign findings to the code sections their line falls into (1-based,
 * inclusive ranges; first matching section in input order wins). Findings
 * outside every section are collected into one trailing implicit module
 * section spanning the lines they occupy.
 */
export function findingsBySection(
  sections: VoxelSectionSpec[],
  findings: CityFinding[],
): SectionWithFindings[] {
  const result: SectionWithFindings[] = sections.map((section) => ({ section, findings: [] }));
  const outside: CityFinding[] = [];
  for (const finding of findings) {
    if (finding.historyCommit || finding.provenance === "gitleaks-history") continue;
    const idx = sections.findIndex((s) => finding.line >= s.start && finding.line <= s.end);
    if (idx >= 0) result[idx]!.findings.push(finding);
    else outside.push(finding);
  }
  if (outside.length > 0) {
    const start = Math.min(...outside.map((f) => f.line));
    const end = Math.max(...outside.map((f) => f.line));
    result.push({
      section: { name: "(module)", kind: "module", start, end, codeLines: 0, depth: 0 },
      findings: outside,
    });
  }
  return result;
}

/** A source line tagged for the source view — finding lines render flagged. */
export interface SourceLineView {
  text: string;
  kind: "code" | "finding";
}

/** Mark the source lines a finding flags (finding.line is 1-based). */
export function highlightSourceLines(lines: string[], findings: CityFinding[]): SourceLineView[] {
  const findingLines = new Set(
    findings
      .filter((f) => !f.historyCommit && f.provenance !== "gitleaks-history")
      .map((f) => f.line),
  );
  return lines.map((text, i) => ({
    text,
    kind: findingLines.has(i + 1) ? ("finding" as const) : ("code" as const),
  }));
}

/**
 * Merged, sorted ±context windows (1-based inclusive) around each finding
 * line, clamped to the file bounds — keeps the source view's DOM bounded
 * for huge files.
 */
export function findingContextRanges(
  findings: CityFinding[],
  totalLines: number,
  context: number,
): Array<[number, number]> {
  if (findings.length === 0 || totalLines <= 0) return [];
  const windows = findings
    .filter((f) => !f.historyCommit && f.provenance !== "gitleaks-history")
    .map((f) => [Math.max(1, f.line - context), Math.min(totalLines, f.line + context)] as const)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of windows) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Load lifecycle of the source view (mirrors SourceBlock's internal state). */
export type SourceStatus = "idle" | "loading" | "error" | "ready";

/**
 * Auto-load gate: the fetch may only start on its own when the caller asked
 * for it (triage focus), the block has not started loading yet, and there is
 * an analysis to fetch from. Loading/error/ready deliberately return false —
 * no fetch loop, and a failed auto-load stays behind the manual
 * "Load source" button instead of hammering an offline server.
 */
export function shouldAutoLoad(
  status: SourceStatus,
  analysisId: string | null,
  autoLoad: boolean,
): boolean {
  return autoLoad && status === "idle" && analysisId !== null;
}

/**
 * The triage focus key "fileId#index" split apart — null when malformed.
 * Uses lastIndexOf so file ids that themselves contain "#" still parse.
 */
export function parseFocusedKey(
  key: string | null | undefined,
): { fileId: string; index: number } | null {
  if (!key) return null;
  const hash = key.lastIndexOf("#");
  if (hash <= 0 || hash === key.length - 1) return null;
  const index = Number(key.slice(hash + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { fileId: key.slice(0, hash), index };
}

/** True when the triage focus key points at a finding of this file. */
export function focusBelongsToFile(key: string | null | undefined, fileId: string): boolean {
  const parsed = parseFocusedKey(key);
  return parsed !== null && parsed.fileId === fileId;
}

/**
 * The 1-based source line a focused finding of this file sits on — drives
 * both the SourceBlock scroll target and the breadcrumbs "L{line}" segment.
 * Null when the focus is elsewhere, malformed, or the index has no finding
 * (stale key after a filter change).
 */
export function lineSegmentFor(
  key: string | null | undefined,
  file: Pick<CityFile, "id" | "findings">,
): number | null {
  const parsed = parseFocusedKey(key);
  if (!parsed || parsed.fileId !== file.id) return null;
  const finding = file.findings[parsed.index];
  if (finding?.historyCommit || finding?.provenance === "gitleaks-history") return null;
  return finding?.line ?? null;
}
