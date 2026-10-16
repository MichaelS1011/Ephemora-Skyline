import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import type { SecurityScanner } from "../src/services/security/scanner.js";
import { quietScanner, type DependencyAnswer } from "./helpers/scanners.js";
import type { AnalysisResult, FileAnalysis, GitHubRepo } from "../src/models/index.js";

/**
 * provenanz-verdrahtung — the wire between `scanner.scanDependencies()` and
 * `summary.scanProvenance`, and nothing else.
 *
 * The bug this pins sat in neither the scanner nor the panel. It sat in the two
 * assignments in `orchestrator.ts` that carry one into the other: phase 3c
 * writing the answer into `depsRan` / `depsRunner`, and the payload phase 5
 * builds out of those into `dependencies` / `dependencyRunner`. The scanner
 * answered the CVE question and named the engine that answered it; the summary
 * said something else. The pipeline tests around this wire read the phases, not
 * the assignments, so the defect only made noise when unrelated behaviour
 * happened to change — which is another way of saying nothing checked it.
 *
 * So this file checks the wire alone: one stubbed `scanDependencies`, one value
 * in, the one pair of summary fields out. Every case names the line it expects
 * to be broken, because "expected null" describes no bug and "phase 3c's runner
 * never reached the payload" describes this one.
 *
 * What runs here: nothing. No engine, no socket, no child process — the scanner
 * is `quietScanner()` from `helpers/scanners.ts`, which starts none. The folder is
 * three tiny files inside a temp directory this test makes and removes, and the
 * only question asked of the pipeline is what it writes down about a dependency
 * answer it was handed. `git churn` stays off because the folder has no `.git`,
 * `coverage` stays off because it holds no lcov report, and the batch scan is
 * stubbed to report every engine as not-run — so the only provenance fields that
 * can move are the two under test.
 *
 * What is deliberately NOT claimed here: that a real engine ever answered, that
 * `added` findings landed on a file (the summary carries no such count), or that
 * the panel renders the pair. Those live on the other side of this wire and are
 * checked where they are produced.
 */

type Ask = { dirPath: string; files: number };

/**
 * A scanner that answers exactly one question, and records where it was asked:
 * a wire nobody called is a wire that cannot be tested.
 *
 * This is `quietScanner()` with one method replaced. Its defaults are already the
 * answer this file needs — no engine reports itself as run, so a pass of any other
 * provenance flag can only mean the wire under test moved — and `scanDependencies`
 * is the one method that has to both record the call and hand back the case's own
 * answer.
 */
function wiringScanner(answer: () => Promise<DependencyAnswer>): {
  scanner: SecurityScanner;
  asks: Ask[];
} {
  const asks: Ask[] = [];
  const scanner = quietScanner({
    scanDependencies: async (dirPath: string, files: FileAnalysis[]) => {
      asks.push({ dirPath, files: files.length });
      return answer();
    },
  });
  return { scanner, asks };
}

const repo = (name: string): GitHubRepo => ({
  owner: "local",
  name,
  branch: "local",
  cloneUrl: "",
  analyzedAt: new Date().toISOString(),
});

/** Three files the pipeline really reads, so phase 5 has a summary to build. */
const FOLDER: Record<string, string> = {
  "src/index.ts": "export function app(): number { return 3 }\n",
  "src/util.ts": "export const THREE = 3;\n",
  "package.json": '{"name":"provenanz-wire","private":true}\n',
};

let project = "";

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codecity-provenanz-wire-"));
  project = path.join(root, "project");
  for (const [rel, content] of Object.entries(FOLDER)) {
    const abs = path.join(project, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
  }
});

afterAll(async () => {
  if (project) await rm(path.dirname(project), { recursive: true, force: true });
});

/** One whole pipeline run over the folder, with the dependency answer the case hands it. */
async function runPipeline(
  answer: () => Promise<DependencyAnswer>,
): Promise<{ result: AnalysisResult; asks: Ask[] }> {
  const { scanner, asks } = wiringScanner(answer);
  const result = await new AnalysisOrchestrator(scanner).analyzeDirectory(
    "provenanz-wire",
    project,
    repo("provenanz-wire"),
  );
  return { result, asks };
}

/** The two fields the wire writes. `undefined` means the payload dropped them. */
function fieldsOf(result: AnalysisResult): {
  dependencies: boolean | undefined;
  dependencyRunner: string | null | undefined;
} {
  const provenance = result.summary.scanProvenance;
  expect(
    provenance,
    "phase 5 built a summary with no scanProvenance at all, so the panel reads nothing " +
      "about which engines took part",
  ).toBeTruthy();
  return {
    dependencies: provenance?.dependencies,
    dependencyRunner: provenance?.dependencyRunner,
  };
}

