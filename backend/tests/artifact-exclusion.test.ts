import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  AnalysisOrchestrator,
  isArtifactPath,
  isScanCandidate,
} from "../src/services/analyzer/orchestrator.js";
import { quietScanner } from "./helpers/scanners.js";

/**
 * Measured with a local measurement script that is not shipped over a fixture of the
 * traces a tool run leaves in a user repo: ALL eight artifact files (Playwright
 * report, test-results, blob-report, storybook-static, .nyc_output) joined the
 * scan, while five real sources silently did not — the old candidate check
 * matched path PREFIXES without a boundary, so `.gitlab-ci.yml`,
 * `.github/workflows/ci.yml`, `distribute.ts`, `builder/main.ts` and
 * `coverage-notes/readme.ts` were excluded as ".git*", "dist*", "build*",
 * "coverage*" copy. One file never scanned is one file the city must not
 * paint clean — the exclusion decision belongs to the analyzer's file
 * selection, in exactly one place.
 *
 * The pipeline case used to build a real `SecurityScanner` for that question and
 * so forked gitleaks, semgrep, ruff, osv-scanner and `npm audit` over ten small
 * temp files: measured 18,5 s of test time at load 50, inside a 60 s budget. It
 * now takes the quiet scanner from `helpers/scanners.ts`, with `{ regex: true }`
 * keeping the shipped regex catalogue over the same ten files. The case counts which
 * paths joined the scan and asserts nothing about findings, so nothing here changed
 * except the forks.
 */
describe("artifact exclusion — the single file-selection decision", () => {
  it("keeps tool output out of the scan at any depth", () => {
    for (const p of [
      "playwright-report/index.html",
      "playwright-report/data/trace.json",
      "frontend/test-results/.last-run.json",
      "blob-report/report-1.json",
      "storybook-static/sb-addons/manager.js",
      ".nyc_output/out.json",
      "node_modules/pkg/index.js",
      "backend/dist/bundle.js",
      "coverage/lcov-report/index.html",
      ".turbo/turbo-build.log",
    ]) {
      expect(isScanCandidate(p), p).toBe(false);
      expect(isArtifactPath(p), p).toBe(true);
    }
  });

  it("does not mistake a name that merely starts with an artifact word for one", () => {
    for (const p of [
      ".github/workflows/ci.yml",
      ".gitlab-ci.yml",
      "distribute.ts",
      "builder/main.ts",
      "coverage-notes/readme.ts",
      "dist-utils/format.ts",
      "building-blocks/card.tsx",
    ]) {
      expect(isScanCandidate(p), p).toBe(true);
      expect(isArtifactPath(p), p).toBe(false);
    }
  });

  it("still excludes the .git internals but nothing else dot-git shaped", () => {
    expect(isArtifactPath(".git/config")).toBe(true);
    expect(isArtifactPath("hooks/.git/pre-commit")).toBe(true);
    expect(isArtifactPath(".gitattributes")).toBe(false);
    expect(isArtifactPath(".gitignore")).toBe(false);
  });
});

describe("the pipeline walks artifacts out and real sources back in", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "codecity-artifacts-"));
    const files: Record<string, string> = {
      "playwright-report/index.html": "<html><body>report</body></html>\n",
      "playwright-report/data/trace.json": '{"events": []}\n',
      "test-results/suite/error-context.json": '{"page": "x"}\n',
      "blob-report/blob-1.json": '{"tests": []}\n',
      "storybook-static/index.html": "<html>sb</html>\n",
      ".nyc_output/out.json": '{"cov": 1}\n',
      ".github/workflows/ci.yml":
        "name: ci\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
      "distribute.ts": "export function distribute(): number { return 1 }\n",
      "builder/main.ts": "export function build(): number { return 2 }\n",
      "src/app.ts": "export function app(): number { return 3 }\n",
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

  it("scans the real sources and none of the tool traces", async () => {
    const orchestrator = new AnalysisOrchestrator(quietScanner({ regex: true }));
    const result = await orchestrator.analyzeDirectory("artifact-test", dir, {
      owner: "local",
      name: "artifact-test",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    });
    const paths = new Set(result.files.map((f) => f.path));
    for (const should of [
      ".github/workflows/ci.yml",
      "distribute.ts",
      "builder/main.ts",
      "src/app.ts",
    ])
      expect(paths, should).toContain(should);
    for (const not of [
      "playwright-report/index.html",
      "playwright-report/data/trace.json",
      "test-results/suite/error-context.json",
      "blob-report/blob-1.json",
      "storybook-static/index.html",
      ".nyc_output/out.json",
    ])
      expect(paths, not).not.toContain(not);
  }, 60_000); // headroom only; the quiet scanner walks this folder in well under a second
});
