import { describe, expect, it } from "vitest";
import type { AnalysisResult, FileAnalysis } from "../src/models/index.js";
import { mapResultToCityData, type CityDir } from "../src/utils/cityMapper.js";

/**
 * BELEG-02 — the semantic-zoom claim, measured at both ends of its own range.
 *
 * README.md:82: "Scale-independent semantic zoom. The overview draws one block per
 * top-level folder — ten folders or ten thousand, the picture stays readable. …
 * Files that are not drawn show honestly as a podium (“+N more files”), never
 * silently dropped."
 *
 * A claim about independence of size can only be checked at two sizes, so the same
 * shape is built at ten top-level folders and at ten thousand, and the relations
 * that must not change are compared. `backend/tests/city-mapper.test.ts:143` already
 * pins the per-directory cap and `:179` the no-double-counting rule at the small
 * scale; this file is about what happens when the folder count grows.
 */

function makeFile(pathName: string, cyclomatic = 5): FileAnalysis {
  return {
    path: pathName,
    language: "TypeScript",
    lines: { total: 100, code: 80, comments: 10, blank: 10 },
    complexity: { cyclomatic },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: [],
  };
}

function makeResult(files: FileAnalysis[]): AnalysisResult {
  return {
    id: "beleg-scale",
    repo: {
      owner: "o",
      name: "n",
      branch: "main",
      cloneUrl: "u",
      analyzedAt: new Date(0).toISOString(),
    },
    files,
    directories: [],
    summary: {
      totalFiles: files.length,
      totalDirectories: 0,
      totalLines: files.reduce((s, f) => s + f.lines.total, 0),
      avgCyclomatic: 5,
      maxCyclomatic: 5,
      languages: { TypeScript: files.length },
      totalVulnerabilities: 0,
      vulnerabilitiesBySeverity: { P0: 0, P1: 0, P2: 0 },
    },
    createdAt: new Date(0).toISOString(),
    status: "complete",
  } as unknown as AnalysisResult;
}

/** `folder-<i>/file-<j>.ts` — ten files per folder, `count` folders. */
const foldersOf = (count: number, perFolder = 10): FileAnalysis[] =>
  Array.from({ length: count }, (_, i) =>
    Array.from({ length: perFolder }, (_, j) => makeFile(`folder-${i}/file-${j}.ts`)),
  ).flat();

const walk = (node: CityDir): CityDir[] => [node, ...node.children.flatMap(walk)];

/** Built once per scale: the mapping of 10 000 directories is not free. */
function atScale(blocks: number) {
  const city = mapResultToCityData(makeResult(foldersOf(blocks)));
  const nodes = walk(city.tree);
  return {
    city,
    /** top-level blocks the overview has to draw */
    topBlocks: city.tree.children.length,
    /** every directory node, root excluded */
    directories: nodes.length - 1,
    /** files the city says it drew */
    drawn: city.renderedFiles,
    /** files the city says it did not draw */
    notDrawn: city.additionalFiles?.length ?? 0,
    /** the promise: drawn + podium equals the folder's real size */
    total: city.totalFiles,
    /** per-directory honesty: detail + remaining equals the directory's own count */
    unaccounted: nodes
      .filter((n) => n !== city.tree)
      .filter((n) => n.detailFiles.length + n.remainingFiles !== n.fileCount)
      .map((n) => n.path),
  };
}

describe("one block per top-level folder, whatever the folder count (README.md:51)", () => {
  const ten = atScale(10);
  const tenThousand = atScale(10_000);

  it("draws ten blocks for ten folders", () => {
    expect(ten.topBlocks).toBe(10);
    expect(ten.directories).toBe(10);
  });

  it("draws ten thousand blocks for ten thousand folders instead of sampling them", () => {
    expect(tenThousand.topBlocks).toBe(10_000);
    expect(tenThousand.directories).toBe(10_000);
  });

  it("keeps the block-per-folder ratio at one on both scales", () => {
    expect(ten.topBlocks / 10).toBe(1);
    expect(tenThousand.topBlocks / 10_000).toBe(1);
  });

  it("accounts for every file on both scales, drawn or podium", () => {
    for (const scale of [ten, tenThousand]) {
      expect(scale.drawn + scale.notDrawn).toBe(scale.total);
      expect(scale.total).toBe(scale === ten ? 100 : 100_000);
    }
  });

  it("leaves no directory whose own files add up to less than it claims", () => {
    expect(ten.unaccounted).toEqual([]);
    expect(tenThousand.unaccounted).toEqual([]);
  });

  it("spends fewer drawn buildings per folder as the city grows, which is the readability half", () => {
    // the overview cannot draw a hundred thousand buildings; the cap is what keeps
    // the picture readable, and the remainder arrives as a number, not as silence
    const perFolder = (s: ReturnType<typeof atScale>): number => s.drawn / s.topBlocks;
    expect(perFolder(ten)).toBeGreaterThan(perFolder(tenThousand));
    expect(perFolder(tenThousand)).toBeGreaterThan(0);
  });
});
