/**
 * The one city payload builder for the frontend test tree.
 *
 * WHY THIS FILE EXISTS. `frontend/tests/` carried 17 private copies of
 * `function city(...)` plus a few dozen hand-typed `CityFile` / `CityDir`
 * literals. Every payload change had to be re-typed through all of them, and a
 * field that no copy knew about was simply never set: `ScanProvenance.dependencyRunner`
 * went unanswered for days, because no builder had ever heard of it and a cast
 * (`as unknown as CityData`) hid the gap. This file removes the copies and the
 * casts.
 *
 * HOW IT STAYS HONEST. Each builder writes EVERY field of its type — required
 * ones with a value, optional ones with an explicit `undefined` that means "a
 * payload that does not carry this field". The type `Full<T>` below makes that a
 * compile-time requirement, so adding a field to `src/city/types.ts` stops this
 * file compiling until it says what the new field holds. There is no
 * `as unknown as` anywhere: a double cast is exactly the blind spot that let
 * `dependencyRunner` go missing.
 *
 * THE DEFAULTS ARE THE BACKEND'S OWN RULES, NOT SHORTCUTS. Counts are counted
 * from the files a district holds plus what its children declare, `threatLevel`
 * comes from the worst finding, the weighted `threatScore` from the published
 * P0×10 + P1×7 + P2×3, and the city mirrors its root district — all of them as
 * `backend/src/utils/cityMapper.ts` does. Optional counters are written only
 * when they are non-zero, because "this folder holds no test files" and "the
 * payload predates the counter" must not be two claims wearing the same number.
 *
 * A test that asserts on a number DECLARES that number in its own file: the
 * overrides exist for that, and a case which needs a deliberately wrong or
 * imprecise field stays hand-built. Those are the cases the builder must not
 * swallow.
 *
 * FILE NAME: `cityFixture.ts`, deliberately WITHOUT a `.test.ts` suffix. The
 * vitest include pattern is `tests/**\/*.{test,spec}.{ts,tsx}`, so anything
 * ending in `.test.ts` here would be collected as a test file and counted as
 * one — and the published test-file numbers in README and CONTRIBUTING are
 * walked out of the tree by `backend/tests/public-surface-claims.test.ts`.
 */

/**
 * The five city types, mirrored field by field: `CityData`, `CityDir`,
 * `CityFile`, `CityFinding` and `ScanProvenance` from
 * `frontend/src/city/types.ts` — including the field types they reach into
 * (`FindingCategory`, `Severity`, `ThreatLevel`, and the `VoxelSectionSpec` list
 * behind `sections`).
 */
import type {
  CityData,
  CityDir,
  CityFile,
  CityFinding,
  FindingCategory,
  ScanProvenance,
  Severity,
  ThreatLevel,
} from "../../src/city/types";

type OptionalKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];
type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>;

/**
 * Every key of `T` must be written down: the required ones with a value, the
 * optional ones with a value too or with an explicit `undefined`, which
 * `payload()` then leaves out of the object — meaning "this payload does not
 * carry the field". A new field in `src/city/types.ts` is therefore a compile
 * error here, never a silent gap that a `dependencyRunner` falls through.
 */
type Full<T> = { [K in RequiredKeys<T>]: T[K] } & {
  [K in OptionalKeys<T>]-?: T[K] | undefined;
};

/**
 * Drop the keys that were written as `undefined`, so the result is a payload
 * that does not carry the field at all rather than one carrying `undefined`
 * (which is what `JSON.stringify` would send anyway, and what a legacy city
 * looks like on the way in).
 *
 * The single cast in this file, and it erases nothing: every key and value came
 * out of a `Full<T>` one line above.
 */
