/**
 * Cross-provenance dedup for scanner findings — extracted as a pure function
 * so the merge contract is directly unit-testable.
 */

import type { SecurityIssue } from "../../models/index.js";

export const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;

/**
 * The one order findings are merged and read in: severity P0 > P1 > P2 first,
 * then ascending line; exact ties compare 0 so a stable sort keeps arrival
 * order. This is the single owner of that decision in the security services —
 * dedup's first pass and every re-sort of merged adapter output call it.
 */
export function compareBySeverityThenLine(a: SecurityIssue, b: SecurityIssue): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line;
}

/**
 * Dedup across provenances: identical findings (same line+type+ruleId) are
 * dropped, as are duplicate detections of the same line+type by different
 * scanners (e.g. regex XSS + semgrep XSS on the same line) — the first
 * (higher-priority) finding wins. Fallback secrets on a line that real
 * gitleaks already flagged are also dropped.
 */
export function dedupIssues(issues: SecurityIssue[]): SecurityIssue[] {
  const seen = new Set<string>();
  const seenLineType = new Set<string>();
  const gitleaksLines = new Set<string>();
  for (const i of issues) {
    if ((i as unknown as { provenance?: string }).provenance === "gitleaks") {
      gitleaksLines.add(`${i.line}`);
    }
  }
  // first pass: highest severity first so P0 provenance wins dedup
  const sorted = [...issues].sort(compareBySeverityThenLine);
  const result: SecurityIssue[] = [];
  for (const i of sorted) {
    const ruleId = (i as unknown as { ruleId?: string }).ruleId ?? "";
    const k = `${i.historyCommit ?? "working"}:${i.line}:${i.type}:${ruleId}`;
    if (seen.has(k)) continue;
    const fallbackSecret =
      i.type === "HARDCODED_SECRET" &&
      (ruleId === "gitleaks:generic-api-key" ||
        (i as unknown as { provenance?: string }).provenance === "gitleaks-fallback");
    if (fallbackSecret && gitleaksLines.has(`${i.line}`)) continue;
    const lt = `${i.historyCommit ?? "working"}:${i.line}:${i.type}`;
    if (seenLineType.has(lt) && ruleId !== "HARDCODED_SECRET") {
      // same line+type from another scanner — keep the first (better) one
      continue;
    }
    seen.add(k);
    seenLineType.add(lt);
    result.push(i);
  }
  return result;
}
