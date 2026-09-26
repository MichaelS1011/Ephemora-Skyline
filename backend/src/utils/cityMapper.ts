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
 */

import path from "path";
import type { AnalysisResult, FileAnalysis } from "../models/index.js";

export type Severity = "P0" | "P1" | "P2";

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
  line: number;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
  /** Plain-language explanation of the finding class */
  explanation?: string;
  /** Standard taxonomy reference, e.g. "CWE-89" */
  cwe?: string;
  /** Authoritative documentation link (OWASP/CWE/semgrep/advisory) */
  refUrl?: string;
  /** Code frame around the flagged line — where exactly the problem lives */
  snippet?: CitySnippet;
}

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  linesOfCode: number;
  cyclomaticComplexity: number;
  threatLevel: ThreatLevel;
  findings: CityFinding[];
}

export interface CityDir {
  name: string; // last path segment; '' for the root
  path: string; // directory path relative to repo root; '' for root
  fileCount: number; // files in the whole subtree (full, uncapped)
  linesOfCode: number; // Σ code lines in subtree
  languages: Record<string, number>; // language → code lines (subtree)
  findingsBySeverity: Record<Severity, number>; // subtree finding counts
  threatScore: number; // weighted: P0×10 + P1×7 + P2×3 (subtree)
  topFindings: CityFinding[]; // worst findings in subtree (max 3)
  children: CityDir[]; // subdirectories (sorted by linesOfCode desc)
  detailFiles: CityFile[]; // files rendered as buildings when opened
  remainingFiles: number; // subtree files not individually rendered
  /**
   * Up to 6 representative files of the WHOLE subtree (most at-risk +
   * largest) — rendered as the district's skyline while zoomed out.
   */
  districtFiles: CityFile[];
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
  repo: { owner: string; name: string; branch: string };
  totalFiles: number; // full analyzed file count (uncapped)
  renderedFiles: number; // Σ detailFiles across the tree
  totalLines: number;
  findingsBySeverity: Record<Severity, number>;
  languages: Record<string, number>;
  tree: CityDir;
  fileConnections: FileConnection[];
  dirConnections: DirConnection[];
}

// ── Budgets ────────────────────────────────────────────────────────────────

/** Max buildings rendered per directory when a block is opened. */
const DETAIL_FILES_PER_DIR = 35;
/** Global budget for individually rendered files across the whole city. */
const DETAIL_FILES_TOTAL = 1400;
/** Findings listed per file in the UI (rest still counted in aggregates). */
const FINDINGS_PER_FILE = 6;
/** File-level connection edges shipped to the client (dir edges separate). */
const FILE_CONNECTIONS_MAX = 400;
const DIR_CONNECTIONS_MAX = 200;

const SEVERITY_SCORE: Record<Severity, number> = { P0: 10, P1: 7, P2: 3 };
const SEVERITY_ORDER: Severity[] = ["P0", "P1", "P2"];

/** Representative towers per district skyline (rendered while zoomed out). */
const DISTRICT_FILES_MAX = 6;

/** Weight a subtree file for skyline selection: risk dominates, size breaks ties. */
function skylineWeight(f: FileAnalysis): number {
  const risk = f.vulnerabilities.reduce((s, v) => s + (SEVERITY_SCORE[v.severity] ?? 0), 0);
  return risk * 10_000 + Math.min(f.lines.code, 2000);
}

function emptySeverityCount(): Record<Severity, number> {
  return { P0: 0, P1: 0, P2: 0 };
}