function payload<T extends object>(fields: Full<T>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** The weighted risk the backend publishes: P0×10 + P1×7 + P2×3. */
export const SEVERITY_WEIGHT: Record<Severity, number> = { P0: 10, P1: 7, P2: 3 };
/** Worst first — the order every severity list and chip prints. */
export const SEVERITY_ORDER: readonly Severity[] = ["P0", "P1", "P2"];

export function emptySeverityCounts(): Record<Severity, number> {
  return { P0: 0, P1: 0, P2: 0 };
}

export function countBySeverity(findings: readonly CityFinding[]): Record<Severity, number> {
  const counts = emptySeverityCounts();
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function addSeverityCounts(
  a: Record<Severity, number>,
  b: Record<Severity, number>,
): Record<Severity, number> {
  return { P0: a.P0 + b.P0, P1: a.P1 + b.P1, P2: a.P2 + b.P2 };
}

/** Weighted risk of a list of findings, the way `threatScore` is defined. */
export function threatScoreOf(findings: readonly CityFinding[]): number {
  return findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
}

/** `cityMapper.ts:threatLevelOf` — the worst finding decides the colour. */
export function threatLevelOf(findings: readonly CityFinding[]): ThreatLevel {
  if (findings.some((f) => f.severity === "P0")) return "critical";
  if (findings.some((f) => f.severity === "P1")) return "high";
  if (findings.some((f) => f.severity === "P2")) return "medium";
  if (findings.length > 0) return "low";
  return "safe";
}

const basename = (p: string): string => p.split("/").pop() ?? p;

/**
 * One field out of an override bag. A key the caller did not write takes the
 * default; a key written as `undefined` is the caller SAYING "this payload does
 * not carry the field" and takes nothing — which is how a test keeps a legacy
 * city legacy while still going through the builder.
 */
function field<T extends object, K extends keyof T>(
  overrides: T,
  key: K,
  fallback: T[K] | undefined,
): T[K] | undefined {
  return Object.hasOwn(overrides, key) ? overrides[key] : fallback;
}

/** Lines that count as code: everything a `data` file does not hold. */
const isData = (f: CityFile): boolean => f.role === "data";
const isTest = (f: CityFile): boolean => f.role === "test";

function sumLinesByLanguage(
  files: readonly CityFile[],
  keep: (f: CityFile) => boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of files) {
    if (!keep(f)) continue;
    out[f.language] = (out[f.language] ?? 0) + f.linesOfCode;
  }
  return out;
}

/** Every file a district subtree ships: its own list plus the children's. */
export function subtreeFiles(dir: CityDir): CityFile[] {
  const out: CityFile[] = [];
  const seen = new Set<string>();
  const walk = (node: CityDir): void => {
    for (const f of node.detailFiles) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    node.children.forEach(walk);
  };
  walk(dir);
  return out;
}

// ── findings ────────────────────────────────────────────────────────────────

/**
 * A finding, with the shape a `gitleaks` secret hit arrives in.
 *
 * A test that quotes a sentence in its assertion should pass that sentence in
 * rather than take it from here — the defaults are the payload's words, not the
 * claim under test.
 */
export function finding(overrides: Partial<CityFinding> = {}): CityFinding {
  const base: Full<CityFinding> = {
    type: overrides.type ?? "HARDCODED_SECRET",
    severity: overrides.severity ?? "P0",
    // `field`, not `??`: a test that writes `category: undefined` says the
    // finding carries no category, and the panel must then say nothing German.
    category: field(overrides, "category", "secrets"),
    line: overrides.line ?? 1,
    message: overrides.message ?? "Hardcoded secret detected (generic-api-key) — gitleaks",
    fix: field(overrides, "fix", undefined),
    provenance: field(overrides, "provenance", "gitleaks"),
    ruleId: field(overrides, "ruleId", "generic-api-key"),
    historyCommit: field(overrides, "historyCommit", undefined),
    sourceSeverity: field(overrides, "sourceSeverity", undefined),
    packageName: field(overrides, "packageName", undefined),
    packageVersion: field(overrides, "packageVersion", undefined),
    label: field(overrides, "label", undefined),
    labelDe: field(overrides, "labelDe", undefined),
    explanation: field(overrides, "explanation", undefined),
    explanationDe: field(overrides, "explanationDe", undefined),
    fixDe: field(overrides, "fixDe", undefined),
    cwe: field(overrides, "cwe", undefined),
    refUrl: field(overrides, "refUrl", undefined),
    snippet: field(overrides, "snippet", undefined),
    inTest: field(overrides, "inTest", undefined),
    fingerprint: field(overrides, "fingerprint", undefined),
  };
  return payload<CityFinding>(base);
}

// ── files ───────────────────────────────────────────────────────────────────

/**
 * One building.
 *
 * `path` and `language` are arguments because no two tests agree on them and
 * both change what the city paints. `threatLevel` follows the findings, as the
 * mapper's does; `id` is a readable stand-in for the backend's `f-<hash>`.
 * Anything else the payload would have to say — a churn score, the `test` role,
 * a coverage number — goes in through `overrides`, so the test names it.
 */
export function file(
  path: string,
  language: string,
  findings: readonly CityFinding[] = [],
  unverifiedBy?: readonly string[],
  overrides: Partial<CityFile> = {},
): CityFile {
  const ownFindings = [...findings];
  const base: Full<CityFile> = {
    id: overrides.id ?? `f-${path}`,
    name: overrides.name ?? basename(path),
    path,
    language,
    /** Absent = the payload predates the code/test split, which is "code". */
    role: field(overrides, "role", undefined),
    linesOfCode: overrides.linesOfCode ?? 40,
    cyclomaticComplexity: overrides.cyclomaticComplexity ?? 1,
    /** Absent = the payload predates the card's teaching notes. */
    advice: field(overrides, "advice", undefined),
    threatLevel: overrides.threatLevel ?? threatLevelOf(ownFindings),
    findings: ownFindings,
    bytes: field(overrides, "bytes", undefined),
    churnScore: field(overrides, "churnScore", undefined),
    commitCount: field(overrides, "commitCount", undefined),
    daysSinceLastCommit: field(overrides, "daysSinceLastCommit", undefined),
    firstCommitAt: field(overrides, "firstCommitAt", undefined),
    lastCommitAt: field(overrides, "lastCommitAt", undefined),
    topAuthor: field(overrides, "topAuthor", undefined),
    exportedSymbols: field(overrides, "exportedSymbols", undefined),
    importCount: field(overrides, "importCount", undefined),
    deadCodeCandidate: field(overrides, "deadCodeCandidate", undefined),
    inCycle: field(overrides, "inCycle", undefined),
    coveragePct: field(overrides, "coveragePct", undefined),
    liveRefreshed: field(overrides, "liveRefreshed", undefined),
    clonePartners: field(overrides, "clonePartners", undefined),
    sections: field(overrides, "sections", undefined),
    unverifiedBy:
      unverifiedBy !== undefined ? [...unverifiedBy] : field(overrides, "unverifiedBy", undefined),
  };
  return payload<CityFile>(base);
}

// ── districts ───────────────────────────────────────────────────────────────

/**
 * A district — a folder in the tree.
 *
 * With nothing but `path` and `detailFiles` the numbers are the backend's
 * aggregation: file count, lines, language split, severity counts and weighted
 * risk from the files this folder ships plus the districts under it. Pass a
 * field to say something the files do not say — an aggregate level that ships no
 * file list, a folder whose 92 files are not all in the payload — and the
 * builder takes your word for it instead of counting.
 */
export function dir(overrides: Partial<CityDir> = {}): CityDir {
  const path = overrides.path ?? "";
  const detailFiles = [...(overrides.detailFiles ?? [])];
  const children = [...(overrides.children ?? [])];

  const own = detailFiles;
  const every = [...own, ...children.flatMap(subtreeFiles)];
  const everyCode = every.filter((f) => !isData(f));
  const everyData = every.filter(isData);

  const childCounts = children
    .map((c) => c.findingsBySeverity)
    .reduce(addSeverityCounts, emptySeverityCounts());
  const ownCounts = countBySeverity(own.flatMap((f) => f.findings));
  const derivedCounts = addSeverityCounts(ownCounts, childCounts);

  const childFindings = children.flatMap((c) => subtreeFiles(c).flatMap((f) => f.findings));
  const everyFindings = [...own.flatMap((f) => f.findings), ...childFindings];
  const testFiles = every.filter(isTest);
  const testFindings = testFiles.flatMap((f) => f.findings);
  const dataFindings = everyData.flatMap((f) => f.findings);
  const unverified = every.filter(
    (f) => f.findings.length === 0 && (f.unverifiedBy?.length ?? 0) > 0,
  );

  const derivedCategories: Record<FindingCategory, number> = {
    injection: 0,
    secrets: 0,
    crypto: 0,
    transport: 0,
    exposure: 0,
    dependencies: 0,
    permissions: 0,
    hygiene: 0,
    unclassified: 0,
  };
  for (const f of everyFindings) derivedCategories[f.category ?? "unclassified"] += 1;

  const fileCount = own.length + children.reduce((s, c) => s + c.fileCount, 0);
  /** A declared `fileCount` is the folder's own statement — the podium maths has
   *  to follow it, not the files the payload happens to ship. */
  const resolvedFileCount = overrides.fileCount ?? fileCount;
  const childLanguages = children.reduce(
    (acc, c) => {
      for (const [lang, lines] of Object.entries(c.languages)) acc[lang] = (acc[lang] ?? 0) + lines;
      return acc;
    },
    {} as Record<string, number>,
  );
  const childDataLanguages = children.reduce(
    (acc, c) => {
      for (const [lang, lines] of Object.entries(c.dataLanguages ?? {}))
        acc[lang] = (acc[lang] ?? 0) + lines;
      return acc;
    },
    {} as Record<string, number>,
  );

  const base: Full<CityDir> = {
    name: overrides.name ?? basename(path),
    path,
    fileCount: resolvedFileCount,
    linesOfCode:
      overrides.linesOfCode ??
      own.reduce((s, f) => s + f.linesOfCode, 0) + children.reduce((s, c) => s + c.linesOfCode, 0),
    /** Written only when the split is real: a folder without data files was
     *  mapped before it existed, and `codeLines === linesOfCode` would claim a
     *  measurement nobody took. */
    codeLines: field(
      overrides,
      "codeLines",
      everyData.length > 0 ? everyCode.reduce((s, f) => s + f.linesOfCode, 0) : undefined,
    ),
    dataLines: field(
      overrides,
      "dataLines",
      everyData.length > 0 ? everyData.reduce((s, f) => s + f.linesOfCode, 0) : undefined,
    ),
    languages: overrides.languages ?? {
      ...sumLinesByLanguage(own, (f) => !isData(f)),
      ...childLanguages,
    },
    dataLanguages: field(
      overrides,
      "dataLanguages",
      everyData.length > 0
        ? { ...sumLinesByLanguage(everyData, () => true), ...childDataLanguages }
        : undefined,
    ),
    findingsBySeverity: overrides.findingsBySeverity ?? derivedCounts,
    /** Counts the findings never invented: where no finding carries a category,
     *  the payload says nothing about kinds and nine zeroes would outvote that. */
    findingsByCategory: field(
      overrides,
      "findingsByCategory",
      everyFindings.some((f) => f.category !== undefined) ? derivedCategories : undefined,
    ),
    threatScore:
      overrides.threatScore ??
      threatScoreOf(every.filter((f) => !isTest(f)).flatMap((f) => f.findings)),
    testFiles: field(overrides, "testFiles", testFiles.length > 0 ? testFiles.length : undefined),
    findingsInTests: field(
      overrides,
      "findingsInTests",
      testFindings.length > 0 ? testFindings.length : undefined,
    ),
    findingsInData: field(
      overrides,
      "findingsInData",
      dataFindings.length > 0 ? dataFindings.length : undefined,
    ),
    unverifiedFiles: field(
      overrides,
      "unverifiedFiles",
      unverified.length > 0 ? unverified.length : undefined,
    ),
    testThreatScore: field(
      overrides,
      "testThreatScore",
      threatScoreOf(testFindings) > 0 ? threatScoreOf(testFindings) : undefined,
    ),
    topFindings: overrides.topFindings ?? [],
    children,
    detailFiles,
    remainingFiles:
      overrides.remainingFiles ??
      Math.max(0, resolvedFileCount - children.reduce((s, c) => s + c.fileCount, 0) - own.length),
    districtFiles: overrides.districtFiles ?? [],
    topAuthor: field(overrides, "topAuthor", undefined),
    topAuthorShare: field(overrides, "topAuthorShare", undefined),
  };
  return payload<CityDir>(base);
}

// ── scan provenance ─────────────────────────────────────────────────────────

/**
 * Which scanners contributed.
 *
 * The six engine flags default to RAN, because a test that says nothing should
 * not be read as "gitleaks was switched off" — that is the claim the whole
 * provenance table exists to police. The four optional dimensions
 * (`churn`, `churnInterrupted`, `duplicates`, `coverage`) and `dependencyRunner`
 * stay absent: an
 * engine that is not in the payload is a scanner the result never spoke of.
 * `dependencyRunner` in particular is the field no local builder knew, and
 * `engineLabel` reads it to decide whether the CVE answer came from
 * `npm audit`, `osv-scanner` or `pip-audit`.
 */
export function provenance(overrides: Partial<ScanProvenance> = {}): ScanProvenance {
  const base: Full<ScanProvenance> = {
    regex: overrides.regex ?? true,
    gitleaks: overrides.gitleaks ?? true,
    semgrep: overrides.semgrep ?? true,
    dependencies: overrides.dependencies ?? true,
    dependencyRunner: field(overrides, "dependencyRunner", undefined),
    osv: overrides.osv ?? true,
    ruff: overrides.ruff ?? true,
    churn: field(overrides, "churn", undefined),
    churnInterrupted: field(overrides, "churnInterrupted", undefined),
    duplicates: field(overrides, "duplicates", undefined),
    coverage: field(overrides, "coverage", undefined),
    live: field(overrides, "live", undefined),
  };
  return payload<ScanProvenance>(base);
}

// ── the city ────────────────────────────────────────────────────────────────

export interface CityOverrides extends Partial<Omit<CityData, "tree">> {
  /** The tree. Default: one root district holding `files`. */
  tree?: CityDir;
  /**
   * The files standing on the root plaza. A shorthand for the shape almost
   * every UI test needs — a city that is one folder with these buildings in it.
   * Given together with `tree`, they replace that tree's own file list.
   */
  files?: readonly CityFile[];
}

/**
 * A whole city, typed against `CityData` field by field.
 *
 * The scalars mirror the root district, exactly as `cityMapper.ts` does; pass
 * one to say something the tree does not. `meta` defaults to every optional
 * dimension off — the honest reading of a scan that measured none of them — and
 * `scanProvenance`, `analysisId`, `limits`, `skippedByGitignore` and `dropped`
 * stay absent, because a payload that carries no proof of depth must not be
 * given one by a builder.
 */
export function city(overrides: CityOverrides = {}): CityData {
  const { files: plazaFiles, tree: treeOverride, ...rest } = overrides;
  /**
   * The root district is built from the OVERRIDE, never from a finished district:
   * feeding a built one back in would turn every derived count into an explicit
   * zero and the files on the plaza would never be counted.
   */
  const rootOverrides: Partial<CityDir> = treeOverride ?? { path: "", name: "" };
  const tree = dir(
    plazaFiles === undefined ? rootOverrides : { ...rootOverrides, detailFiles: [...plazaFiles] },
  );
  const rendered = subtreeFiles(tree);

  const base: Full<CityData> = {
    additionalFiles: field(rest, "additionalFiles", undefined),
    repo: rest.repo ?? { owner: "local", name: "probe", branch: "main" },
    analysisId: field(rest, "analysisId", undefined),
    createdAt: field(rest, "createdAt", undefined),
    totalFiles: rest.totalFiles ?? tree.fileCount,
    renderedFiles: rest.renderedFiles ?? rendered.length,
    totalLines: rest.totalLines ?? tree.linesOfCode,
    codeLines: field(rest, "codeLines", tree.codeLines),
    dataLines: field(rest, "dataLines", tree.dataLines),
    findingsBySeverity: rest.findingsBySeverity ?? tree.findingsBySeverity,
    findingsByCategory: field(rest, "findingsByCategory", tree.findingsByCategory),
    languages: rest.languages ?? tree.languages,
    dataLanguages: field(rest, "dataLanguages", tree.dataLanguages),
    findingsInTests: field(rest, "findingsInTests", tree.findingsInTests),
    findingsInData: field(rest, "findingsInData", tree.findingsInData),
    testFiles: field(rest, "testFiles", tree.testFiles),
    unverifiedFiles: field(rest, "unverifiedFiles", tree.unverifiedFiles),
    unverifiedEngines: field(rest, "unverifiedEngines", undefined),
    tree,
    fileConnections: [...(rest.fileConnections ?? [])],
    dirConnections: [...(rest.dirConnections ?? [])],
    limits: field(rest, "limits", undefined),
    meta: rest.meta ?? {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
    scanProvenance: field(rest, "scanProvenance", undefined),
    skippedByGitignore: field(rest, "skippedByGitignore", undefined),
    dropped: field(rest, "dropped", undefined),
  };
  return payload<CityData>(base);
}
