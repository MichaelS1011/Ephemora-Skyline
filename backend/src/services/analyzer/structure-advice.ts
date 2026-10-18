/**
 * Structure advice — the city's teaching voice.
 *
 * A 1,200-line file already speaks through the geometry: its tower stands at
 * 23.6 units beside a neighbour's 3.0. Geometry shows the shape; only a
 * sentence explains it. These notes are that sentence — they judge nothing a
 * human did, they name one measurable property of the file and say what
 * splitting it buys. Every threshold here is a plain count over the file the
 * scanner already holds; no parser, no guesswork. The numbers are the file's
 * own: monolith counts every line while the tower counts code lines, so a
 * commented file can stand short and still be named — the two numbers answer
 * different questions and the note always quotes its own.
 *
 * They are NOT findings. The first cut of this module emitted them through
 * the scanner and the self-scan answered 38 → 122 — 76 grey advice lines on
 * top of the 38 real ones, which buries the queue the product exists for.
 * A note belongs on the card of the building you opened, not in the triage
 * count of a city you did not ask a lecture about. So this module returns
 * plain notes; the orchestrator hangs them on the file record and the card
 * speaks them in the UI language.
 */

export interface FileStructureMetrics {
  /** total lines in the file */
  lines: number;
  /** length of the longest single line, in characters */
  longestLine: number;
  /** estimated cyclomatic complexity of the whole file */
  cyclomatic: number;
}

/** A file past this many lines is hard to review, test and reason about at once. */
export const MONOLITH_LINES = 500;
/** Branch count past this number cannot be read in one sitting. */
export const DEEP_FUNCTION_BRANCHES = 50;
/** A line past this many characters forces horizontal reading. */
export const LONG_LINE_CHARS = 300;

export type StructureNote =
  | { kind: "monolith"; value: number }
  | { kind: "deep"; value: number }
  | { kind: "longline"; value: number };

export function structureNotes(m: FileStructureMetrics): StructureNote[] {
  const out: StructureNote[] = [];
  if (m.lines > MONOLITH_LINES) out.push({ kind: "monolith", value: m.lines });
  if (m.cyclomatic > DEEP_FUNCTION_BRANCHES) out.push({ kind: "deep", value: m.cyclomatic });
  if (m.longestLine > LONG_LINE_CHARS) out.push({ kind: "longline", value: m.longestLine });
  return out;
}
