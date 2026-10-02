import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { SecurityScanner } from "../src/services/security/scanner.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * Contract test for scanRepositoryBatch: gitleaks/semgrep batch findings are
 * merged into the per-file results, deduped, sorted — and enriched with the
 * curated knowledge + code frame from the on-disk content (H2 regression).
 */
describe("scanRepositoryBatch merge contract", () => {
  it("merges gitleaks findings with code frame + explanation", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-batchtest-"));
    // app.ts contains what looks like a contiguous token the fallback would flag
    const fileContent = `const token = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";\nconsole.log("debug");\n`;
    await fs.writeFile(path.join(dir, "app.ts"), fileContent);

    const scanner = new SecurityScanner();
    // Real adapters: gitleaks binary may or may not exist here — stub the
    // adapter method to simulate a gitleaks hit deterministically
    const fake: SecurityIssue = {
      type: "HARDCODED_SECRET",
      severity: "P0",
      score: 10,
      line: 2,
      code: "",
      message: "Hardcoded secret detected (github-pat) — gitleaks",
      provenance: "gitleaks",
      ruleId: "github-pat",
    } as SecurityIssue;
    (
      scanner as unknown as {
        gitleaksAdapter: {
          scanRepository: (p: string) => Promise<Map<string, SecurityIssue[]>>;
          enableBatchMode: () => void;
        };
      }
    ).gitleaksAdapter = {
      scanRepository: async () => new Map([["app.ts", [fake]]]),
      enableBatchMode: () => {},
    };
    (scanner as unknown as { semgrepAdapter: unknown }).semgrepAdapter = null;

    const fileAnalyses: FileAnalysis[] = [
      {
        path: "app.ts",
        language: "TypeScript",
        lines: { total: 2, code: 2, comments: 0, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
        // NOTE: content is NOT set — the facade must read it from disk (H2)
      } as FileAnalysis,
    ];

    const res = await scanner.scanRepositoryBatch(dir, fileAnalyses);
    expect(res.gitleaksRan).toBe(true);
    expect(res.mergedCount).toBe(1);

    const merged = fileAnalyses[0]!.vulnerabilities;
    expect(merged).toHaveLength(1);
    const secret = merged[0]!;
    // H2: the code frame + knowledge must be attached from the on-disk content
    expect(secret.snippet).toBeDefined();
    expect(secret.snippet!.number).toBe(2);
    expect(secret.snippet!.line).toContain("console.log");
    expect(secret.explanation).toContain("credential");
    expect(secret.cwe).toBe("CWE-798");
    expect(secret.code).toContain("console.log"); // code line filled too

    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);
});
