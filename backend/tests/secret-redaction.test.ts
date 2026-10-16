import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  isSecretFinding,
  maskSecretText,
  maskIssueFrames,
} from "../src/services/security/redact.js";
import { buildSnippet, enrichIssues } from "../src/services/security/finding-knowledge.js";
import { sarifToIssues } from "../src/services/security/sarif-mapper.js";
import { detectLanguage, isDataFile } from "../src/services/analyzer/metrics.js";
import { isScannedPath } from "../src/services/analyzer/orchestrator.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import type { ScannerAdapter } from "../src/services/security/adapter.js";
import { GitleaksAdapter } from "../src/services/security/adapters/gitleaks-adapter.js";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import { SemgrepAdapter } from "../src/services/security/adapters/semgrep-adapter.js";
import { resultToSarif } from "../src/utils/sarif.js";
import type { AnalysisResult, FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * A finding carries the line it was found on, and the whole result is written to
 * the city JSON — which is the artefact a user shares. For a secret finding that
 * is backwards: the file is scanned precisely because a credential sits in it.
 * The key NAME is the useful half of the line, so the name stays and the value
 * goes. The values below are obvious placeholders, because a test that proves
 * masking must not itself look like a leaked credential.
 */
/**
 * Deliberately a real scanner and a real gitleaks adapter, and on the short list of
 * files that must not move to `tests/helpers/scanners.ts`. The claim is what crosses
 * the masking boundary: a credential that gitleaks itself reported must leave this
 * process with the value gone, and an adapter that reports no secret is exactly the
 * failure this file would never notice. So `new SecurityScanner()`,
 * `new GitleaksAdapter()` and one batch merge over a temp folder stay real, and the
 * `gitleaks detect` runs they fork are the price of the answer.
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
    const issues: SecurityIssue[] = [
      {
        type: "HARDCODED_SECRET",
        severity: "P0",
        score: 10,
        line: 2,
        code: `UPLOAD_SECRET_KEY = "${VALUE}"`,
        message: "Hardcoded secret detected",
      },
    ];
    enrichIssues(issues, `const a = 1;\nUPLOAD_SECRET_KEY = "${VALUE}"\n`);
    expect(issues[0]!.code).toContain("UPLOAD_SECRET_KEY");
    expect(issues[0]!.code).not.toContain(VALUE);
    expect(issues[0]!.snippet!.line).not.toContain(VALUE);
    expect(issues[0]!.snippet!.line).toContain("UPLOAD_SECRET_KEY");
  });

  it("leaves the code frame of any other finding alone", () => {
    const line = 'db.query("SELECT * FROM users WHERE id = " + id)';
    const issues: SecurityIssue[] = [
      {
        type: "SQL_INJECTION",
        severity: "P0",
        score: 9,
        line: 1,
        code: line,
        message: "SQL built by concatenation",
      },
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

    const scanner = new SecurityScanner(undefined, undefined, {
      gitleaks: {
        enableBatchMode: () => {},
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
                },
              ],
            ],
          ]),
      },
      semgrep: null,
    });

    const files: FileAnalysis[] = [
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
      },
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
    const issues: SecurityIssue[] = [
      {
        type: "CONSOLE_USAGE",
        severity: "P2",
        score: 3,
        line: 1,
        code: 'console.log("boot")',
        message: "console statement",
        provenance: "regex",
      },
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
    const issues = adapter.fallbackScan(`DB_PASSWORD = "${VALUE}"\nconst x = 1;\n`);
    expect(issues.length, "the fallback must find the credential").toBeGreaterThan(0);
    expect(JSON.stringify(issues), "the value must not survive the fallback").not.toContain(VALUE);
    expect(JSON.stringify(issues)).toContain("DB_PASSWORD");
  });

  it("masks at the scanner boundary, whatever an adapter forgot", async () => {
    // A finding whose text is a credential while the scanned file holds none —
    // only the adapter can have put it there, so only the boundary can clean it.
    const rogueAdapter: ScannerAdapter = {
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
        },
      ],
    };
    const scanner = new SecurityScanner([
      new RegexAdapter(),
      new GitleaksAdapter(),
      new SemgrepAdapter(),
      rogueAdapter,
    ]);
    const issues = await scanner.scanFile("src/db.ts", "const a = 1;\nconst b = 2;\n");
    const rogue = issues.find((i) => i.message.includes("forgot to mask"));
    expect(rogue, "the finding must survive, or the assertion below proves nothing").toBeTruthy();
    expect(rogue!.code).not.toContain(VALUE);
    expect(rogue!.code).toContain("DB_PASSWORD");
  });
});

/**
 * The name rule alone was not enough, and the case that proved it was our own
 * repository: `const pat = "ghp_…"` in a test fixture. `pat` is not a credential
 * word, so nothing was masked, and the raw value travelled into the panel frame,
 * the persisted city JSON and the SARIF export — the three places the product
 * promises it does not go. gitleaks knew the value and handed it over; the
 * scanner parsed it into `Secret` and dropped it on the floor.
 */
describe("a credential shape is masked whatever the name beside it says", () => {
  const PAT = "ghp_" + "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5";

  it("hides a GitHub token behind an innocuous variable name", () => {
    const line = `const pat = "${PAT}";`;
    const masked = maskSecretText(line);
    expect(masked).not.toContain(PAT);
    expect(masked).toContain("const pat");
    expect(masked).toContain("‹hidden›");
  });

  it("hides the other shapes the same way", () => {
    for (const token of [
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "xoxb-" + "1234567890-abcdefghij",
      "AIza" + "SyD-abcdefghijklmnopqrstuvwxyz12345",
      "sk_live_" + "abcdefghijklmnopqrstuvwxyz",
      "sk-" + "ABCDEFGHIJKLMNOPQRSTUVWX",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz123456",
    ]) {
      expect(maskSecretText(`cfg.put("${token}")`), token).not.toContain(token);
    }
    expect(maskSecretText("-----BEGIN RSA PRIVATE KEY-----")).not.toContain("BEGIN RSA");
  });

  it("does not eat ordinary code that merely looks close", () => {
    for (const line of [
      "const skillCount = 12;",
      "import { task } from './tasks';",
      "expect(res.status).toBe(200);",
      "// the ask-architecture doc lists the endpoints",
    ]) {
      expect(maskSecretText(line)).toBe(line);
    }
  });

  it("consumes the matched value and leaves no copy of it on the finding", () => {
    const issue = {
      type: "HARDCODED_SECRET",
      line: 61,
      code: `const pat = "${PAT}";`,
      snippet: { line: `const pat = "${PAT}";`, before: ["// fixture"], after: ["export {};"] },
      secretValue: PAT,
    } as unknown as SecurityIssue;
    maskIssueFrames(issue);
    expect(JSON.stringify(issue)).not.toContain(PAT);
    expect("secretValue" in issue, "the value must not survive into the result").toBe(false);
    expect(issue.code).toContain("const pat");
  });

  it("masks at the boundary for an adapter that only reports the value", async () => {
    const valueOnly: ScannerAdapter = {
      id: "value-only",
      scanFile: async () => [
        {
          type: "HARDCODED_SECRET",
          severity: "P0",
          score: 10,
          line: 1,
          code: `const pat = "${PAT}";`,
          message: "an adapter that names nothing and hands over the value",
          provenance: "gitleaks",
          secretValue: PAT,
        },
      ],
    };
    const scanner = new SecurityScanner([
      new RegexAdapter(),
      new GitleaksAdapter(),
      new SemgrepAdapter(),
      valueOnly,
    ]);
    const issues = await scanner.scanFile("tests/fixture.ts", "const a = 1;\n");
    const hit = issues.find((i) => i.message.includes("names nothing"));
    expect(hit, "the finding must survive, or the assertion below proves nothing").toBeTruthy();
    expect(JSON.stringify(hit)).not.toContain(PAT);
    expect(hit!.code).toContain("const pat");
  });

  it("hides the password a connection string carries, scheme and host left readable", () => {
    // Measured, not invented: a `.env` finding whose hit line was masked still
    // shipped `DATABASE_URL=postgres://admin:…@db.internal:5432/app` two lines
    // down, in the persisted result and in the city payload.
    const DB = "DATABASE_URL=postgres://admin:Sup3rSecretPw-XYZ-9000@db.internal:5432/app";
    type Framed = { code: string; snippet: { line: string; before: string[]; after: string[] } };
    for (const side of ["before", "after"] as const) {
      // Joined at runtime, so the repository holds no provider-shaped literal.
      const stripeLive = "sk_live_" + "MZKQ00112233445566778899";

      const issue: Framed = {
        code: "STRIPE_SECRET_KEY=‹hidden›",
        snippet: {
          line: `STRIPE_SECRET_KEY=${stripeLive}`,
          before: [],
          after: [],
        },
      };
      issue.snippet[side] = [DB];
      maskIssueFrames(issue);
      expect(JSON.stringify(issue), `the ${side} frame must not carry the password`).not.toContain(
        "Sup3rSecretPw-XYZ-9000",
      );
      expect(issue.snippet[side][0]).toBe(
        "DATABASE_URL=postgres://admin:‹hidden›@db.internal:5432/app",
      );
    }
  });

  it("hides a credential that travels in a query string", () => {
    const line = 'fetch("https://api.host/v1?access_token=Abcd1234Efgh5678&v=2")';
    const issue = { code: line, snippet: { line, before: [line], after: [] } };
    maskIssueFrames(issue);
    expect(JSON.stringify(issue)).not.toContain("Abcd1234Efgh5678");
    expect(issue.snippet.before[0]).toContain("access_token=‹hidden›");
  });

  it("leaves a URL that carries no credential alone", () => {
    for (const plain of [
      "const url = 'https://example.com/docs/redact';",
      "redis://127.0.0.1:6379",
      "AMQP_HOST=amqp://broker.internal:5672",
    ]) {
      expect(maskSecretText(plain), plain).toBe(plain);
    }
  });
});

// Synthetic values only; provider prefixes are assembled, never used as credentials.
const REGEX_CREDENTIALS = [
  { label: "AWS", name: "bearer", value: "AKIA" + "ABCDEFGHIJKLMNOP" },
  { label: "GitHub control", name: "bearer", value: "ghp_" + "a1".repeat(18) },
  { label: "OpenAI", name: "bearer", value: "sk-" + "a1".repeat(12) },
  { label: "Slack trailing hyphen", name: "bearer", value: "xoxb-" + "a1".repeat(8) + "-" },
  { label: "Google trailing hyphen", name: "bearer", value: "AIza" + "a1".repeat(17) + "-" },
  { label: "OAuth", name: "bearer", value: "ya29." + "Abcdef1234567890" },
  { label: "OAuth trailing hyphen", name: "bearer", value: "ya29." + "a1".repeat(8) + "-" },
  ...[
    "mysqlpassword",
    "mysqlpasswd",
    "clientsecretvalue",
    "mytokenbuffer",
    "myapikeyvalue",
    "my_api_key_suffix",
  ].map((name) => ({ label: name, name, value: VALUE })),
];

function exportedIssues(issues: SecurityIssue[]): string {
  return JSON.stringify(
    resultToSarif({
      id: "synthetic-redaction-check",
      files: [{ path: "src/synthetic.ts", vulnerabilities: issues }],
    } as AnalysisResult),
  );
}

function clipped(line: string): string {
  return line.length > 160 ? line.slice(0, 160) + "…" : line;
}

describe("regex credentials cross the canonical redaction boundary", () => {
  it.each(REGEX_CREDENTIALS)(
    "masks $label without erasing the name or nearby code",
    ({ name, value }) => {
      const line = `const ${name} = "${value}"; const total = 3;`;
      expect(maskSecretText(line)).toBe(`const ${name} = "‹hidden›"; const total = 3;`);
    },
  );

  it.each(REGEX_CREDENTIALS)(
    "keeps $label out of findings, neighbour frames and SARIF",
    async ({ name, value }) => {
      const line = `const ${name} = "${value}";`;
      const masked = `const ${name} = "‹hidden›";`;
      const issues = await new SecurityScanner([new RegexAdapter()]).scanFile(
        "src/synthetic.ts",
        `console.log("boot");\n${line}\nconst total = 3;`,
      );
      const secret = issues.find((issue) => issue.type === "HARDCODED_SECRET");
      const neighbour = issues.find((issue) => issue.type === "CONSOLE_USAGE");
      expect(secret).toBeDefined();
      expect(neighbour).toBeDefined();
      expect(secret?.code).toBe(masked);
      expect(secret?.snippet?.line).toBe(masked);
      expect(neighbour?.snippet?.after).toEqual([masked, "const total = 3;"]);
      expect(JSON.stringify(issues)).not.toContain(value);
      expect(JSON.stringify(issues)).not.toContain("secretValue");
      expect(exportedIssues(issues)).not.toContain(value);
      expect(exportedIssues(issues)).toContain("‹hidden›");
    },
  );

  for (const limit of [120, 160]) {
    it.each(REGEX_CREDENTIALS)(
      `masks $label before the ${limit}-character cut`,
      async ({ name, value }) => {
        const start = 'const pad = "';
        const end = `"; const ${name} = "`;
        const prefix = start + "x".repeat(limit - 8 - start.length - end.length) + end;
        const line = `${prefix}${value}";`;
        const masked = `${prefix}‹hidden›";`;
        const issues = await new SecurityScanner([new RegexAdapter()]).scanFile(
          "src/synthetic.ts",
          `console.log("boot");\n${line}`,
        );
        const secret = issues.find((issue) => issue.type === "HARDCODED_SECRET");
        const neighbour = issues.find((issue) => issue.type === "CONSOLE_USAGE");
        expect(secret).toBeDefined();
        expect(neighbour).toBeDefined();
        expect(secret?.code).toBe(masked.slice(0, 120));
        expect(secret?.snippet?.line).toBe(clipped(masked));
        expect(neighbour?.snippet?.after).toEqual([clipped(masked)]);
        // Checking only the complete value would miss a leaked, truncated prefix.
        expect(JSON.stringify(issues)).not.toContain(value.slice(0, 8));
        expect(exportedIssues(issues)).not.toContain(value.slice(0, 8));
        expect(buildSnippet(line, 1)?.line).toBe(clipped(masked));
      },
    );
  }

  it.each([false, true])(
    "shares known values before enrichment consumes them (reverse=%s)",
    (reverse) => {
      const value = "SyntheticOpaqueValue12345";
      const lines = [`console.log("${value}");`, `const arbitrary = "${value}";`];
      const issues: SecurityIssue[] = [
        {
          type: "CONSOLE_USAGE",
          severity: "P2",
          score: 3,
          line: 1,
          code: lines[0]!,
          message: "console",
        },
        {
          type: "HARDCODED_SECRET",
          severity: "P1",
          score: 7,
          line: 2,
          code: lines[1]!,
          message: "secret",
          secretValue: value,
        },
      ];
      if (reverse) issues.reverse();
      enrichIssues(issues, lines.join("\n"));
      const firstPass = JSON.stringify(issues);
      expect(firstPass).not.toContain(value);
      expect(firstPass).not.toContain("secretValue");
      expect(issues.find((issue) => issue.type === "CONSOLE_USAGE")?.code).toBe(
        'console.log("‹hidden›");',
      );
      enrichIssues(issues, lines.join("\n"));
      expect(JSON.stringify(issues)).toBe(firstPass);
    },
  );

  it("masks repeated generic values in the adapter before truncating unrelated code", async () => {
    const prefix = `console.log("${"x".repeat(100)}", "`;
    const content = `${prefix}${VALUE}");\nconst mysqlpassword = "${VALUE}";`;
    const issues = await new SecurityScanner([new RegexAdapter()]).scanFile(
      "src/synthetic.ts",
      content,
    );
    const neighbour = issues.find((issue) => issue.type === "CONSOLE_USAGE");
    expect(issues.some((issue) => issue.type === "HARDCODED_SECRET")).toBe(true);
    expect(neighbour?.code).toBe(`${prefix}‹hidden›");`.slice(0, 120));
    expect(JSON.stringify(issues)).not.toContain(VALUE.slice(0, 5));
    expect(exportedIssues(issues)).not.toContain(VALUE.slice(0, 5));
  });

  it("masks quoted credential properties and preserves empty values and harmless suffixes", () => {
    expect(maskSecretText(`{ "mysqlpassword": "${VALUE}", "total": 3 }`)).toBe(
      '{ "mysqlpassword": "‹hidden›", "total": 3 }',
    );
    expect(maskSecretText(`DB_PASSWORD=${VALUE}; const total = 3;`)).toBe(
      "DB_PASSWORD=‹hidden›; const total = 3;",
    );
    for (const line of [
      'const monkey = "bananas123";',
      'const bearer = "ya29.short";',
      'const bearer = "ghp_short";',
      'const password = ""; const total = 3;',
      "const total = price + shipping;",
    ])
      expect(maskSecretText(line)).toBe(line);
  });
});

/**
 * The display clip is a second boundary, and it sat on the wrong side of the
 * mask in three places: `slice(0, 120)` ran BEFORE `maskSecretText`, so a value
 * that starts inside the first 120 characters and ends past them left the
 * leading fragment — `ghp_aB3dE5fG7hI9` — in the report. A fragment no shape
 * rule recognises is not a truncated secret, it is a secret with its checksum
 * half missing, and it is exactly what the panel, the city JSON and the SARIF
 * file must never carry. The control in each case below is the OLD order: the
 * same line clipped first, then masked, still holding the prefix.
 */
describe("the 120-character display clip never cuts a credential in half", () => {
  /** 40 characters, so a line that puts its start at ~106 crosses the clip. */
  const PAT = "ghp_" + "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5";
  const LONG_LINE = `const ${"billing_provider_oauth_".repeat(4)}access_token = "${PAT}";`;

  it("proves the clip really crosses the value (control)", () => {
    expect(LONG_LINE.slice(0, 120)).not.toContain(PAT);
    // the old order left this much of the token on the card: enough to identify
    // the provider and the victim, not enough for any shape rule to catch
    expect(LONG_LINE.slice(0, 120)).toContain(PAT.slice(0, 6));
    expect(LONG_LINE.slice(0, 120)).not.toContain(PAT.slice(0, 10));
    expect(LONG_LINE.length).toBeGreaterThan(120);
  });

  /**
   * The clip can cut the `‹hidden›` marker itself. That is a cosmetic edge, not
   * a leak — but the mask must then leave the fragment alone: rewriting it to
   * the full marker would lengthen the line back past the display limit, so a
   * second pass through the boundary would undo the first one.
   */
  it("never lengthens a clipped hidden marker on a second pass", () => {
    const clipped = maskSecretText(LONG_LINE).slice(0, 120);
    expect(clipped).toContain("‹");
    expect(maskSecretText(clipped)).toBe(clipped);
  });

  it("masks the gitleaks batch line before clipping it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-clip-"));
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "keys.ts"), `${LONG_LINE}\nconst a = 1;\n`, "utf-8");

    const scanner = new SecurityScanner(undefined, undefined, {
      gitleaks: {
        enableBatchMode: () => {},
        scanRepository: async () =>
          new Map([
            [
              "src/keys.ts",
              [
                {
                  type: "HARDCODED_SECRET",
                  severity: "P0",
                  score: 10,
                  line: 1,
                  code: "",
                  secretValue: PAT,
                  message: "Hardcoded secret detected (github-pat) — gitleaks",
                  provenance: "gitleaks",
                  ruleId: "github-pat",
                },
              ],
            ],
          ]),
      },
      semgrep: null,
    });

    const files: FileAnalysis[] = [
      {
        path: "src/keys.ts",
        language: "TypeScript",
        lines: { total: 2, code: 2, comments: 0, blank: 0 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: [],
      },
    ];
    await scanner.scanRepositoryBatch(dir, files);
    await fs.rm(dir, { recursive: true, force: true });

    const secret = files[0]!.vulnerabilities.find((i) => i.type === "HARDCODED_SECRET");
    expect(secret, "the batch finding must survive to be checked").toBeTruthy();
    expect(secret!.code!.length, "the display clip still applies").toBeLessThanOrEqual(120);
    expect(secret!.code).not.toContain(PAT.slice(0, 10));
    expect(secret!.code).toContain("‹");
    expect(maskSecretText(secret!.code!)).toBe(secret!.code);
    expect(JSON.stringify(secret!.snippet)).not.toContain(PAT.slice(0, 10));
  });

  it("masks the no-binary fallback before clipping it", () => {
    const adapter = new GitleaksAdapter();
    const issues = adapter.fallbackScan(`${LONG_LINE}\n`);
    expect(issues.length, "the fallback must find the pattern").toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.code!.length).toBeLessThanOrEqual(120);
      expect(issue.code).not.toContain(PAT.slice(0, 10));
    }
  });

  it("masks a semgrep region snippet before clipping it", () => {
    const issues = sarifToIssues({
      runs: [
        {
          tool: {
            driver: { rules: [{ id: "js-hardcoded-token", shortDescription: { text: "t" } }] },
          },
          results: [
            {
              ruleId: "js-hardcoded-token",
              message: { text: "Hardcoded token found." },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/keys.ts" },
                    region: { startLine: 1, snippet: { text: LONG_LINE } },
                  },
                },
              ],
            },
          ],
        },
      ],
    } as never);
    expect(issues.length).toBe(1);
    expect(issues[0]!.code!.length).toBeLessThanOrEqual(120);
    expect(issues[0]!.code).not.toContain(PAT.slice(0, 10));
    expect(issues[0]!.code).toContain("‹");
  });
});
