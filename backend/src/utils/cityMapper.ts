/**
 * cityMapper — Builds a hierarchical city from an AnalysisResult.
 *
 * Scale-independence (semantic zoom):
 * - Every directory becomes a "block"; the overview level shows one block
 *   per top-level directory regardless of repo size.
 * - Files become buildings only when a block is opened, capped per directory
 *   (perDirCap); everything else is summarised in `remainingFiles` so nothing
 *   is silently hidden (HUD shows "X of Y files").
 * - Threat scores, language stats and file counts are aggregated over the
 *   FULL file set — the visual cap never corrupts the numbers.
 * - Import edges are resolved (relative paths, extension/index candidates,
 *   `@/` alias) and aggregated per top-level directory for the overview.
 *
 * Lines are split by what they are: a translation catalogue or a manifest has
 * lines but no behaviour, and the analyzer already refuses to score it as code
 * (complexity 1, no functions). The line statistics honour that same decision,
 * so `codeLines` and `dataLines` are published apart and `languages` only ever
 * carries code lines.
 *
 * The caps that decide how many buildings a directory draws are shipped with
 * the city (`limits`), so the panel can explain "6 of 92" instead of letting an
 * unrendered district read as an empty one.
 */

import path from "path";
import { createHash } from "crypto";
import { hasDataLines, roleOf, roleOfPath, type FileRole } from "../services/analyzer/metrics.js";
import { missingEnginesFor } from "../services/security/scan-depth.js";
import {
  findingFingerprint,
  normalizeIdentityPath,
} from "../services/security/finding-identity.js";
import type { FindingCategory } from "../models/index.js";
import type { AnalysisResult, FileAnalysis, ProjectSummary } from "../models/index.js";

export type Severity = "P0" | "P1" | "P2";

/**
 * The id of one analyzed file.
 *
 * Derived from the path, so the same file in the same project keeps the same
 * id across scans however the filesystem chose to order its directory read.
 * Twelve hex characters of SHA-256 are far past what a few thousand files need
 * to stay unique, and short enough to stay readable in a URL.
 */
export function fileIdForPath(filePath: string): string {
  const normalized = normalizeIdentityPath(filePath);
  return `f-${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`;
}

export type ThreatLevel = "critical" | "high" | "medium" | "low" | "safe";

export interface CitySnippet {
  before: string[];
  line: string;
  after: string[];
  number: number;
}

export interface CityFinding {
  type: string;
  severity: Severity;
  /** What kind of mistake this is — the axis the user filters by */
  category?: FindingCategory;
  line: number;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
  historyCommit?: string;
  sourceSeverity?: string;
  packageName?: string;
  packageVersion?: string;
  /** Plain-language explanation of the finding class */
  explanation?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — where exactly the problem lives */
  snippet?: CitySnippet;
  /**
   * Found inside test code. A fixture that shows a vulnerable snippet is a
   * true statement about the fixture and a weak one about the product, so the
   * panel says which of the two the user is looking at.
   */
  inTest?: boolean;
  /**
   * Stable identity across re-scans — minted once in
   * `services/security/finding-identity.ts` and shared with the SARIF export's
   * `partialFingerprints.primaryLocationLineHash`.
   */
  fingerprint?: string;
}

/**
 * Voxel section (CodeBlocks design, frontend VoxelSectionSpec):
 * one city block per function/class/module chunk, 1 voxel = 1 code line.
 */
