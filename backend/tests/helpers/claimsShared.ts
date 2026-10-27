import { expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import type { emptyDroppedFiles } from "../../src/services/analyzer/orchestrator.js";

/**
 * The pieces both claims guards share, after the 2026-10-16 split of
 * `public-surface-claims.test.ts` into `claims-surface.test.ts` (the cheap
 * family: badges, CI steps, licence and manifests, ports and startup, forbidden
 * wordings, citations) and `claims-counts.test.ts` (the expensive family: the
 * number guards, `walkWithShippedRules` over the whole checkout included, the
 * portable fixture proof, the file- and case-count claims).
 *
 * Nothing moved here changed shape: the same code, the same failure messages,
 * the same expectations. Only the file it lives in did, so that a typo in a
 * badge line no longer pays for a walk of the tree, and a red case names its
 * family.
 *
 * No file here is named `*.test.ts`: this is a helper, not a published test
 * file, and it must not move the suite's file count.
 */
export const REPO = path.resolve(import.meta.dirname, "../../..");
export const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
export const exists = (rel: string): boolean => existsSync(path.join(REPO, rel));

/** What a first reader opens, in the order they open it. */
export const SURFACES = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/GETTING_STARTED.md",
  "docs/ARCHITECTURE.md",
  "docs/API.md",
  "docs/PRIVACY.md",
  "docs/LIMITS.md",
  "docs/SCANNERS.md",
];

export type Manifest = {
  license?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  repository?: { url?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type Badge = { alt: string; src: string; label: string; value: string; raw: string };

/**
 * The exported pieces of the browser's reader that the walk needs: the skip-list
 * the directory walk prunes with, and the ONE selection decision both pickers
 * make for every path. Nothing here re-implements a predicate.
 */
export type ClientReader = {
  SKIP_DIRS: RegExp;
  classifyCandidate: (
    rel: string,
    file: File,
    excludes: string[],
    plan: PickerPlan,
    ignores: IgnoreMatcherLike | null,
  ) => void;
};

/** The plan the reader accumulates into — the shape of `FolderPlan`. */
export type PickerPlan = {
  candidates: Array<{ rel: string; git: boolean }>;
  found: number;
  bytes: number;
  dropped: ReturnType<typeof emptyDroppedFiles>;
  overCap: boolean;
  setAside: Set<string>;
};

export type IgnoreMatcherLike = {
  add: (dir: string, text: string) => void;
  isIgnored: (rel: string, kind: "file" | "dir") => boolean;
};

export type ClientGitignore = { IgnoreMatcher: new () => IgnoreMatcherLike };

/** What one walk over one folder learned, in the two numbers the screen shows. */
export type WalkResult = {
  /** files the folder offered, `.git` excluded — the number the two add up to */
  files: number;
  /** paths in the history branch: sent in their own budget, never scanned */
  gitFiles: number;
  /** what the browser's reader admitted to the read */
  admitted: number;
  /** what the scan read of those — the number printed under "Scan complete" */
  analysed: number;
  dropped: ReturnType<typeof emptyDroppedFiles>;
  setAside: string[];
};

/** The address the repository publishes about itself. */
export function repoSlug(): string {
  const url = (JSON.parse(read("package.json")) as { repository?: { url?: string } }).repository
    ?.url;
  const slug = url?.match(/github\.com\/([^/\s]+)\/([^/\s.]+)/);
  expect(url, "package.json must carry a repository url").toBeTruthy();
  expect(slug, `repository url is not a GitHub address: ${url}`).toBeTruthy();
  return `${slug![1]}/${slug![2]}`;
}

/**
 * Paths git does not track yet and does not ignore either — the work a lane
 * leaves in the tree while it runs. Every count in this family describes the
 * CHECKOUT a stranger clones, so these are skipped: without the skip the same
 * commit reads 610 admitted files in CI and 613 at a desk with an open lane,
 * and then the published number can be true in only one of the two places.
 * This narrows nothing — it moves the measurement off the working tree and
 * onto the thing the sentence is about.
 */
let untrackedWork: Set<string> | null = null;
export function isUntrackedWork(rel: string): boolean {
  if (!untrackedWork) {
    const out = execFileSync(
      "git",
      ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard"],
      { cwd: REPO, encoding: "utf8" },
    );
    untrackedWork = new Set(out.split("\n").filter(Boolean));
  }
  return untrackedWork.has(rel);
}

/**
 * Test files under one directory, counted recursively: the number a stranger
 * gets by naming the four test-file shapes to `find` under that directory and
 * counting the lines, which is why the file counts belong in this guard and the
 * case counts do not — a case count comes out of a run, never out of the tree.
 */
export function testFileCount(dir: string): number {
  const pattern = /\.(test|spec)\.(ts|tsx)$/;
  let count = 0;
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (pattern.test(entry.name) && !isUntrackedWork(path.relative(REPO, child))) count += 1;
    }
  };
  walk(path.join(REPO, dir));
  return count;
}

/** One `const NAME = <expr>;` literal read out of a source file. */
export function constExpr(rel: string, name: string): string {
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(read(rel));
  expect(m, `${rel} no longer declares const ${name} = <literal>;`).toBeTruthy();
  return m![1]!.trim();
}

export const evaluate = (expr: string): number =>
  expr.split("*").reduce((acc, factor) => acc * Number(factor.trim().replace(/_/g, "")), 1);

/**
 * Import the frontend module the same URL the browser's bundler resolves. The
 * base is kept at `backend/tests/`, which is where the call sites' relative
 * specifiers were written, so a moved caller resolves the identical file.
 */
export async function importClient<T>(rel: string): Promise<T> {
  const spec = new URL(rel, new URL("../", import.meta.url)).href;
  return (await import(/* @vite-ignore */ spec)) as unknown as T;
}
