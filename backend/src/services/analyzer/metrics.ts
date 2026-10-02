/**
 * Pure code-metric helpers — extracted from the orchestrator so they are
 * unit-testable in isolation and the pipeline stays readable.
 */

import path from "path";
import type { FileAnalysis } from "../../models/index.js";

// Simple language detection by extension
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".rb": "Ruby",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
  };
  return langMap[ext] || "Other";
}

/** Average cyclomatic complexity across a set of files (0 when empty) */
export function computeAvgComplexity(files: FileAnalysis[]): number {
  if (files.length === 0) return 0;
  const total = files.reduce((sum, f) => sum + f.complexity.cyclomatic, 0);
  return Math.round((total / files.length) * 100) / 100;
}

/** Languages that comment with `#` instead of `//`. */
function isHashCommentLanguage(language?: string): boolean {
  return language === "Python" || language === "Ruby";
}

/**
 * Blank out comments and string/template contents so the decision counter only
 * ever sees code. Newlines survive; only the characters in between change.
 *
 * Deliberately not handled: regex literals. Telling `/a|b/` from a division
 * needs real parsing, and a regex only disturbs the counter when it happens to
 * contain `&&`, `||` or a bare `?` — rarer than the parser it would cost.
 * Template `${…}` interpolations are code and get masked anyway, which
 * under-counts; masking the whole literal is the honest cheap side of that.
 */
function maskNonCode(code: string, hashComments: boolean): string {
  const out: string[] = [];
  const n = code.length;
  const blank = (ch: string): string => (ch === "\n" ? "\n" : " ");
  let i = 0;

  while (i < n) {
    const ch = code[i]!;
    const next = code[i + 1];

    if (ch === "#" && hashComments) {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "/" && !hashComments) {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        out.push(blank(code[i]!));
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const triple = code[i + 1] === ch && code[i + 2] === ch;
      const term = triple ? ch + ch + ch : ch;
      i += term.length;
      while (i < n) {
        if (code[i] === "\\") {
          out.push(blank(code[i]!), blank(code[i + 1] ?? " "));
          i += 2;
          continue;
        }
        if (code.slice(i, i + term.length) === term) {
          i += term.length;
          break;
        }
        out.push(blank(code[i]!));
        i++;
      }
      continue;
    }

    out.push(ch);
    i++;
  }
  return out.join("");
}

/**
 * Cyclomatic complexity: 1 + one per decision point. The number ships as
 * `cyclomaticComplexity` and becomes building height in the city, so it counts
 * branches and nothing else — no comments, no string contents, no reformatting.
 */
export function estimateCyclomaticComplexity(code: string, language?: string): number {
  const src = maskNonCode(code, isHashCommentLanguage(language));
  const count = (re: RegExp): number => (src.match(re) ?? []).length;

  let decisions =
    count(/\bif\b/g) -
    count(/\belse\s+if\b/g) + // `else if` is one branch, not two
    count(/\belse\b/g) +
    count(/\bwhile\b/g) +
    count(/\bfor\b/g) +
    count(/\bcase\b/g) +
    count(/\bcatch\b/g) +
    count(/&&|\|\||\?\?/g) +
    // a real ternary `?`: not `??`, not `?.`, not a TS `x?: T` annotation
    count(/(?<!\?)\?(?![?:.])/g);

  if (isHashCommentLanguage(language)) {
    decisions += count(/\belif\b/g) + count(/\bexcept\b/g) + count(/\band\b/g) + count(/\bor\b/g);
  }

  return Math.max(1, decisions + 1);
}

// Count lines of code
export function countLines(content: string): {
  total: number;
  code: number;
  comments: number;
  blank: number;
} {
  const lines = content.split("\n");
  let code = 0,
    comments = 0,
    blank = 0;

  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      blank++;
      continue;
    }

    if (inBlockComment) {
      comments++;
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      comments++;
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith("//")) {
      comments++;
      continue;
    }

    code++;
  }

  return { total: lines.length, code, comments, blank };
}

/** Extract function signatures from source code (regex-based) */
export function extractFunctions(content: string): Array<{
  name: string;
  line: number;
  parameters: number;
  complexity: number;
  isAsync: boolean;
}> {
  const functions: Array<{
    name: string;
    line: number;
    parameters: number;
    complexity: number;
    isAsync: boolean;
  }> = [];
  const lines = content.split("\n");

  // Match: function name(params), const name = (params) =>, export const name = async (params)
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
    /(\w+)\s*\(([^)]*)\)\s*(?::\s*\w[\w<>,\s?|&\n]*?)?\s*\{(?!\s*\/\*)/g,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(lines[i] || "")) !== null) {
        const name = match[1];
        if (!name) break;
        if (
          name === "if" ||
          name === "for" ||
          name === "while" ||
          name === "switch" ||
          name === "catch"
        )
          continue;
        const params = match[2] ? match[2].split(",").filter((p: string) => p.trim()).length : 0;
        functions.push({
          name,
          line: i + 1,
          parameters: params,
          complexity: 1, // replaced below with the real span
          isAsync: (lines[i] || "").includes("async"),
        });
        break; // One match per line
      }
    }
  }

  // A function's complexity is what happens inside it, not on its signature
  // line. The span runs to the next detected function (or EOF) — the same
  // line-range heuristic the voxel sections use, so the two never disagree
  // about where a block ends.
  for (let i = 0; i < functions.length; i++) {
    const start = functions[i]!.line;
    const end = functions[i + 1]?.line ?? lines.length + 1;
    functions[i]!.complexity = estimateCyclomaticComplexity(
      lines.slice(start - 1, end - 1).join("\n"),
    );
  }

  return functions.slice(0, 100); // Limit to avoid memory issues
}

