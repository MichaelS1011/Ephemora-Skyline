/**
 * The delta half of live mode.
 *
 * Pure functions only: given the previous file analyses, the new complete
 * manifest and the files this delta actually re-read, produce the merged file
 * list and the summary that goes with it. The route owns I/O and validation;
 * this module owns the arithmetic, so it can be tested without a repository.
 */
import type { FileAnalysis, LiveScanInfo, ProjectSummary } from "../../models/index.js";

export interface LiveManifestEntry {
  path: string;
  sha: string;
}

/**
 * Engines whose answer survives from the full scan because a live delta does
 * not re-run them. Only engines that actually contributed are named: an engine
 * that was off in the full scan is missing, not stale.
 */
export function liveStaleEngines(provenance: ProjectSummary["scanProvenance"]): string[] {
  const stale: string[] = [];
  const add = (name: string): void => {
    if (!stale.includes(name)) stale.push(name);
  };
  if (provenance?.gitleaks) add("gitleaks");
  if (provenance?.semgrep) add("semgrep");
  if (provenance?.ruff) add("ruff");
  if (provenance?.dependencies) {
    const runner = provenance.dependencyRunner;
    add(
      runner === "osv" || runner === "osv-scanner" || runner === "pip-audit"
        ? runner === "pip-audit"
          ? "pip-audit"
          : "osv-scanner"
        : runner === "npm-audit" || !runner
          ? "npm audit"
          : runner,
    );
  }
  if (provenance?.osv) add("osv-scanner");
  if (provenance?.churn) add("git churn");
  if (provenance?.duplicates) add("duplicate detection");
  if (provenance?.coverage) add("coverage");
  return stale;
}

/**
 * Build the complete file set for a new state.
 *
 * Every path in the manifest is represented exactly once. A re-read file wins
 * over its previous analysis and is marked `liveRefreshed`; every other path
 * keeps its cached analysis. Paths absent from the manifest are gone — their
 * findings leave with them.
 */
export function mergeLiveFiles(
  baseFiles: readonly FileAnalysis[],
  manifest: readonly LiveManifestEntry[],
  refreshed: ReadonlyMap<string, FileAnalysis>,
): FileAnalysis[] {
  const wanted = new Set(manifest.map((entry) => entry.path));
  const merged: FileAnalysis[] = [];
  const seen = new Set<string>();
  for (const file of baseFiles) {
    if (!wanted.has(file.path)) continue;
    const next = refreshed.get(file.path);
    merged.push(next ? { ...next, liveRefreshed: true } : file);
    seen.add(file.path);
  }
  for (const entry of manifest) {
    if (seen.has(entry.path)) continue;
    const next = refreshed.get(entry.path);
    if (!next) continue; // the route rejects this before it reaches us
    merged.push({ ...next, liveRefreshed: true });
    seen.add(entry.path);
  }
  return merged;
}

/**
 * Re-derive every project number from the merged files. The full scan's
 * provenance flags stay: unchanged files still carry gitleaks/semgrep findings
 * from it. What changes is `live` — the timestamp, the delta counts, and the
 * engine names whose answer is now older than the code on screen.
 */
export function summarizeLive(
  base: ProjectSummary,
  files: readonly FileAnalysis[],
  live: LiveScanInfo,
): ProjectSummary {
  const languages: Record<string, number> = {};
  let totalLines = 0;
  let totalVulnerabilities = 0;
  const bySeverity = { P0: 0, P1: 0, P2: 0 };
  let cyclomaticSum = 0;
  let maxCyclomatic = 0;
  for (const file of files) {
    totalLines += file.lines.total;
    languages[file.language] = (languages[file.language] ?? 0) + file.lines.code;
    const cyclomatic = file.complexity?.cyclomatic ?? 1;
    cyclomaticSum += cyclomatic;
    if (cyclomatic > maxCyclomatic) maxCyclomatic = cyclomatic;
    totalVulnerabilities += file.vulnerabilities.length;
    for (const issue of file.vulnerabilities) {
      if (issue.severity === "P0" || issue.severity === "P1" || issue.severity === "P2") {
        bySeverity[issue.severity] += 1;
      }
    }
  }
  return {
    ...base,
    totalFiles: files.length,
    totalLines,
    avgCyclomatic: files.length > 0 ? Math.round((cyclomaticSum / files.length) * 100) / 100 : 0,
    maxCyclomatic,
    languages,
    languagesByLines: languages,
    totalVulnerabilities,
    vulnerabilitiesBySeverity: bySeverity,
    scanProvenance: {
      ...(base.scanProvenance ?? { regex: true, gitleaks: false, semgrep: false }),
      regex: true,
      live,
    },
  };
}
