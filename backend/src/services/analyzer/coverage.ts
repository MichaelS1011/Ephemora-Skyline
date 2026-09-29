/**
 * coverage — Parses lcov-format test-coverage reports left in the repo
 * (Jest, vitest with --coverage.reporter=lcov, pytest-cov, c8…).
 *
 * We never RUN tests — we read whatever coverage report the project
 * already carries, so the city can shield well-tested files and leave
 * untested ones exposed. Absent report → absent data → no shields, and
 * the provenance flag says so honestly.
 */

import { promises as fs } from "fs";
import path from "path";

/** Where coverage reports usually live (searched at depth ≤ 2) */
const CANDIDATE_PATHS = ["coverage/lcov.info", "coverage/lcov", "htmlcov/lcov.info", "lcov.info"];

export interface CoverageResult {
  /** relative path → percentage of lines covered (0..100) */
  byPath: Map<string, number>;
  /** which report file provided the data (for provenance) */
  source: string | null;
}

async function firstExisting(dirPath: string): Promise<string | null> {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      const full = path.join(dirPath, candidate);
      const stat = await fs.stat(full);
      if (stat.isFile()) return full;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Parse one lcov tracefile → path → covered% */
export function parseLcov(content: string): Map<string, number> {
  const byPath = new Map<string, number>();
  let current: string | null = null;
  let linesFound = 0;
  let linesHit = 0;

  const flush = (): void => {
    if (current && linesFound > 0) {
      byPath.set(current, Math.round((linesHit / linesFound) * 100));
    }
    current = null;
    linesFound = 0;
    linesHit = 0;
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "end_of_record") {
      flush();
      continue;
    }
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const tag = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    if (tag === "SF") {
      flush(); // safety: malformed trace without end_of_record
      current = value.replace(/^\.\//, "");
    } else if (tag === "LF") {
      linesFound = parseInt(value, 10) || 0;
    } else if (tag === "LH") {
      linesHit = parseInt(value, 10) || 0;
    }
  }
  flush();
  return byPath;
}

/** Find and parse a coverage report in the scanned directory. */
export async function collectCoverage(dirPath: string): Promise<CoverageResult> {
  const reportPath = await firstExisting(dirPath);
  if (!reportPath) return { byPath: new Map(), source: null };
  try {
    const content = await fs.readFile(reportPath, "utf-8");
    return { byPath: parseLcov(content), source: path.relative(dirPath, reportPath) };
  } catch {
    return { byPath: new Map(), source: null };
  }
}
