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