export interface CitySection {
  name: string;
  kind: "function" | "class" | "module" | "imports";
  start: number;
  end: number;
  codeLines: number;
  depth: number;
}

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  /**
   * "test" for test folders and *.test.* files, "data" for files that carry
   * data and no behaviour (lockfiles, generated schemas, catalogues,
   * migrations, .env). Absent in payloads mapped before the split — the
   * client then treats the file as code.
   */
  role?: FileRole;
  linesOfCode: number;
  cyclomaticComplexity: number;
  threatLevel: ThreatLevel;
  findings: CityFinding[];
  /** Raw file size in bytes — bloat LOC hides */
  bytes?: number;
  /** 0..1 git change-frequency hotspot score (absent without git history) */
  churnScore?: number;
  commitCount?: number;
  daysSinceLastCommit?: number;
  /** Developer with the most commits touching this file */
  topAuthor?: string;
  /** Number of exported symbols — the file's public API surface */
  exportedSymbols?: number;
  /** Number of import statements — coupling proxy until the AST core lands */
  importCount?: number;
  /**
   * Exports exist but nothing in the repo imports this file, and it is not
   * an entry point. Conservative heuristic — real dead-code analysis comes
   * with the AST core.
   */
  deadCodeCandidate?: boolean;
  /** Part of at least one circular import chain */
  inCycle?: boolean;
  /** Line coverage 0..100 parsed from a lcov-style report, if present */
  coveragePct?: number;
  /** Files sharing ≥6 normalized duplicated lines with this one (top 3) */
  clonePartners?: Array<{ id: string; path: string; lines: number }>;
  /** Voxel sections (CodeBlocks) — capped at 24 in the analyzer, absent for demo data */
  sections?: CitySection[];
  /**
   * Scanners that were switched off but would have reported on this file's
   * language. Absent (or empty) means the file was checked as deep as the
   * profile goes. A file with no findings and no right to be calm is exactly
   * what this is for: measured on the Quick profile, 169 of 173 buildings
   * wore the colour of a clean scan while semgrep and ruff never ran.
   */
  unverifiedBy?: string[];
}

export interface CityDir {
  name: string; // last path segment; '' for the root
  path: string; // directory path relative to repo root; '' for root
  fileCount: number; // files in the whole subtree (full, uncapped)
  /** Σ lines in the subtree — the size class the layout draws plots from */
  linesOfCode: number;
  /** Σ lines of files that carry behaviour (linesOfCode minus dataLines) */
  codeLines: number;
  /** Σ lines of data catalogues and manifests, counted apart from code */
  dataLines: number;
  languages: Record<string, number>; // language → CODE lines (subtree)
  /** language → data lines (subtree) — kept out of `languages` on purpose */
  dataLanguages: Record<string, number>;
  findingsBySeverity: Record<Severity, number>; // subtree finding counts
  /**
   * What kinds of mistakes live in this folder. The category axis is the one
   * a user can decide about ("injection yes, hygiene later"); severity and
   * type are not choices, this is.
   */
  findingsByCategory: Record<FindingCategory, number>;
  /**
   * Weighted risk of the findings this folder holds in shipped code
   * (P0×10 + P1×7 + P2×3). Test fixtures are counted separately below, so a
   * folder full of deliberate bad examples cannot outscore a real one.
   */
  threatScore: number;
  /** Files in the subtree that live in test code */
  testFiles: number;
  /**
   * Clean-looking files in the subtree that a switched-off scanner would have
   * covered. The far-zoom heat channel needs this to stop painting an
   * unscanned folder with the colour of a checked one.
   */
  unverifiedFiles: number;
  /** Findings in the subtree that were found in test code */
  findingsInTests: number;
  /** Findings in the subtree that sit in data files — a lockfile finding is not a code finding */
  findingsInData: number;
  /** Weighted risk of those test-code findings */
  testThreatScore: number;
  topFindings: CityFinding[]; // worst findings in subtree (max 3)
  children: CityDir[]; // subdirectories (sorted by linesOfCode desc)
  detailFiles: CityFile[]; // files rendered as buildings when opened
  remainingFiles: number; // subtree files not individually rendered
  /**
   * Up to 6 representative files of the WHOLE subtree (most at-risk +
   * largest) — rendered as the district's skyline while zoomed out.
   */
  districtFiles: CityFile[];
  /** Author owning the most files in this subtree ("Anna's district") */
  topAuthor?: string;
  topAuthorShare?: number; // 0..1 — share of subtree files owned by them
}

export interface FileConnection {
  from: string; // CityFile id
  to: string; // CityFile id
  weight: number;
}

export interface DirConnection {
  from: string; // top-level directory path ('' = root files)
  to: string;
  weight: number;
}