describe("the wire from scanner.scanDependencies() to summary.scanProvenance", () => {
  it("hands phase 3c the folder the scan reads, after reading its files", async () => {
    const { result, asks } = await runPipeline(async () => ({
      executed: true,
      added: 0,
      runner: "osv",
    }));

    // Without this, every case below could pass on a stub nobody called.
    expect(asks.length, "phase 3c never asked the scanner the dependency question").toBe(1);
    expect(
      asks[0]!.dirPath,
      "the dependency question was asked about another folder than the one the scan reads",
    ).toBe(project);
    expect(
      asks[0]!.files,
      "phase 3c ran before the files were parsed, so findings had no building to attach to",
    ).toBe(Object.keys(FOLDER).length);
    expect(
      result.summary.totalFiles,
      `the pipeline read ${Object.keys(FOLDER).length} tiny files and put ${result.summary.totalFiles} in the summary`,
    ).toBe(Object.keys(FOLDER).length);
  });

  it("carries an osv answer through: dependencies true, runner osv", async () => {
    const { result } = await runPipeline(async () => ({
      executed: true,
      added: 0,
      runner: "osv",
    }));
    const fields = fieldsOf(result);

    expect(
      fields.dependencies,
      "scanDependencies said executed:true and summary.scanProvenance.dependencies does not " +
        "say so — the assignment in phase 3c or in phase 5's payload is broken",
    ).toBe(true);
    expect(
      fields.dependencyRunner,
      "the scanner named osv and the summary names another engine — the card would credit " +
        "`npm audit` for a scan only osv-scanner took part in",
    ).toBe("osv");
  });

  /**
   * The pair of the two cases above is what makes them one check: an
   * implementation that hard-codes a runner passes exactly one of them.
   */
  it("carries an npm-audit answer through: dependencies true, runner npm-audit", async () => {
    const { result } = await runPipeline(async () => ({
      executed: true,
      added: 0,
      runner: "npm-audit",
    }));
    const fields = fieldsOf(result);

    expect(
      fields.dependencies,
      "an audit that ran must set summary.scanProvenance.dependencies — a clean audit is an " +
        "audit that ran, and reporting it as not-run tells the reader a depth gap they do not have",
    ).toBe(true);
    expect(
      fields.dependencyRunner,
      "scanDependencies named npm-audit and the summary lost the name on the way to the payload",
    ).toBe("npm-audit");
  });

  it("reports nothing ran as nothing ran: dependencies false, runner null", async () => {
    const { result } = await runPipeline(async () => ({
      executed: false,
      added: 0,
      runner: null,
    }));
    const fields = fieldsOf(result);

    expect(
      fields.dependencies,
      "the scanner declined the dependency question and the summary still claims it ran — " +
        "the panel would call a lockfile nobody checked audited",
    ).toBe(false);
    expect(
      fields.dependencyRunner,
      "no engine answered, so the summary may not name one",
    ).toBeNull();
  });

  /**
   * The half that used to fail in the other direction: an audit that ran but
   * could not say which engine ran it. True plus a name nobody heard is the
   * invention this guards against, not a gap to fill in.
   */
  it("does not invent a runner for an executed audit that named none", async () => {
    const { result } = await runPipeline(async () => ({
      executed: true,
      added: 0,
      runner: null,
    }));
    const fields = fieldsOf(result);

    expect(
      fields.dependencies,
      "executed:true is an answer the summary owes, even when the engine stays unnamed",
    ).toBe(true);
    expect(
      fields.dependencyRunner,
      "phase 3c handed the payload no runner and the payload produced one anyway — a name the " +
        "card will put on an engine that never ran",
    ).toBeNull();
  });

  /**
   * A dependency audit is the phase most likely to be unavailable — no binary on
   * `PATH`, no network, an unparsable lockfile — and it is the phase whose failure
   * the reader cannot see. Throwing must not end the scan, and must not leave a
   * provenance field that reads as having run.
   */
  it("finishes the scan when scanDependencies throws, and says which parts it lost", async () => {
    const { result } = await runPipeline(async () => {
      throw new Error("osv-scanner is not on PATH");
    });
    const fields = fieldsOf(result);

    expect(
      result.status,
      "a failed dependency audit took the whole analysis down with it — the folder was read, " +
        "parsed and scanned, and the city still has to be built",
    ).toBe("complete");
    expect(
      result.summary.totalFiles,
      "the scan completed over files it never kept after the audit phase threw",
    ).toBe(Object.keys(FOLDER).length);
    expect(
      fields.dependencies,
      "the audit threw and the summary still claims dependencies were checked",
    ).toBe(false);
    expect(
      fields.dependencyRunner,
      "an exception is not an engine — the summary names a runner for a scan that never started",
    ).toBeNull();
  });
});
