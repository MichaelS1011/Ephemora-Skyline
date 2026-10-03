import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { IgnoreMatcher } from "../src/services/analyzer/gitignore.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { SecurityScanner } from "../src/services/security/scanner.js";

describe("IgnoreMatcher — git's rules, the ones a real repo uses", () => {
  const m = (): IgnoreMatcher => new IgnoreMatcher();

  it("matches a bare name at any depth", () => {
    const i = m().add("", "secret.env\n");
    expect(i.isIgnored("secret.env")).toBe(true);
    expect(i.isIgnored("backend/secret.env")).toBe(true);
    expect(i.isIgnored("backend/other.env")).toBe(false);
  });

  it("treats a trailing slash as directory-only", () => {
    const i = m().add("", "tmp/\n");
    expect(i.isIgnored("tmp/scratch.ts")).toBe(true);
    expect(i.isIgnored("tmp")).toBe(false);
    expect(i.isIgnored("notes/tmp.txt")).toBe(false);
  });

  it("anchors patterns that contain a slash to the file's own folder", () => {
    const i = m().add("", "/dist.js\nscripts/build.sh\n");
    expect(i.isIgnored("dist.js")).toBe(true);
    expect(i.isIgnored("deep/dist.js")).toBe(false);
    expect(i.isIgnored("scripts/build.sh")).toBe(true);
    expect(i.isIgnored("other/scripts/build.sh")).toBe(false);
  });

  it("supports * ? and ** the way git documents them", () => {
    const i = m().add("", "*.log\ndocs/**/draft-*.md\na?c.txt\n");
    expect(i.isIgnored("build.log")).toBe(true);
    expect(i.isIgnored("docs/a/b/draft-api.md")).toBe(true);
    expect(i.isIgnored("docs/draft-api.md")).toBe(true);
    expect(i.isIgnored("abc.txt")).toBe(true);
    expect(i.isIgnored("ac.txt")).toBe(false);
    expect(i.isIgnored("deep/x.log")).toBe(true);
  });

  it("lets a later negation win, and only for what it names", () => {
    const i = m().add("", "*.log\n!keep.log\n");
    expect(i.isIgnored("keep.log")).toBe(false);
    expect(i.isIgnored("other.log")).toBe(true);
    expect(i.isIgnored("sub/keep.log")).toBe(false);
  });

  it("ignores blank lines and comments, and combines nested files", () => {
    const i = m().add("", "\n# a comment\n*.tmp\n").add("src", "!keep.tmp\n");
    expect(i.isIgnored("a.tmp")).toBe(true);
    expect(i.isIgnored("src/keep.tmp")).toBe(false);
    expect(i.isIgnored("src/other.tmp")).toBe(true);
    expect(i.isIgnored("other/keep.tmp")).toBe(true);
  });
});

describe("the pipeline leaves ignored files out of the city", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "codecity-ignore-test-"));
    await writeFile(
      path.join(dir, ".gitignore"),
      "generated/\n*.generated.json\n# keep this\n!keep.generated.json\n",
    );
    await writeFile(path.join(dir, "app.ts"), 'export const a = "real code";\n');
    await writeFile(path.join(dir, "notes.md"), "# not scanned at all\n");
    await writeFile(path.join(dir, "report.generated.json"), '{"huge":true}\n');
    await writeFile(path.join(dir, "keep.generated.json"), '{"kept":true}\n');
    await mkdir(path.join(dir, "generated"), { recursive: true });
    await writeFile(path.join(dir, "generated/bundle.ts"), "export const b = 1;\n");
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src/service.ts"), "export const s = 1;\n");
    await writeFile(path.join(dir, "src/.gitignore"), "local-only.ts\n");
    await writeFile(path.join(dir, "src/local-only.ts"), "export const l = 1;\n");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("skips what the rules name, keeps what they negate, and counts it", async () => {
    const orchestrator = new AnalysisOrchestrator(new SecurityScanner());
    const result = await orchestrator.analyzeDirectory("ignore-test", dir, {
      owner: "local",
      name: "ignore-test",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    });
    const seen = result.files.map((f) => f.path).sort();

    expect(seen).toEqual(["app.ts", "keep.generated.json", "src/service.ts"]);
    // report.generated.json and src/local-only.ts are files, generated/ is a
    // directory skipped whole — the count says which, because "3 entries"
    // would hide that a folder's contents were never even read.
    expect(result.summary.skippedByGitignore).toEqual({ files: 2, directories: 1 });
  }, // the real pipeline, which means the real batch engines: semgrep alone
  // needs longer than vitest's 5 s default on a six-file folder
  30_000);
});
