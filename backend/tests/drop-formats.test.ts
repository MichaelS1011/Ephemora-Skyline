import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import type { SecurityScanner } from "../src/services/security/scanner.js";
import type { GitHubRepo } from "../src/models/index.js";

/**
 * Measured with a local measurement script that is not shipped over real folders on
 * this machine: `docs/` held 17 files, the scan read 0 of them, and the result
 * claimed 0 files went unread; `frontend/` 200 → 196 → 0; `backend/` 104 → 103
 * → 0. A folder of documents rendered an empty city and said nothing about why,
 * which is the one case where the number on the screen is a lie by omission.
 * The selection decision at orchestrator.ts:244 already had five counted reasons
 * and this was the sixth.
 */

/** No engine runs here: this test is about which paths join the scan. */
function countingScanner(): SecurityScanner {
  return {
    setConfig: () => {},
    enableBatchScans: () => {},
    scanFile: () => [],
    scanFileStructure: () => ({ imports: [], exports: [] }),
    scanRepositoryBatch: async () => ({
      gitleaksRan: false,
      semgrepRan: false,
      ruffRan: false,
      osvRan: false,
    }),
    scanDependencies: async () => ({ issuesByFile: new Map(), executed: false }),
    countBySeverity: () => ({ P0: 0, P1: 0, P2: 0 }),
  } as unknown as SecurityScanner;
}

const repo = (name: string): GitHubRepo => ({
  owner: "local",
  name,
  branch: "main",
  cloneUrl: "",
  analyzedAt: new Date().toISOString(),
});

describe("a file the scan's own format list excludes is counted, not assumed away", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "codecity-drop-formats-"));
    const files: Record<string, string> = {
      "src/app.ts": "export function app(): number { return 3 }\n",
      "README.md": "# demo\n",
      "notes.txt": "loose note\n",
      "img/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
      LICENSE: "MIT\n",
    };
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("names the four unread files of a five-file folder", async () => {
    const orchestrator = new AnalysisOrchestrator(countingScanner());
    const result = await orchestrator.analyzeDirectory("drop-formats", dir, repo("drop-formats"));

    expect(result.summary.totalFiles).toBe(1);
    expect(result.summary.dropped?.unsupportedFormat).toBe(4);
    // The folder's whole account adds up: read + unread = what was on disk.
    const unread = Object.values(result.summary.dropped ?? {}).reduce(
      (sum, n) => sum + (Number.isFinite(n) ? n : 0),
      0,
    );
    expect(result.summary.totalFiles + unread).toBe(5);
  });

  it("keeps the other reasons counting what they always counted", async () => {
    const orchestrator = new AnalysisOrchestrator(countingScanner());
    const result = await orchestrator.analyzeDirectory("drop-formats", dir, repo("drop-formats"));
    const dropped = result.summary.dropped;
    expect(dropped).toMatchObject({
      pathTooLong: 0,
      unsafePath: 0,
      tooLarge: 0,
      unreadable: 0,
      excluded: 0,
      // the browser's .gitignore ledger is the browser's; a staged walk reports
      // its own count in `skippedByGitignore` and keeps these two at zero
      gitIgnored: 0,
      gitBudget: 0,
    });
  });
});