/** Extract class definitions (regex-based) */
export function extractClasses(
  content: string,
): Array<{ name: string; line: number; methods: number }> {
  const classes: Array<{ name: string; line: number; methods: number }> = [];
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = classRegex.exec(content)) !== null) {
    // Count methods in this class (simplified: count indented functions after class declaration)
    const className = match[1]!;
    const classLine = content.slice(0, match.index).split("\n").length;
    const linesAfter = content.split("\n").slice(classLine - 1);
    let methods = 0;
    for (const line of linesAfter) {
      if (/^\s+(?:async\s+)?\w+\s*\(/.test(line)) methods++;
    }

    classes.push({ name: className, line: classLine, methods });
  }

  return classes;
}

// ── Sections (CodeBlocks voxel mapping) ────────────────────────────────────
/**
 * Sections turn a file into honest building blocks: 1 voxel = 1 code line,
 * a section = one block, nesting depth = terraces. Heuristic on purpose —
 * V1 has no AST. Known limits (documented, accepted):
 * - Brace languages: a section ends where the next function/class starts;
 *   top-level code between blocks rides along with the previous block.
 * - Python: a block ends at the first non-blank line that dedents to its
 *   own indentation. A dedented line inside a multi-line string ends the
 *   block early.
 * - Comment/blank detection is line-based; tricky mid-line cases slip
 *   through but never change start/end, only counted codeLines by ±1.
 */

/** Max sections shipped per file — overflow is consolidated, never hidden */
export const MAX_SECTIONS = 24;

export type SectionKind = "function" | "class" | "module" | "imports";

export interface Section {
  name: string;
  kind: SectionKind;
  /** 1-based, inclusive */
  start: number;
  /** 1-based, inclusive */
  end: number;
  codeLines: number;
  depth: number;
}

type SectionExisting = {
  functions: FileAnalysis["functions"];
  classes: FileAnalysis["classes"];
};

/** Lines that only carry a comment (# is a comment marker in Python/Ruby only) */
function isCommentLine(trimmed: string, pythonLike: boolean): boolean {
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return true;
  return pythonLike && trimmed.startsWith("#");
}

/** Leading indentation → terrace step: spaces/2 + tabs*4, top-level = 0 */
function indentStep(rawLine: string): number {
  let spaces = 0;
  let tabs = 0;
  for (const ch of rawLine) {
    if (ch === " ") spaces++;
    else if (ch === "\t") tabs++;
    else break;
  }
  return Math.floor(spaces / 2) + tabs * 4;
}

function lastNonBlankLine(lines: string[]): number {
  for (let i = lines.length; i >= 1; i--) {
    if ((lines[i - 1] ?? "").trim() !== "") return i;
  }
  return 0;
}

function countCodeLines(lines: string[], start: number, end: number, pythonLike: boolean): number {
  let count = 0;
  for (let i = start; i <= end && i <= lines.length; i++) {
    const trimmed = (lines[i - 1] ?? "").trim();
    if (trimmed === "" || isCommentLine(trimmed, pythonLike)) continue;
    count++;
  }
  return count;
}

function maxIndentStep(lines: string[], start: number, end: number, pythonLike: boolean): number {
  let max = 0;
  for (let i = start; i <= end && i <= lines.length; i++) {
    const raw = lines[i - 1] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || isCommentLine(trimmed, pythonLike)) continue;
    max = Math.max(max, indentStep(raw));
  }
  return max;
}

interface Landmark {
  line: number; // 1-based
  name: string;
  kind: "function" | "class";
  indent: number; // own indentation — drives the Python dedent heuristic
}

/** Merge parser output into deduped, sorted start lines (first name wins) */
function collectLandmarks(
  lines: string[],
  existing: SectionExisting,
  pythonLike: boolean,
): Landmark[] {
  const byLine = new Map<number, Landmark>();
  const add = (line: number, name: string, kind: "function" | "class"): void => {
    if (!Number.isFinite(line) || line < 1 || line > lines.length) return;
    if (byLine.has(line)) return;
    byLine.set(line, { line, name, kind, indent: indentStep(lines[line - 1] ?? "") });
  };
  // The brace-shaped regex parser above misses Python defs/classes — the
  // light scan below runs first for Python so correct names win the line.
  if (pythonLike) {
    const pyDef = /^\s*(?:async\s+)?def\s+(\w+)/;
    const pyClass = /^\s*class\s+(\w+)/;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const defMatch = pyDef.exec(raw);
      const match = defMatch ?? pyClass.exec(raw);
      if (match?.[1]) add(i + 1, match[1], defMatch ? "function" : "class");
    }
  }
  for (const fn of existing.functions ?? []) add(fn.line, fn.name, "function");
  for (const cls of existing.classes ?? []) add(cls.line, cls.name, "class");
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