export interface CityData {
  /** Which scan produced this city; every export names it. */
  analysisId?: string;
  /** Complete searchable files that are outside the 3D rendering budget. */
  additionalFiles?: CityFile[];
  repo: { owner: string; name: string; branch: string };
  totalFiles: number; // full analyzed file count (uncapped)
  renderedFiles: number; // Σ detailFiles across the tree
  /** Σ lines the scanner read as code-shaped, data catalogues included */
  totalLines: number;
  /** `totalLines` minus the lines that belong to data files */
  codeLines: number;
  /** lines of translation catalogues, manifests and other data files */
  dataLines: number;
  findingsBySeverity: Record<Severity, number>;
  findingsByCategory: Record<FindingCategory, number>;
  /** Findings that were found in test code — still findings, different claim */
  findingsInTests: number;
  /** Findings that sit in data files (lockfiles, env files, generated schemas) */
  findingsInData: number;
  /** How many of `totalFiles` are test files */
  testFiles: number;
  /** Buildings that look clean but were never seen by an engine covering them */
  unverifiedFiles: number;
  /** Names of the engines that were off, for the languages this project has */
  unverifiedEngines: string[];
  /** language → CODE lines — data files never show up here */
  languages: Record<string, number>;
  /** language → data lines, shown apart so the bar stays about code */
  dataLanguages: Record<string, number>;
  tree: CityDir;
  fileConnections: FileConnection[];
  dirConnections: DirConnection[];
  /**
   * The caps this city was laid out under. The panel needs them to explain
   * "6 of 92 files" as a draw limit rather than as an empty district.
   */
  limits: {
    skylineTowers: number;
    buildingsPerDirectory: number;
  };
  /**
   * Which optional visualization dimensions are present — the client
   * degrades gracefully (graphite instead of erosion, no glass) when a
   * dimension is missing rather than inventing data.
   */
  meta: {
    churn: boolean;
    deadCode: boolean;
    duplicates: boolean;
    cycles: boolean;
    coverage: boolean;
    blame: boolean;
  };
  /**
   * Which scanners actually contributed, copied from the summary. The UI
   * needs it to decide whether "no findings" means "clean" or "unlooked";
   * absent for results that never ran a scan (the demo city).
   */
  scanProvenance?: ProjectSummary["scanProvenance"];
  /**
   * What the project's own .gitignore kept out of the scan, copied from the
   * summary. A city that does not say this makes an unscanned folder look
   * like a clean one. Absent for results scanned before the counter existed.
   */
  skippedByGitignore?: ProjectSummary["skippedByGitignore"];
  /**
   * Files the picked folder held that the scan never read. The closing toast is
   * the one place a user learns that "32 files" meant 62 minus 30.
   */
  dropped?: ProjectSummary["dropped"];
}

// ── Budgets ────────────────────────────────────────────────────────────────

/** Max buildings rendered per directory when a block is opened. */
const DETAIL_FILES_PER_DIR = 35;
/** Global budget for individually rendered files across the whole city. */
const DETAIL_FILES_TOTAL = 1400;
/** File-level connection edges shipped to the client (dir edges separate). */
const FILE_CONNECTIONS_MAX = 400;
const DIR_CONNECTIONS_MAX = 200;

const SEVERITY_SCORE: Record<Severity, number> = { P0: 10, P1: 7, P2: 3 };
const SEVERITY_ORDER: Severity[] = ["P0", "P1", "P2"];

/** Representative towers per district skyline (rendered while zoomed out). */
const DISTRICT_FILES_MAX = 6;

/**
 * Circular import detection over the resolved edge graph (DFS, three
 * colors). Files on ANY back edge are flagged — the frontend renders
 * them with a rotating red warning ring.
 */
