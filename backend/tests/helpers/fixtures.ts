import type { AnalysisResult, FileAnalysis } from "../../src/models/index.js";

/**
 * Shared FileAnalysis / AnalysisResult builders for the backend test tree.
 *
 * Until now a dozen test files carried their own `file(` / `makeFile(` /
 * `makeResult(` copy, each writing the same boilerplate (the empty
 * `functions`/`classes`/`imports`/`exports` arrays, the severity buckets) with
 * its own private defaults. A model change had to be re-typed through all of
 * them. These two builders write every required field with an honest value and
 * let the caller override what its case is about — no `as unknown as`, so a new
 * required field in `models/index.ts` stops this file compiling instead of
 * falling through a cast.
 *
 * The defaults are the smallest honest shape, not a shortcut: a file of one
 * code line, complexity 1, no findings; a result whose totals are counted from
 * the files it holds. A test that asserts on a number declares that number in
 * its own file through the overrides, and a case that needs a deliberately
 * wrong or imprecise field (a non-standard summary, a carried `content`, an
 * `as never`-shaped result) stays hand-built — the builder must not swallow
 * those.
 *
 * File name: `fixtures.ts`, deliberately WITHOUT a `.test.ts` suffix. The
 * vitest include pattern collects only `*.test.ts`, so a helper here must not
 * move the suite's published test-file count.
 */

/** A complete, honest `FileAnalysis`; `path` is required, overrides win. */
export function makeFile(overrides: Partial<FileAnalysis> & { path: string }): FileAnalysis {
  return {
    language: "TypeScript",
    lines: { total: 1, code: 1, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: [],
    ...overrides,
  };
}

/** A complete `AnalysisResult` whose summary is counted from `files`. */
export function makeResult(
  files: FileAnalysis[],
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult {
  return {
    id: "scan-1",
    repo: { owner: "local", name: "local", branch: "main", cloneUrl: "", analyzedAt: "" },
    files,
    directories: [],
    summary: {
      totalFiles: files.length,
      totalDirectories: 0,
      totalLines: files.reduce((s, f) => s + f.lines.total, 0),
      avgCyclomatic: 1,
      maxCyclomatic: 1,
      languages: {},
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
      languagesByLines: {},
    },
    createdAt: new Date().toISOString(),
    status: "complete",
    ...overrides,
  };
}