const IMPORT_LINE =
  /^\s*(?:import\b|from\s+[\w.]+\s+import\b|export\b[^;\n]*\bfrom\b|require\s*\(|#(?:include|import)\b|using\s+\w+)/;

/** "imports" when the header region is import-only, else top-level "module" */
function headerKind(lines: string[], start: number, end: number, pythonLike: boolean): SectionKind {
  for (let i = start; i <= end && i <= lines.length; i++) {
    const trimmed = (lines[i - 1] ?? "").trim();
    if (trimmed === "" || isCommentLine(trimmed, pythonLike)) continue;
    if (!IMPORT_LINE.test(trimmed)) return "module";
  }
  return "imports";
}

/**
 * Python end line: the line before the first non-blank, non-comment line
 * whose indentation is ≤ the landmark's own (nested defs stay inside their
 * parent; the next top-level block starts its own section anyway).
 */
function pythonSectionEnd(lines: string[], landmark: Landmark): number {
  for (let i = landmark.line; i <= lines.length; i++) {
    const raw = lines[i - 1] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || isCommentLine(trimmed, true)) continue;
    if (i > landmark.line && indentStep(raw) <= landmark.indent) return i - 1;
  }
  return lastNonBlankLine(lines);
}

/**
 * Extract voxel sections for one file. `existing` carries the start lines
 * the regex parser already found (functions/classes); the section END is
 * heuristic — see the block comment above for V1 limits.
 */
export function extractSections(
  filePath: string,
  source: string,
  existing: SectionExisting,
): Section[] {
  const lines = source.split("\n");
  const language = detectLanguage(filePath);
  const pythonLike = language === "Python" || language === "Ruby";
  const landmarks = collectLandmarks(lines, existing, pythonLike);

  // No parseable structure → exactly one honest module block, whole file
  if (landmarks.length === 0) {
    return [
      {
        name: "module",
        kind: "module",
        start: 1,
        end: Math.max(1, lines.length),
        codeLines: countLines(source).code,
        depth: 0,
      },
    ];
  }

  const sections: Section[] = [];

  // Header block (file top → first landmark): the import/module prologue
  const first = landmarks[0]!;
  if (first.line > 1) {
    const kind = headerKind(lines, 1, first.line - 1, pythonLike);
    sections.push({
      name: kind,
      kind,
      start: 1,
      end: first.line - 1,
      codeLines: countCodeLines(lines, 1, first.line - 1, pythonLike),
      depth: 0,
    });
  }

  const lastNonBlank = lastNonBlankLine(lines);
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i]!;
    const next = landmarks[i + 1];
    let end: number;
    if (pythonLike) {
      end = pythonSectionEnd(lines, lm);
    } else {
      end = next ? next.line - 1 : lastNonBlank;
    }
    if (end < lm.line) end = lm.line;
    sections.push({
      name: lm.name,
      kind: lm.kind,
      start: lm.line,
      end,
      codeLines: countCodeLines(lines, lm.line, end, pythonLike),
      depth: maxIndentStep(lines, lm.line, end, pythonLike),
    });
  }

  // Python dedent keeps nested defs inside their parent's line range — the
  // parent range therefore overlaps its children. Every code line must be
  // represented by exactly ONE voxel: subtract each directly contained child
  // from its parent (grandchildren ride along through their own parent).
  if (pythonLike) {
    const contains = (a: Section, b: Section): boolean =>
      b !== a && b.start >= a.start && b.end <= a.end;
    const directChildOf = (j: Section): Section | null => {
      let best: Section | null = null;
      for (const k of sections) {
        if (!contains(k, j)) continue;
        if (!best || (k.start >= best.start && k.end <= best.end)) best = k;
      }
      return best;
    };
    for (const parent of sections) {
      let childSum = 0;
      for (const child of sections) {
        if (directChildOf(child) === parent) childSum += child.codeLines;
      }
      if (childSum > 0) parent.codeLines = Math.max(0, parent.codeLines - childSum);
    }
  }

  // Cap: consolidate overflow into one trailing module chunk (sum keeps
  // every code line on the map — the city stays honest about the total)
  if (sections.length > MAX_SECTIONS) {
    const kept = sections.slice(0, MAX_SECTIONS - 1);
    const rest = sections.slice(MAX_SECTIONS - 1);
    kept.push({
      name: "module",
      kind: "module",
      start: rest[0]!.start,
      end: rest[rest.length - 1]!.end,
      codeLines: rest.reduce((s, r) => s + r.codeLines, 0),
      depth: rest.reduce((m, r) => Math.max(m, r.depth), 0),
    });
    return kept;
  }

  return sections;
}