function findCircularFiles(files: FileAnalysis[], pathSet: Set<string>): Set<string> {
  const edges = new Map<string, string[]>();
  for (const f of files) {
    for (const imp of f.imports ?? []) {
      if (imp.isExternal) continue;
      const target = resolveImportPath(f.path, imp.source, pathSet);
      if (!target || target === f.path) continue;
      const list = edges.get(f.path) ?? [];
      list.push(target);
      edges.set(f.path, list);
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const inCycle = new Set<string>();

  const visit = (node: string): void => {
    color.set(node, GRAY);
    for (const next of edges.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        // Back edge → node and its target sit on a cycle
        inCycle.add(node);
        inCycle.add(next);
      } else if (c === WHITE) {
        visit(next);
      }
    }
    color.set(node, BLACK);
  };
  for (const f of files) {
    if ((color.get(f.path) ?? WHITE) === WHITE) visit(f.path);
  }
  return inCycle;
}

/** Weight a subtree file for skyline selection: risk dominates, size breaks ties. */
function skylineWeight(f: FileAnalysis): number {
  const risk = f.vulnerabilities.reduce((s, v) => s + (SEVERITY_SCORE[v.severity] ?? 0), 0);
  // A fixture never becomes the tower the user sees from orbit.
  return roleWeight(f) * 100_000_000 + risk * 10_000 + Math.min(f.lines.code, 2000);
}

/**
 * Rank by role. Test code sits below shipped code but never disappears; a
 * data sheet (lockfile, schema, catalogue) never competes for the skyline on
 * size — 7 556 format lines of package-lock.json measured as the tallest
 * "code" tower of its city. With real findings in it a data file ranks as
 * code again: a secret in a lockfile is still a secret.
 */
function roleWeight(f: FileAnalysis): number {
  const role = roleOf(f.path, f.language);
  if (role === "test") return 0;
  if (role === "data") return f.vulnerabilities.length > 0 ? 1 : 0.5;
  return 1;
}

function emptySeverityCount(): Record<Severity, number> {
  return { P0: 0, P1: 0, P2: 0 };
}

function emptyCategoryCount(): Record<FindingCategory, number> {
  return {
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
}

function toCityFinding(
  v: FileAnalysis["vulnerabilities"][number],
  inTest?: boolean,
  path?: string,
): CityFinding {
  const enriched = v as unknown as {
    provenance?: string;
    ruleId?: string;
    explanation?: string;
    cwe?: string;
    refUrl?: string;
    snippet?: CityFinding["snippet"];
    code?: string;
  };
  return {
    type: v.type,
    severity: v.severity,
    line: v.line,
    // One identity, shared with the SARIF export: see finding-identity.ts.
    fingerprint: path
      ? findingFingerprint({
          path,
          type: v.type,
          ruleId: enriched.ruleId,
          line: v.line,
          code: enriched.code,
          provenance: enriched.provenance,
          historyCommit: v.historyCommit,
        })
      : undefined,
    message: v.message,
    fix: v.fix,
    provenance: enriched.provenance,
    ruleId: enriched.ruleId,
    historyCommit: v.historyCommit,
    sourceSeverity: v.sourceSeverity,
    packageName: v.packageName,
    packageVersion: v.packageVersion,
    explanation: enriched.explanation,
    cwe: enriched.cwe,
    refUrl: enriched.refUrl,
    snippet: enriched.snippet,
    category: v.category,
    inTest,
  };
}

function threatLevelOf(findings: FileAnalysis["vulnerabilities"]): ThreatLevel {
  if (findings.some((v) => v.severity === "P0")) return "critical";
  if (findings.some((v) => v.severity === "P1")) return "high";
  if (findings.some((v) => v.severity === "P2")) return "medium";
  if (findings.length > 0) return "low";
  return "safe";
}

function fileSortKey(f: FileAnalysis): number {
  const worst = findingsSortKey(f.vulnerabilities);
  return roleWeight(f) * 1_000_000 + worst * 1000 + Math.min(f.lines.code, 1000);
}

function findingsSortKey(findings: FileAnalysis["vulnerabilities"]): number {
  return findings.reduce((max, v) => Math.max(max, SEVERITY_SCORE[v.severity] ?? 0), 0);
}

// ── Directory trie ─────────────────────────────────────────────────────────

interface TrieNode {
  name: string;
  path: string;
  children: Map<string, TrieNode>;
  files: FileAnalysis[];
}

function buildTrie(files: FileAnalysis[]): TrieNode {
  const root: TrieNode = { name: "", path: "", children: new Map(), files: [] };
  for (const file of files) {
    const dir = path.posix.dirname(file.path);
    const parts = dir === "." ? [] : dir.split("/");
    let node = root;
    for (const part of parts) {
      const childPath = node.path === "" ? part : `${node.path}/${part}`;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: childPath, children: new Map(), files: [] };
        node.children.set(part, child);
      }
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

// ── Import resolution ──────────────────────────────────────────────────────

const EXT_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/**
 * Resolve an import source to an analyzed file path, or null.
 * Handles './x', '../x/y', 'src/x' (root-anchored), '@/x' (alias) and
 * the TS-ESM convention of importing './x.js' for './x.ts'.
 */
function resolveImportPath(fromPath: string, source: string, pathSet: Set<string>): string | null {
  let src = source.trim();
  if (src.startsWith("@/")) src = src.slice(2);
  if (src.startsWith("~/")) src = src.slice(2);

  let base: string;
  if (src.startsWith("./") || src.startsWith("../")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), src));
  } else if (src.startsWith("/") || src.startsWith(".")) {
    return null; // unusual — skip
  } else {
    base = src; // root-anchored path (e.g. tsconfig baseUrl) — try as-is
  }

  const candidates = [base, ...EXT_CANDIDATES.map((ext) => base + ext)];
  if (base.endsWith(".js")) {
    candidates.push(base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx");
  }
  for (const c of candidates) {
    if (pathSet.has(c)) return c;
  }
  return null;
}

function topLevelDirOf(filePath: string): string {
  const i = filePath.indexOf("/");
  return i === -1 ? "" : filePath.slice(0, i);
}

// ── Dead-code heuristic ────────────────────────────────────────────────────

const ENTRY_BASENAMES = /^(index|main|app|mod|lib|server|client|__init__|wsgi|manage)\./i;

/**
 * Files whose exports are never imported anywhere and which cannot be
 * entry points. Only files WITH exports qualify — no exports means we
 * can't tell, and flagging those would drown the signal.
 */
function isDeadCodeCandidate(f: FileAnalysis, importedPaths: Set<string>): boolean {
  if (f.exports.length === 0) return false;
  if (importedPaths.has(f.path)) return false;
  const base = path.posix.basename(f.path);
  if (ENTRY_BASENAMES.test(base)) return false;
  if (roleOfPath(f.path) === "test") return false;
  return true;
}

// ── Main mapping ───────────────────────────────────────────────────────────

export function mapResultToCityData(result: AnalysisResult): CityData {
  const files = result.files ?? [];
  const pathSet = new Set(files.map((f) => f.path));
  const rawByPath = new Map(files.map((f) => [f.path, f]));

  // Pre-pass over ALL files: which paths are imported by anyone? Needed
  // before the tree is built so per-file dead-code flags can be attached.
  const importedPaths = new Set<string>();
  for (const file of files) {
    for (const imp of file.imports ?? []) {
      if (imp.isExternal) continue;
      const target = resolveImportPath(file.path, imp.source, pathSet);
      if (target && target !== file.path) importedPaths.add(target);
    }
  }
  const deadCodeCandidates = new Set(
    files.filter((f) => isDeadCodeCandidate(f, importedPaths)).map((f) => f.path),
  );
  const hasChurn = files.some((f) => f.churn);
  const circular = findCircularFiles(files, pathSet);

  // Which engines were off for which language — a handful of languages, so the
  // answer is memoised instead of rebuilt for every one of 173 files.
  const missingByLanguage = new Map<string, string[]>();
  const missingFor = (language: string): string[] => {
    const cached = missingByLanguage.get(language);
    if (cached) return cached;
    const missing = missingEnginesFor(language, result.summary.scanProvenance);
    missingByLanguage.set(language, missing);
    return missing;
  };

  const allIds = new Map<string, string>();
  // Stable ids for every analyzed file (detail or not — dir-level
  // aggregation uses ALL resolved edges, not just rendered buildings).
  // The id is derived from the PATH, not from the walk position: a second scan
  // of an unchanged folder used to hand every id to a different file the moment
  // the filesystem returned its entries in another order, and anything keyed on
  // the old id — a review verdict, a deep link — pointed somewhere else.
  files.forEach((f) => allIds.set(f.path, fileIdForPath(f.path)));

  // Per-directory detail cap so the global building budget holds.
  const trie = buildTrie(files);
  let dirsWithFiles = 0;
  const countDirs = (node: TrieNode): void => {
    if (node.files.length > 0) dirsWithFiles++;
    node.children.forEach(countDirs);
  };
  countDirs(trie);
  const perDirCap = Math.max(
    4,
    Math.min(DETAIL_FILES_PER_DIR, Math.floor(DETAIL_FILES_TOTAL / Math.max(1, dirsWithFiles))),
  );

  let renderedFiles = 0;

  const buildCityDir = (node: TrieNode): CityDir => {
    const dirNode: CityDir = {
      name: node.name,
      path: node.path,
      fileCount: 0,
      linesOfCode: 0,
      codeLines: 0,
      dataLines: 0,
      languages: {},
      dataLanguages: {},
      findingsBySeverity: emptySeverityCount(),
      findingsByCategory: emptyCategoryCount(),
      threatScore: 0,
      testFiles: 0,
      unverifiedFiles: 0,
      findingsInTests: 0,
      findingsInData: 0,
      testThreatScore: 0,
      topFindings: [],
      children: [],
      detailFiles: [],
      remainingFiles: 0,
      districtFiles: [],
    };

    const aggregateFile = (f: FileAnalysis): void => {
      dirNode.fileCount += 1;
      dirNode.linesOfCode += f.lines.code;
      // Data lines join the size class of the plot (the building is already
      // flat) but never join the code totals or the language bar.
      if (hasDataLines(f.path, f.language)) {
        dirNode.dataLines += f.lines.code;
        dirNode.dataLanguages[f.language] = (dirNode.dataLanguages[f.language] ?? 0) + f.lines.code;
      } else {
        dirNode.codeLines += f.lines.code;
        dirNode.languages[f.language] = (dirNode.languages[f.language] ?? 0) + f.lines.code;
      }
      const inTest = roleOfPath(f.path) === "test";
      const inData = !inTest && roleOf(f.path, f.language) === "data";
      if (inTest) dirNode.testFiles += 1;
      if (f.vulnerabilities.length === 0 && missingFor(f.language).length > 0)
        dirNode.unverifiedFiles += 1;
      for (const v of f.vulnerabilities) {
        dirNode.findingsBySeverity[v.severity] = (dirNode.findingsBySeverity[v.severity] ?? 0) + 1;
        dirNode.findingsByCategory[v.category ?? "unclassified"] += 1;
        const score = SEVERITY_SCORE[v.severity] ?? 0;
        if (inTest) {
          dirNode.findingsInTests += 1;
          dirNode.testThreatScore += score;
        } else {
          dirNode.threatScore += score;
          if (inData) dirNode.findingsInData += 1;
        }
      }
      if (f.vulnerabilities.length > 0) {
        dirNode.topFindings.push(...f.vulnerabilities.map((v) => toCityFinding(v, inTest, f.path)));
      }
    };

    node.files.forEach(aggregateFile);
    node.children.forEach((child) => {
      const cityChild = buildCityDir(child);
      dirNode.children.push(cityChild);
      dirNode.fileCount += cityChild.fileCount;
      dirNode.linesOfCode += cityChild.linesOfCode;
      dirNode.codeLines += cityChild.codeLines;
      dirNode.dataLines += cityChild.dataLines;
      for (const [lang, lines] of Object.entries(cityChild.languages)) {
        dirNode.languages[lang] = (dirNode.languages[lang] ?? 0) + lines;
      }
      for (const [lang, lines] of Object.entries(cityChild.dataLanguages)) {
        dirNode.dataLanguages[lang] = (dirNode.dataLanguages[lang] ?? 0) + lines;
      }
      for (const sev of SEVERITY_ORDER) {
        dirNode.findingsBySeverity[sev] += cityChild.findingsBySeverity[sev];
      }
      for (const [category, count] of Object.entries(cityChild.findingsByCategory)) {
        dirNode.findingsByCategory[category as FindingCategory] += count;
      }
      dirNode.threatScore += cityChild.threatScore;
      dirNode.testFiles += cityChild.testFiles;
      dirNode.unverifiedFiles += cityChild.unverifiedFiles;
      dirNode.findingsInTests += cityChild.findingsInTests;
      dirNode.findingsInData += cityChild.findingsInData;
      dirNode.testThreatScore += cityChild.testThreatScore;
      dirNode.topFindings.push(...cityChild.topFindings);
    });

    dirNode.children.sort((a, b) => b.linesOfCode - a.linesOfCode);
    dirNode.topFindings = dirNode.topFindings
      .sort(
        (a, b) =>
          (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0) ||
          Number(a.inTest === true) - Number(b.inTest === true),
      )
      .slice(0, 3);

    // Detail files: the most security-relevant / largest files DIRECTLY in
    // this directory — sorted deterministically, capped per budget.
    const detail = [...node.files]
      .sort((a, b) => fileSortKey(b) - fileSortKey(a))
      .slice(0, perDirCap)
      .map((f) =>
        mapCityFile(
          f,
          allIds.get(f.path) ?? fileIdForPath(f.path),
          deadCodeCandidates,
          circular,
          allIds,
          missingFor,
        ),
      );
    dirNode.detailFiles = detail;
    renderedFiles += detail.length;

    // Podium honesty: everything in the subtree not rendered as a building.
    // A child accounts for its whole subtree minus what IT leaves to its
    // own podium — so nested directories never double-count.
    const accountedByChildren = dirNode.children.reduce(
      (s, c) => s + (c.fileCount - c.remainingFiles),
      0,
    );
    dirNode.remainingFiles = Math.max(0, dirNode.fileCount - detail.length - accountedByChildren);

    // District skyline: the most at-risk + largest files of the WHOLE
    // subtree. Children already surface their own top files, so merging
    // own files + child districtFiles approximates the subtree top-k cheaply.
    const skylineCandidates = [...node.files];
    for (const c of dirNode.children) {
      for (const cf of c.districtFiles) {
        const raw = rawByPath.get(cf.path);
        if (raw) skylineCandidates.push(raw);
      }
    }
    dirNode.districtFiles = skylineCandidates
      .sort((a, b) => skylineWeight(b) - skylineWeight(a))
      .slice(0, DISTRICT_FILES_MAX)
      .map((f) =>
        mapCityFile(
          f,
          allIds.get(f.path) ?? fileIdForPath(f.path),
          deadCodeCandidates,
          circular,
          allIds,
          missingFor,
        ),
      );

    // Author territory: who owns most of THIS directory's files (blame)
    const authorCounts = new Map<string, number>();
    let authoredFiles = 0;
    for (const f of node.files) {
      if (!f.churn?.topAuthor) continue;
      authoredFiles++;
      authorCounts.set(f.churn.topAuthor, (authorCounts.get(f.churn.topAuthor) ?? 0) + 1);
    }
    let dirTopAuthor: string | undefined;
    let dirTopCount = 0;
    for (const [author, n] of authorCounts) {
      if (n > dirTopCount) {
        dirTopCount = n;
        dirTopAuthor = author;
      }
    }
    if (dirTopAuthor && authoredFiles > 0) {
      dirNode.topAuthor = dirTopAuthor;
      dirNode.topAuthorShare = Math.round((dirTopCount / authoredFiles) * 100) / 100;
    }

    return dirNode;
  };

  const tree = buildCityDir(trie);

  // ── Connections ──────────────────────────────────────────────────────────
  const fileEdgeMap = new Map<string, FileConnection>();
  const dirEdgeMap = new Map<string, DirConnection>();

  for (const file of files) {
    const fromId = allIds.get(file.path);
    if (!fromId) continue;
    const fromTop = topLevelDirOf(file.path);

    for (const imp of file.imports ?? []) {
      if (imp.isExternal) continue;
      const targetPath = resolveImportPath(file.path, imp.source, pathSet);
      if (!targetPath || targetPath === file.path) continue;
      const toId = allIds.get(targetPath);
      if (!toId) continue;

      const weight = Math.max(1, imp.named?.length ?? 1);
      const key = `${fromId}|${toId}`;
      const existing = fileEdgeMap.get(key);
      if (existing) {
        existing.weight += weight;
      } else if (fileEdgeMap.size < FILE_CONNECTIONS_MAX * 4) {
        fileEdgeMap.set(key, { from: fromId, to: toId, weight });
      }

      const toTop = topLevelDirOf(targetPath);
      if (toTop !== fromTop) {
        const dirKey = `${fromTop}|${toTop}`;
        const dirEdge = dirEdgeMap.get(dirKey);
        if (dirEdge) dirEdge.weight += weight;
        else dirEdgeMap.set(dirKey, { from: fromTop, to: toTop, weight });
      }
    }
  }

  const renderedIds = new Set<string>();
  const collectRendered = (d: CityDir): void => {
    d.detailFiles.forEach((f) => renderedIds.add(f.id));
    d.children.forEach(collectRendered);
  };
  collectRendered(tree);

  const languageTotals: Record<string, number> = {};
  for (const [lang, lines] of Object.entries(tree.languages)) {
    languageTotals[lang] = lines;
  }
  const dataLanguageTotals: Record<string, number> = {};
  for (const [lang, lines] of Object.entries(tree.dataLanguages)) {
    dataLanguageTotals[lang] = lines;
  }

  return {
    // The city names the scan it came from, everywhere it is shared.
    analysisId: result.id,
    repo: {
      owner: result.repo.owner,
      name: result.repo.name,
      branch: result.repo.branch,
    },
    additionalFiles: result.files
      .filter((f) => !renderedIds.has(allIds.get(f.path) ?? fileIdForPath(f.path)))
      .map((f) =>
        mapCityFile(
          f,
          allIds.get(f.path) ?? fileIdForPath(f.path),
          deadCodeCandidates,
          circular,
          allIds,
          missingFor,
        ),
      ),
    totalFiles: tree.fileCount,
    renderedFiles,
    totalLines: tree.linesOfCode,
    codeLines: tree.codeLines,
    dataLines: tree.dataLines,
    findingsBySeverity: tree.findingsBySeverity,
    findingsByCategory: tree.findingsByCategory,
    findingsInTests: tree.findingsInTests,
    findingsInData: tree.findingsInData,
    testFiles: tree.testFiles,
    unverifiedFiles: tree.unverifiedFiles,
    unverifiedEngines: [
      ...new Set([...new Set(files.map((f) => f.language))].flatMap(missingFor)),
    ].sort(),
    languages: languageTotals,
    dataLanguages: dataLanguageTotals,
    tree,
    fileConnections: [...fileEdgeMap.values()]
      .filter((e) => renderedIds.has(e.from) && renderedIds.has(e.to))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, FILE_CONNECTIONS_MAX),
    dirConnections: [...dirEdgeMap.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, DIR_CONNECTIONS_MAX),
    limits: {
      skylineTowers: DISTRICT_FILES_MAX,
      buildingsPerDirectory: perDirCap,
    },
    meta: {
      churn: hasChurn,
      deadCode: deadCodeCandidates.size > 0,
      duplicates: files.some((f) => f.clonePartners && f.clonePartners.length > 0),
      cycles: circular.size > 0,
      coverage: files.some((f) => f.coveragePct !== undefined),
      blame: files.some((f) => f.churn?.topAuthor),
    },
    scanProvenance: result.summary.scanProvenance,
    skippedByGitignore: result.summary.skippedByGitignore,
    dropped: result.summary.dropped,
  };
}

