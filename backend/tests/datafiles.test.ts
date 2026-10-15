import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import {
  estimateCyclomaticComplexity,
  extractSections,
  hasDataLines,
  isDataFile,
  roleOf,
} from "../src/services/analyzer/metrics.js";

/**
 * A lockfile, a translation catalogue and a generated schema are not code.
 * Treating them as code produced the two loudest wrong results in the first
 * self-scan: a data blob as the city's "highest-risk file", and a function
 * list that named the same JSON keys over and over.
 */
describe("data files are not scanned as code", () => {
  const adapter = new RegexAdapter();

  it("applies no code pattern to a JSON value", () => {
    const json = `{
  "advice": "never run rm -rf / --no-preserve-root",
  "endpoint": "http://example.internal/api",
  "how": "just eval(it)",
  "perms": "chmod 777 the socket",
  "loose": "a == b",
  "log": "console.log(secret)"
}`;
    expect(adapter.scanFile("assets/copy.json", json)).toEqual([]);
  });

  it("keeps the rules that are about a manifest, on the manifest", () => {
    const pkg = `{
  "name": "widget",
  "scripts": { "postinstall": "node setup.js" }
}`;
    const types = adapter.scanFile("package.json", pkg).map((i) => i.type);
    expect(types).toEqual(["INSTALL_HOOKS"]);
  });

  it("still reads the same pattern in real source", () => {
    const types = adapter
      .scanFile("src/run.ts", 'eval(process.env["INPUT"]);\n')
      .map((i) => i.type);
    expect(types).toContain("EVAL_USAGE");
  });
});

describe("the pipeline builds no structure out of data", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "codecity-datafile-"));
    await writeFile(
      path.join(dir, "catalog.json"),
      JSON.stringify(
        {
          loadSavedProfile: "function loadSavedProfile() { return 1 }",
          saveProfile: "class Save {}",
          nested: { eval: "eval(x)", require: 'require("lodash")' },
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      path.join(dir, "app.ts"),
      "export function real(): number { return 1 == 1 ? 2 : 3 }\n",
    );
    await writeFile(
      path.join(dir, "001_init.sql"),
      `CREATE TABLE tiers (id INTEGER PRIMARY KEY, label TEXT);
INSERT INTO tiers (id, label) VALUES (1, 'ada');
SELECT id, CASE WHEN label = 'ada' THEN 'first' ELSE 'later' END FROM tiers ORDER BY id;
`,
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("gives a data file no functions, no classes, no sections, no imports", async () => {
    const orchestrator = new AnalysisOrchestrator(pipelineScanner());
    const result = await orchestrator.analyzeDirectory("datafile-test", dir, {
      owner: "local",
      name: "datafile-test",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    });
    const data = result.files.find((f) => f.path === "catalog.json");
    const code = result.files.find((f) => f.path === "app.ts");

    expect(data).toBeTruthy();
    expect(data!.functions).toEqual([]);
    expect(data!.classes).toEqual([]);
    expect(data!.sections ?? []).toEqual([]);
    expect(data!.imports).toEqual([]);
    expect(data!.exports).toEqual([]);
    expect(data!.complexity.cyclomatic).toBe(1);
    expect(data!.vulnerabilities).toEqual([]);

    // the control: real source still gets structure
    expect(code!.functions.length).toBeGreaterThan(0);
    expect(code!.lines.code).toBeGreaterThan(0);
  }, 30_000);

  it("builds no complexity tower and no fake module out of a SQL migration", async () => {
    // measured ungated: the branch counter reads the query grammar as control
    // flow, and the section extractor invents a "module" block out of format
    const migration =
      "select id, case when label = 'ada' then 'first' else 'later' end from tiers order by id;\n";
    expect(estimateCyclomaticComplexity(migration, "SQL")).toBeGreaterThan(1);
    expect(extractSections("001_init.sql", migration, { functions: [], classes: [] })).toHaveLength(
      1,
    );

    const orchestrator = new AnalysisOrchestrator(pipelineScanner());
    const result = await orchestrator.analyzeDirectory("sqlfile-test", dir, {
      owner: "local",
      name: "sqlfile-test",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    });
    const sql = result.files.find((f) => f.path === "001_init.sql");
    expect(sql).toBeTruthy();
    expect(sql!.complexity.cyclomatic).toBe(1);
    expect(sql!.functions).toEqual([]);
    expect(sql!.classes).toEqual([]);
    expect(sql!.sections ?? []).toEqual([]);
    // its lines stay code lines — schema text the project wrote itself
    expect(sql!.lines.code).toBeGreaterThan(0);
  }, 30_000);
});
/**
 * Two questions about the same file, and they do not always agree. "Is this
 * code-shaped?" decides complexity, functions and code-shaped security rules.
 * "Are its lines data?" decides which total they join. Terraform and SQL are
 * the cases where they differ: HCL has no branches to score and a migration's
 * CASE/ELSE is the query language's grammar, not control flow — but their
 * lines are still the project's own infrastructure and schema source, and
 * moving them next to a translation catalogue would understate the codebase.
 */
describe("the two data decisions", () => {
  it("asks no code questions of a .tf file but still counts its lines as code", () => {
    expect(isDataFile("infra/main.tf")).toBe(true);
    expect(hasDataLines("infra/main.tf")).toBe(false);
  });

  it("asks no code questions of a .sql migration but keeps its lines in the code total", () => {
    expect(isDataFile("db/migrations/001_init.sql")).toBe(true);
    expect(hasDataLines("db/migrations/001_init.sql")).toBe(false);
  });

  it("names the third urban role: data is neither code nor test", () => {
    expect(roleOf("vendor/client.openapi.json", "JSON")).toBe("data");
    expect(roleOf("db/migrations/001_init.sql", "SQL")).toBe("data");
    expect(roleOf("config/.env.production")).toBe("data");
    expect(roleOf("backend/tests/datafiles.test.ts")).toBe("test");
    expect(roleOf("src/app.ts")).toBe("code");
  });

  it("counts the lines of a catalogue and a manifest as data", () => {
    expect(hasDataLines("assets/i18n/de.json")).toBe(true);
    expect(hasDataLines("config/.env")).toBe(true);
    expect(hasDataLines("pnpm-lock.yaml")).toBe(true);
    expect(hasDataLines("src/app.ts")).toBe(false);
  });
});

/**
 * This file asks which files joined the scan. The dependency audit is not part of
 * that question — and once the pipeline stops reporting an unrun osv as an
 * answer, that route spends a real `npm audit` round trip per test. Stubbed here,
 * so the assertions stay about the pipeline and the run stays about one second.
 */
function pipelineScanner(): SecurityScanner {
  const scanner = new SecurityScanner();
  (
    scanner as unknown as {
      dependencyAdapter: {
        scanRepository: () => Promise<{ issuesByFile: Map<string, never[]>; executed: boolean }>;
      };
    }
  ).dependencyAdapter = {
    scanRepository: async () => ({ issuesByFile: new Map(), executed: false }),
  };
  return scanner;
}