function toCityFinding(v: FileAnalysis["vulnerabilities"][number]): CityFinding {
  const enriched = v as unknown as {
    provenance?: string;
    ruleId?: string;
    explanation?: string;
    cwe?: string;
    refUrl?: string;
    snippet?: CityFinding["snippet"];
  };
  return {
    type: v.type,
    severity: v.severity,
    line: v.line,
    message: v.message,
    fix: v.fix,
    provenance: enriched.provenance,
    ruleId: enriched.ruleId,
    explanation: enriched.explanation,
    cwe: enriched.cwe,
    refUrl: enriched.refUrl,
    snippet: enriched.snippet,
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
  return worst * 1000 + Math.min(f.lines.code, 1000);
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

// ── Main mapping ───────────────────────────────────────────────────────────

export function mapResultToCityData(result: AnalysisResult): CityData {
  const files = result.files ?? [];
  const pathSet = new Set(files.map((f) => f.path));
  const rawByPath = new Map(files.map((f) => [f.path, f]));

  // Stable ids for every analyzed file (detail or not — dir-level
  // aggregation uses ALL resolved edges, not just rendered buildings).
  const allIds = new Map<string, string>();
  files.forEach((f, i) => allIds.set(f.path, `f-${i}`));

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
      languages: {},
      findingsBySeverity: emptySeverityCount(),
      threatScore: 0,
      topFindings: [],
      children: [],
      detailFiles: [],
      remainingFiles: 0,
      districtFiles: [],
    };

    const aggregateFile = (f: FileAnalysis): void => {
      dirNode.fileCount += 1;
      dirNode.linesOfCode += f.lines.code;
      dirNode.languages[f.language] = (dirNode.languages[f.language] ?? 0) + f.lines.code;
      for (const v of f.vulnerabilities) {
        dirNode.findingsBySeverity[v.severity] = (dirNode.findingsBySeverity[v.severity] ?? 0) + 1;
        dirNode.threatScore += SEVERITY_SCORE[v.severity] ?? 0;
      }
      if (f.vulnerabilities.length > 0) {
        dirNode.topFindings.push(...f.vulnerabilities.map(toCityFinding));
      }
    };

    node.files.forEach(aggregateFile);
    node.children.forEach((child) => {
      const cityChild = buildCityDir(child);
      dirNode.children.push(cityChild);
      dirNode.fileCount += cityChild.fileCount;
      dirNode.linesOfCode += cityChild.linesOfCode;
      for (const [lang, lines] of Object.entries(cityChild.languages)) {
        dirNode.languages[lang] = (dirNode.languages[lang] ?? 0) + lines;
      }
      for (const sev of SEVERITY_ORDER) {
        dirNode.findingsBySeverity[sev] += cityChild.findingsBySeverity[sev];
      }
      dirNode.threatScore += cityChild.threatScore;
      dirNode.topFindings.push(...cityChild.topFindings);
    });

    dirNode.children.sort((a, b) => b.linesOfCode - a.linesOfCode);
    dirNode.topFindings = dirNode.topFindings
      .sort((a, b) => (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0))
      .slice(0, 3);

    // Detail files: the most security-relevant / largest files DIRECTLY in
    // this directory — sorted deterministically, capped per budget.
    const detail = [...node.files]
      .sort((a, b) => fileSortKey(b) - fileSortKey(a))
      .slice(0, perDirCap)
      .map((f) => mapCityFile(f, allIds.get(f.path) ?? `f-${f.path}`));
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
      .map((f) => mapCityFile(f, allIds.get(f.path) ?? `f-${f.path}`));

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

  return {
    repo: {
      owner: result.repo.owner,
      name: result.repo.name,
      branch: result.repo.branch,
    },
    totalFiles: tree.fileCount,
    renderedFiles,
    totalLines: tree.linesOfCode,
    findingsBySeverity: tree.findingsBySeverity,
    languages: languageTotals,
    tree,
    fileConnections: [...fileEdgeMap.values()]
      .filter((e) => renderedIds.has(e.from) && renderedIds.has(e.to))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, FILE_CONNECTIONS_MAX),
    dirConnections: [...dirEdgeMap.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, DIR_CONNECTIONS_MAX),
  };
}

function mapCityFile(f: FileAnalysis, id: string): CityFile {
  const findings = [...f.vulnerabilities]
    .sort((a, b) => (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0))
    .slice(0, FINDINGS_PER_FILE)
    .map(toCityFinding);
  return {
    id,
    name: path.posix.basename(f.path),
    path: f.path,
    language: f.language,
    linesOfCode: f.lines.code,
    cyclomaticComplexity: f.complexity?.cyclomatic ?? 1,
    threatLevel: threatLevelOf(f.vulnerabilities),
    findings,
  };
}
