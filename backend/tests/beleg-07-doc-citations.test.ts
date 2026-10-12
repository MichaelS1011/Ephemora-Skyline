import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";

/**
 * BELEG-02 — the pointers the public documents hand out.
 *
 * CHANGELOG.md writes a test file after almost every claim ("`backend/tests/
 * drop-formats.test.ts`"), README.md draws two source trees, docs/GETTING_STARTED.md
 * cites `backend/src/server/index.ts:302-307` as where the server prints its
 * non-loopback warning. A pointer that no longer points is a public embarrassment,
 * so each one is followed here and checked against the file it lands in.
 */

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
const DOCS = ["README.md", "CHANGELOG.md", "docs/GETTING_STARTED.md", "docs/ARCHITECTURE.md"];

/** A cited test file, resolved against either suite. */
function locateTest(cited: string): string | null {
  const direct = path.join(REPO, cited);
  if (existsSync(direct)) return direct;
  const name = path.basename(cited);
  for (const suite of ["backend/tests", "frontend/tests"]) {
    const candidate = path.join(REPO, suite, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe("the test files the changelog and the readme cite", () => {
  const cited = new Set<string>();
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/[\w./@-]+\.test\.tsx?/g)) cited.add(m[0]);
  }

  it("cites at least ten test files, so the guard has something to guard", () => {
    expect(cited.size).toBeGreaterThanOrEqual(10);
  });

  it("names a file that exists", () => {
    for (const entry of cited) {
      expect(locateTest(entry), `${entry} is cited but not in the tree`).toBeTruthy();
    }
  });

  /**
   * README.md:84 promises the counted runs ended with "no test skipped". A cited
   * file is the evidence for a public claim, so a skip in it would quietly retire
   * that claim.
   */
  it("cites no file that retired an assertion into a skip", () => {
    for (const entry of cited) {
      const file = locateTest(entry)!;
      const source = read(path.relative(REPO, file));
      expect(source, `${entry} contains a skipped test`).not.toMatch(/\b(it|test)\.skip\w*\(/);
      expect(source, `${entry} contains xit/xdescribe`).not.toMatch(/\b(xit|xdescribe)\s*\(/);
      expect(source, `${entry} contains a todo test`).not.toMatch(/\b(it|test)\.todo\(/);
    }
  });
});

describe("the section the CHANGELOG releases", () => {
  it("carries a section for the version the manifests ship", () => {
    const declared = [
      json("package.json").version,
      json("backend/package.json").version,
      json("frontend/package.json").version,
    ];
    expect(new Set(declared).size, "the three manifests do not agree on one version").toBe(1);
    for (const version of declared) {
      expect(
        read("CHANGELOG.md"),
        `CHANGELOG.md has no section for the shipped ${version}`,
      ).toContain(`## [${version}]`);
    }
  });
});

function json(rel: string): { version: string } {
  return JSON.parse(read(rel)) as { version: string };
}

describe("the source trees the documents draw", () => {
  /**
   * docs/ARCHITECTURE.md:107-126 draws the frontend tree file by file. Each name
   * below is taken from that drawing; the data is the directory listing.
   * Was drawn and did not exist: `renderer/` and `vite-env.d.ts`. Both are gone from the
   * do not exist in `frontend/src`.
   */
  it("draws a frontend tree whose entries are in the repository (docs/ARCHITECTURE.md:107-126)", () => {
    const drawn = [
      "main.tsx",
      "App.tsx",
      "components/CityScene.tsx",
      "components/Building.tsx",
      "components/InfoPanel.tsx",
      "components/Minimap.tsx",
      "components/RoadSystem.tsx",
      "components/ParticleField.tsx",
      "components/SearchBar.tsx",
      "render",
      "hooks/useLocalAnalysis.ts",
      "stores/useStore.ts",
      "design",
    ];
    for (const entry of drawn) {
      expect(
        existsSync(path.join(REPO, "frontend/src", entry)),
        `docs/ARCHITECTURE.md draws frontend/src/${entry}, which is not there`,
      ).toBe(true);
    }
  });

  it("names the backend files it says are there (docs/ARCHITECTURE.md:38-77)", () => {
    const drawn = [
      "server/index.ts",
      "server/bind-address.ts",
      "server/local-only.ts",
      "server/routes/local-analyze.ts",
      "server/routes/status.ts",
      "server/routes/job-progress.ts",
      "server/routes/source.ts",
      "server/routes/tests.ts",
      "server/routes/update-check.ts",
      "server/routes/demo.ts",
      "server/routes/health.ts",
      "services/analyzer/orchestrator.ts",
      "services/analyzer/metrics.ts",
      "services/analyzer/git-churn.ts",
      "services/analyzer/duplicates.ts",
      "services/analyzer/coverage.ts",
      "services/analyzer/gitignore.ts",
      "services/security/scanner.ts",
      "services/security/adapter.ts",
      "services/security/adapters",
      "services/security/categories.ts",
      "services/security/scan-config.ts",
      "services/security/rule-packs.ts",
      "services/security/scan-depth.ts",
      "services/security/dedup.ts",
      "services/security/redact.ts",
      "services/security/finding-knowledge.ts",
      "services/security/sarif-mapper.ts",
      "services/security/network-policy.ts",
      "models/index.ts",
      "utils/cityMapper.ts",
      "utils/sarif.ts",
    ];
    for (const entry of drawn) {
      expect(
        existsSync(path.join(REPO, "backend/src", entry)),
        `docs/ARCHITECTURE.md lists backend/src/${entry}, which is not there`,
      ).toBe(true);
    }
  });

  it("keeps the README's own tree honest (README.md:181-210)", () => {
    const folders = [
      "backend/src/server",
      "backend/src/server/routes",
      "backend/src/services/analyzer",
      "backend/src/services/security",
      "backend/src/models",
      "backend/src/utils",
      "frontend/src/city",
      "frontend/src/components",
      "frontend/src/config",
      "frontend/src/editor",
      "frontend/src/findings",
      "frontend/src/hooks",
      "frontend/src/stores",
      "frontend/src/design",
      "docs/assets",
      "scripts",
      ".github",
    ];
    for (const folder of folders) {
      expect(existsSync(path.join(REPO, folder)), `${folder}/ is not in the tree`).toBe(true);
    }
    for (const file of [
      "frontend/src/i18n.ts",
      "frontend/src/prefs.ts",
      "frontend/src/reviews.ts",
    ]) {
      expect(existsSync(path.join(REPO, file)), `${file} is not in the tree`).toBe(true);
    }
  });
});

describe("the data flow the architecture document draws (docs/ARCHITECTURE.md:203-207)", () => {
  const backendSource = ["src/server", "src/services"]
    .flatMap((dir) =>
      readdirSync(path.join(REPO, "backend", dir), { recursive: true })
        .map((e) => String(e))
        .filter((e) => e.endsWith(".ts"))
        .map((e) => readFileSync(path.join(REPO, "backend", dir, e), "utf-8")),
    )
    .join("\n");

  /**
   * The arrow reads `GitHub Repo ──clone──▶ Orchestrator`. docs/GETTING_STARTED.md:71
   * says the opposite in as many words: "There is no remote-repository path —
   * nothing to authorise, nothing to upload." FINDING (stays red): the pipeline is
   * fed by files the browser posted; no code in the backend runs `git clone` and no
   * route accepts a repository, so the drawn source of the flow does not exist.
   *
   * The probe is call-shaped on purpose: the words "git clone" do appear in the
   * tree — as the text of a demo fixture (`routes/demo.ts:136`) and in a comment —
   * and neither of those is a code path a user can reach.
   */
  it("draws a source the product can actually be handed", () => {
    // The diagram used to start at `GitHub Repo ──clone──▶`. Nothing in the
    // backend runs `git clone` and no route accepts a repository — the input is
    // files the browser posted, which GETTING_STARTED.md says in as many words.
    // So the drawing must not name a clone, and the code must not grow one
    // without this test saying so.
    const drawn = read("docs/ARCHITECTURE.md");
    expect(drawn, "a public diagram draws a clone step that no code performs").not.toMatch(
      /GitHub Repo\s*──\s*clone\s*──▶/i,
    );
    const executedClone =
      /exec(?:File)?\w*\(\s*["']git["']\s*,\s*\[\s*["']clone["']/.test(backendSource) ||
      /spawn\w*\(\s*["']git["']\s*,\s*\[\s*["']clone["']/.test(backendSource);
    const remoteInput =
      /(?:req|body)\.(?:repoUrl|repositoryUrl|cloneUrl|remoteUrl)/i.test(backendSource) ||
      /"\/api\/(?:clone|import|remote)/.test(backendSource);
    expect(
      executedClone || remoteInput,
      "the backend now accepts a repository, and the documents still promise it never will",
    ).toBe(false);
  });

  it("does keep the claim that the only input is a picked folder", () => {
    // the sentence in GETTING_STARTED.md:71, checked against the routes
    expect(backendSource).toContain("handleLocalAnalyze");
    expect(
      /app\.(get|post)\(\s*"\/api\/analyze-local"/.test(read("backend/src/server/index.ts")),
    ).toBe(true);
  });
});

describe("the one file-with-line-number a document cites", () => {
  /**
   * docs/GETTING_STARTED.md:227-228: "read the warning the server logs itself when
   * it binds a non-loopback address (`backend/src/server/index.ts:302-307`)".
   * FINDING (stays red): that window holds the SARIF route. The warning is printed
   * further down the file, in the `server.listen` callback, so the citation points
   * a reader at code that has nothing to do with the sentence.
   */
  it("cites a mechanism by name, never by line number", () => {
    // A `file.ts:302-307` citation rots the moment anything above it moves: this
    // one pointed a reader at the SARIF route while the warning it described sat
    // a hundred lines further down. Name the thing instead — the next test checks
    // the string the sentence is about really is logged.
    for (const doc of ["docs/GETTING_STARTED.md", "docs/ARCHITECTURE.md", "README.md"]) {
      const brittle = new RegExp("`[\\w./-]+\\.tsx?:\\d+(?:-\\d+)?`").exec(read(doc));
      expect(
        brittle && brittle[0],
        `${doc} cites code by line number, which rots: ${brittle && brittle[0]}`,
      ).toBeNull();
    }
  });

  it("names a warning the server really logs, wherever it sits", () => {
    const source = read("backend/src/server/index.ts");
    expect(source).toMatch(/listening on a non-loopback address/);
    expect(source).toMatch(/isLoopbackHost\(HOST\)/);
  });
});
