import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { isSecretFinding, maskSecretText } from "../src/services/security/redact.js";
import { enrichIssues } from "../src/services/security/finding-knowledge.js";
import { detectLanguage, isDataFile } from "../src/services/analyzer/metrics.js";
import { isScannedPath } from "../src/services/analyzer/orchestrator.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { GitleaksAdapter } from "../src/services/security/adapters/gitleaks-adapter.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * A finding carries the line it was found on, and the whole result is written to
 * the city JSON — which is the artefact a user shares. For a secret finding that
 * is backwards: the file is scanned precisely because a credential sits in it.
 * The key NAME is the useful half of the line, so the name stays and the value
 * goes. The values below are obvious placeholders, because a test that proves
 * masking must not itself look like a leaked credential.
 */
const VALUE = "unit-test-placeholder-value-1234567890";

describe("a secret finding does not repeat the secret", () => {
  it("keeps the name and drops the value of an assignment", () => {
    expect(maskSecretText(`PAYMENT_SECRET_KEY = "${VALUE}"`)).toBe(
      'PAYMENT_SECRET_KEY = "‹hidden›"',
    );
    expect(maskSecretText(`DATABASE_PASSWORD=${VALUE}`)).toBe("DATABASE_PASSWORD=‹hidden›");
  });

  it("leaves a line without a credential shape untouched", () => {
    expect(maskSecretText("const total = price + shipping;")).toBe(
      "const total = price + shipping;",
    );
    expect(maskSecretText("# empty template, values are invented")).toBe(
      "# empty template, values are invented",
    );
  });

  /** gitleaks reports the value it matched — erasing that is exact, no guessing */
  it("erases the matched value wherever it appears in the line", () => {
    expect(maskSecretText(`token = "${VALUE}"`, VALUE)).toBe('token = "‹hidden›"');
  });

  it("recognises which findings talk about credentials", () => {
    expect(isSecretFinding({ type: "HARDCODED_SECRET" })).toBe(true);
    expect(isSecretFinding({ provenance: "gitleaks-history" })).toBe(true);
    expect(isSecretFinding({ type: "SQL_INJECTION" })).toBe(false);
  });
});

describe("masking happens where the finding text is attached", () => {
  it("masks the code frame and the snippet of a secret finding", () => {
    const issues = [
      {
        type: "HARDCODED_SECRET",
        severity: "P0",
        score: 10,
        line: 2,
        code: `UPLOAD_SECRET_KEY = "${VALUE}"`,
        message: "Hardcoded secret detected",
      } as unknown as SecurityIssue,
    ];
    enrichIssues(issues, `const a = 1;\nUPLOAD_SECRET_KEY = "${VALUE}"\n`);
    expect(issues[0]!.code).toContain("UPLOAD_SECRET_KEY");
    expect(issues[0]!.code).not.toContain(VALUE);
    expect(issues[0]!.snippet!.line).not.toContain(VALUE);
    expect(issues[0]!.snippet!.line).toContain("UPLOAD_SECRET_KEY");
  });

  it("leaves the code frame of any other finding alone", () => {
    const line = 'db.query("SELECT * FROM users WHERE id = " + id)';
    const issues = [
      {
        type: "SQL_INJECTION",
        severity: "P0",
        score: 9,
        line: 1,
        code: line,
        message: "SQL built by concatenation",
      } as unknown as SecurityIssue,
    ];
    enrichIssues(issues, line);
    expect(issues[0]!.code).toBe(line);
    expect(issues[0]!.snippet!.line).toContain("+ id");
  });
});

/**
 * Masking was the precondition for this: `.env` was kept out of the scan because
 * a finding stores the line it found, and the line in an env file is the
 * credential. Now the value is erased before the finding is kept, so the file
 * that actually holds deployment secrets can be looked at.
 */
