import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { stubAdapters } from "./helpers/scanners.js";
import { MERGE_CONTRACT_BUDGET_MS } from "./helpers/budgets.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * Fund 2026-10-31/F2 (fremde Repos, Privatsphaerengrenze): the batch merge keys
 * its findings by an internal field `_filePath` that carries the ABSOLUTE path of
 * the staged copy of the user's folder. The merge reads it and never removes it,
 * so `GET /api/result/:id` answers with the finding object as stored — including
 * the location on disk where a copy of the user's source is sitting.
 *
 * Measured on five scans of real foreign repositories:
 *   vendored Python sample  56 of 573 findings shipped the staged path
 *   MoneyPrinterTurbo        3 of 107 findings shipped the staged path
 *   gods-eye-view / aether / MiMi  0 (no semgrep batch finding survived there)
 *
 * The three channels the docs hand to an agent stay clean: `/handoff`, `/city`
 * and `/sarif` rebuild the finding from known fields, and 0 of 936 stored
 * findings changed under the product's own maskSecretText afterwards (the
 * redaction boundary holds). This is the one door that ships the raw object.
 *
 * The test hands the merge a finding through the scanner's own semgrep engine
 * interface — the shape `sarif-mapper.ts:117` writes — and asserts the stored
 * finding carries no private path.
 */

type TaggedIssue = SecurityIssue & { _filePath?: string };

describe("a stored finding never carries the staging path", () => {
  it(
    "drops the internal _filePath before the finding joins the result",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ephemora-skyline-stagepath-"));
      const rel = "app/voice.py";
      await fs.mkdir(path.join(dir, "app"), { recursive: true });
      const content = `def speak(text):\n    print("token = abcdefghijklmnop")\n    return text\n`;
      await fs.writeFile(path.join(dir, rel), content);

      const fake: TaggedIssue = {
        type: "SECURITY_S105",
        severity: "P1",
        score: 7,
        line: 2,
        code: "",
        message: "Use of hardcoded password detected",
        provenance: "semgrep",
        ruleId: "python.lang.security.hardcoded-password",
        // exactly what the shipped SARIF mapper attaches for batch dedup
        _filePath: path.join(dir, rel),
      };

      const scanner = stubAdapters(new SecurityScanner(), {
        gitleaks: null,
        semgrep: { scanBatch: async () => [fake] },
        ruff: {},
        osv: {},
      });

      const fileAnalyses: FileAnalysis[] = [
        {
          path: rel,
          language: "Python",
          lines: { total: 3, code: 3, comments: 0, blank: 0 },
          complexity: { cyclomatic: 1 },
          functions: [],
          classes: [],
          imports: [],
          exports: [],
          vulnerabilities: [],
        } as FileAnalysis,
      ];

      await scanner.scanRepositoryBatch(dir, fileAnalyses);

      const stored = fileAnalyses[0]!.vulnerabilities;
      expect(
        stored.length,
        "the batch finding must still arrive (this test is not about dropping it)",
      ).toBeGreaterThan(0);
      const json = JSON.stringify(stored);
      expect(
        json,
        "GET /api/result/:id would answer with the staging directory of the user's source copy",
      ).not.toContain(dir);
      for (const issue of stored as unknown as TaggedIssue[]) {
        expect(
          issue._filePath === undefined,
          "the merge's internal key is consumed for dedup and must not survive into the stored finding",
        ).toBe(true);
      }

      await fs.rm(dir, { recursive: true, force: true });
    },
    MERGE_CONTRACT_BUDGET_MS,
  );
});