function mapCityFile(
  f: FileAnalysis,
  id: string,
  deadCodeCandidates: Set<string>,
  circular: Set<string>,
  idByPath?: Map<string, string>,
  missingFor?: (language: string) => string[],
): CityFile {
  const unverifiedBy = missingFor?.(f.language) ?? [];
  const findings = [...f.vulnerabilities]
    .sort((a, b) => (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0))
    // the file itself carries the role
    .map((v) => toCityFinding(v, undefined, f.path));
  const churn = f.churn;
  const clonePartners = f.clonePartners?.map((p) => ({
    id: idByPath?.get(p.path) ?? p.path,
    path: p.path,
    lines: p.lines,
  }));
  return {
    id,
    name: path.posix.basename(f.path),
    path: f.path,
    role: roleOf(f.path, f.language),
    language: f.language,
    linesOfCode: f.lines.code,
    cyclomaticComplexity: f.complexity?.cyclomatic ?? 1,
    threatLevel: threatLevelOf(f.vulnerabilities),
    findings,
    bytes: f.bytes,
    churnScore: churn?.score,
    commitCount: churn?.commits,
    daysSinceLastCommit: churn?.daysSinceLastCommit,
    topAuthor: churn?.topAuthor,
    exportedSymbols: f.exports.length,
    importCount: f.imports.length,
    deadCodeCandidate: deadCodeCandidates.has(f.path) || undefined,
    inCycle: circular.has(f.path) || undefined,
    coveragePct: f.coveragePct,
    clonePartners: clonePartners && clonePartners.length > 0 ? clonePartners : undefined,
    sections: f.sections && f.sections.length > 0 ? f.sections : undefined,
    unverifiedBy: unverifiedBy.length > 0 ? unverifiedBy : undefined,
  };
}