describe("the env file joins the scan", () => {
  const envBody = `# local overrides, values here are invented for tests
DATABASE_PASSWORD="${VALUE}"
FEATURE_FLAGS=beta
`;

  it("is a file the walkers keep", () => {
    expect(isScannedPath(".env")).toBe(true);
    expect(isScannedPath("config/.env.production")).toBe(true);
    expect(isScannedPath("src/env.ts")).toBe(true); // ordinary source stays too
    expect(isScannedPath("notes.md")).toBe(false);
  });

  it("is data, so it gets no complexity and no code-shaped questions", () => {
    expect(detectLanguage("config/.env")).toBe("Env");
    expect(isDataFile("config/.env", "Env")).toBe(true);
  });

  /**
   * The batch path is where an env secret actually arrives: gitleaks names the
   * line, and the facade fills in the text from the file on disk. Filling the
   * text is the moment the credential would enter the report.
   */
  it("finds the credential but reports it without its value", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-env-"));
    await fs.mkdir(path.join(dir, "config"), { recursive: true });
    await fs.writeFile(path.join(dir, "config", ".env"), envBody, "utf-8");

    const scanner = new SecurityScanner();
    (scanner as unknown as { gitleaksAdapter: unknown; semgrepAdapter: unknown }).gitleaksAdapter =
      {
        scanRepository: async () =>
          new Map([
            [
              "config/.env",
              [
                {
                  type: "HARDCODED_SECRET",
                  severity: "P0",
                  score: 10,
                  line: 2,
                  code: "",
                  message: "Hardcoded secret detected (generic-api-key) — gitleaks",
                  provenance: "gitleaks",
                  ruleId: "generic-api-key",
                } as unknown as SecurityIssue,
              ],
            ],
          ]),
        enableBatchMode: () => {},
      };
    (scanner as unknown as { semgrepAdapter: unknown }).semgrepAdapter = null;

    const files = [
      {
        path: "config/.env",
        language: "Env",
        lines: { total: 3, code: 2, comments: 1, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      } as unknown as FileAnalysis,
    ];
    await scanner.scanRepositoryBatch(dir, files);
    await fs.rm(dir, { recursive: true, force: true });

    const secret = files[0]!.vulnerabilities.find((i) => i.type === "HARDCODED_SECRET");
    expect(secret).toBeDefined();
    expect(secret!.code).toContain("DATABASE_PASSWORD");
    expect(secret!.code).not.toContain(VALUE);
    expect(secret!.snippet?.line).not.toContain(VALUE);
  });
});

/**
 * The frame around a finding reaches two lines past it. Masking only the
 * credential finding's own frame left the neighbour case open: a console.log one
 * line above a password carries that password in its snippet, and the snippet is
 * what lands in the city JSON a user exports. Measured on a two-file fixture
 * before this test existed — the secret findings were clean, the CONSOLE_USAGE
 * frame was not.
 */
describe("a credential one line away from an ordinary finding", () => {
  const content = `console.log("boot");
const cfg = load();
DB_PASSWORD = "${VALUE}"
export { cfg };
`;

  it("keeps the value out of every field the scanner hands back", async () => {
    const issues = await new SecurityScanner().scanFile("src/app.ts", content);
    expect(
      issues.some((i) => i.type === "CONSOLE_USAGE"),
      "the hygiene finding must exist",
    ).toBe(true);
    const json = JSON.stringify(issues);
    expect(json, "a snippet frame must not carry the credential value").not.toContain(VALUE);
    expect(json).toContain("DB_PASSWORD"); // the name is the useful half
  });

  it("masks the neighbour line of a non-secret finding in enrichIssues", () => {
    const issues = [
      {
        type: "CONSOLE_USAGE",
        severity: "P2",
        score: 3,
        line: 1,
        code: 'console.log("boot")',
        message: "console statement",
        provenance: "regex",
      } as unknown as SecurityIssue,
    ];
    enrichIssues(issues, content);
    const frame = issues[0]!.snippet!;
    expect(frame.after.join("\n")).toContain("DB_PASSWORD");
    expect(JSON.stringify(frame)).not.toContain(VALUE);
  });
});

/**
 * Both cases below exist because the masking was once only a side effect of the
 * enrichment pass: an adapter that reads the source line itself never reaches
 * enrichment, and its raw line went straight into the exported city JSON. That
 * was invisible on a machine with the gitleaks binary installed and red in CI
 * without it — so these two force the paths instead of depending on what happens
 * to be installed.
 */
describe("no adapter can hand a credential to the caller", () => {
  it("masks the line the no-binary fallback reads for itself", () => {
    const adapter = new GitleaksAdapter();
    const fallback = (adapter as unknown as { fallbackScan: (c: string) => SecurityIssue[] })
      .fallbackScan;
    const issues = fallback.call(adapter, `DB_PASSWORD = "${VALUE}"\nconst x = 1;\n`);
    expect(issues.length, "the fallback must find the credential").toBeGreaterThan(0);
    expect(JSON.stringify(issues), "the value must not survive the fallback").not.toContain(VALUE);
    expect(JSON.stringify(issues)).toContain("DB_PASSWORD");
  });

  it("masks at the scanner boundary, whatever an adapter forgot", async () => {
    const scanner = new SecurityScanner();
    // A finding whose text is a credential while the scanned file holds none —
    // only the adapter can have put it there, so only the boundary can clean it.
    (scanner as unknown as { adapters: unknown[] }).adapters.push({
      id: "rogue",
      scanFile: async () => [
        {
          type: "HARDCODED_SECRET",
          severity: "P0",
          score: 10,
          line: 1,
          code: `DB_PASSWORD = "${VALUE}"`,
          message: "an adapter that forgot to mask",
          provenance: "gitleaks-fallback",
        } as unknown as SecurityIssue,
      ],
    });
    const issues = await scanner.scanFile("src/db.ts", "const a = 1;\nconst b = 2;\n");
    const rogue = issues.find((i) => i.message.includes("forgot to mask"));
    expect(rogue, "the finding must survive, or the assertion below proves nothing").toBeTruthy();
    expect(rogue!.code).not.toContain(VALUE);
    expect(rogue!.code).toContain("DB_PASSWORD");
  });
});
