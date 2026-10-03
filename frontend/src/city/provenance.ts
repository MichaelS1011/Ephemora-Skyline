import type { ScanProvenance } from "./types";

/**
 * What the scan can honestly claim.
 *
 * "no findings" is a security statement, and the summary carries the proof
 * of how deep the scan actually went: without an engine the file was only
 * read by the regex baseline. Kept out of the component so the rule can be
 * tested without a canvas.
 */
export type ScanVerdict =
  | { kind: "findings" }
  | { kind: "clear" }
  /** zero findings, but engines that could have contributed did not run */
  | { kind: "shallow"; missing: string[] }
  /** the result carries no provenance at all — nothing to vouch for */
  | { kind: "unknown" };

/**
 * Engines a clean result needs, and the language surface that makes each one
 * a right to complain about. Naming ruff on a TypeScript-only repo would be
 * noise, not honesty.
 */
const SECURITY_ENGINES: { key: keyof ScanProvenance; label: string; needs?: RegExp }[] = [
  { key: "gitleaks", label: "gitleaks" },
  { key: "semgrep", label: "semgrep" },
  { key: "dependencies", label: "npm audit", needs: /^(JavaScript|TypeScript)$/ },
  { key: "ruff", label: "ruff", needs: /^Python$/ },
  { key: "osv", label: "osv-scanner", needs: /^Python$/ },
];

/**
 * "one file kept out" and "49 files kept out" are different statements about
 * the same scan, and the count is what the user weighs. Both panels read this
 * so the wording cannot drift apart between them.
 */
export function describeGitignoreSkips(skipped?: { files: number; directories: number }): string {
  if (!skipped) return "";
  const parts: string[] = [];
  if (skipped.files > 0)
    parts.push(`${skipped.files.toLocaleString()} ${skipped.files === 1 ? "file" : "files"}`);
  if (skipped.directories > 0)
    parts.push(
      `${skipped.directories.toLocaleString()} ${skipped.directories === 1 ? "folder" : "folders"}`,
    );
  return parts.join(" and ");
}

export function scanVerdict(
  provenance: ScanProvenance | undefined,
  findingsTotal: number,
  languages: Record<string, number>,
): ScanVerdict {
  if (findingsTotal > 0) return { kind: "findings" };
  if (!provenance) return { kind: "unknown" };
  const present = Object.keys(languages);
  const missing = SECURITY_ENGINES.filter((e) => !e.needs || present.some((l) => e.needs!.test(l)))
    .filter((e) => provenance[e.key] !== true)
    .map((e) => e.label);
  return missing.length > 0 ? { kind: "shallow", missing } : { kind: "clear" };
}
