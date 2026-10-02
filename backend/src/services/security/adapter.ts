import type { SecurityIssue } from "../../models/index.js";

export interface ScannerAdapter {
  readonly id: string;
  scanFile(filePath: string, content: string): Promise<SecurityIssue[]> | SecurityIssue[];
  scanBatch?(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[]>;
  scanSingleContent?(filePath: string, content: string): Promise<SecurityIssue[]>;
}

export type AdapterResult = {
  issues: SecurityIssue[];
  provenance: string;
};

/**
 * The key contract of every batch adapter.
 *
 * The tools all run with their source at the clone root (gitleaks
 * `--source <clonePath>`, ruff/semgrep/osv likewise) and echo ABSOLUTE paths
 * back in their report. scanner.ts merges batch findings by the repo-relative
 * path the analyzer recorded — so an unstripped absolute key never matches and
 * the finding silently disappears, with no error anywhere to show it.
 *
 * Anything outside the scan root returns undefined: a tool can name a path the
 * analyzer never saw, and a finding nobody can look up is noise at best.
 */
export function relativeToClone(
  clonePath: string,
  reported: string | undefined,
): string | undefined {
  if (!reported) return undefined;
  const norm = reported.replaceAll("\\", "/");
  const root = clonePath.endsWith("/") ? clonePath.slice(0, -1) : clonePath;
  return norm.startsWith(root + "/") ? norm.slice(root.length + 1) : undefined;
}
