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

// Estimate cyclomatic complexity from code (simple heuristic)
export function estimateCyclomaticComplexity(code: string): number {
  const decisions = (code.match(/\b(if|else\s+if|while|for|catch|case|&&|\|\||\?)\b/g) || [])
    .length;
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
          complexity: estimateCyclomaticComplexity(lines[i] || ""),
          isAsync: (lines[i] || "").includes("async"),
        });
        break; // One match per line
      }
    }
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
