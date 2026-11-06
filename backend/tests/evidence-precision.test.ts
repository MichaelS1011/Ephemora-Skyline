import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import {
  bucketSeverity,
  hasAnyOsvManifest,
  OSV_MANIFESTS,
} from "../src/services/security/adapters/osv-adapter.js";
import { enrichIssues } from "../src/services/security/finding-knowledge.js";
import { dedupIssues } from "../src/services/security/dedup.js";
import type { SecurityIssue } from "../src/models/index.js";
const adapter = new RegexAdapter();
const types = (code: string) => adapter.scanFile("tests/example.test.ts", code).map((i) => i.type);
const issue = (overrides: Partial<SecurityIssue> = {}): SecurityIssue => ({
  type: "HARDCODED_SECRET",
  severity: "P0",
  score: 10,
  line: 3,
  code: "",
  message: "Potential secret",
  provenance: "gitleaks",
  ...overrides,
});

describe("review evidence precision", () => {
  it("ignores strings and regex fixtures but retains executed code in test files", () => {
    expect(
      types(
        'it("eval() detected", () => { const fixture = "eval(userInput)"; const re = /eval\\(/; });',
      ),
    ).not.toContain("EVAL_USAGE");
    expect(types('it("executes", () => { eval(userInput); });')).toContain("EVAL_USAGE");
    expect(types("const output = `result: ${eval(userInput)}`;")).toContain("EVAL_USAGE");
    expect(types('execSync("rm -rf / --no-preserve-root");')).toContain("DESTRUCTIVE_COMMAND");
    expect(types("db.query(`SELECT * FROM users WHERE id = ${userInput}`);")).toContain(
      "SQL_INJECTION",
    );
  });
  it("keeps Playwright `$eval` and loopback HTTP out of the finding list", () => {
    expect(types('page.$eval("button", (b) => b.textContent);')).not.toContain("EVAL_USAGE");
    expect(types('page.$$eval("button", (bs) => bs.length);')).not.toContain("EVAL_USAGE");
    expect(types("const out = await page.$eval(sel, read);")).not.toContain("EVAL_USAGE");
    expect(types("fetch('http://127.0.0.1:4173/api/health');")).not.toContain("INSECURE_HTTP");
    expect(types("fetch('http://localhost:3000/');")).not.toContain("INSECURE_HTTP");
    expect(types("fetch('http://[::1]:3000/');")).not.toContain("INSECURE_HTTP");
    expect(types("fetch('https://example.com/api');")).not.toContain("INSECURE_HTTP");
    expect(types("fetch('http://example.com/api');")).toContain("INSECURE_HTTP");
    expect(types("eval(userInput);")).toContain("EVAL_USAGE");
  });

  it("allows only the exact LLM redaction canary", () => {
    expect(types('const API_KEY = "sk-live-ABCDEFGHIJKLMNOP1234";')).not.toContain(
      "HARDCODED_SECRET",
    );
    const nearMiss = ["sk-live-ABCDEFGHIJKLMNOP", "9999"].join("");
    expect(types(`const API_KEY = "${nearMiss}";`)).toContain("HARDCODED_SECRET");
  });

  it("does not call a static innerHTML assignment an XSS sink", () => {
    expect(types('document.body.innerHTML = "";')).not.toContain("XSS");
    expect(types("host.innerHTML = '<nav><button>Go</button></nav>';")).not.toContain("XSS");
    expect(types("host.innerHTML = '<nav>' + '<main></main>';")).not.toContain("XSS");
    expect(types("el.innerHTML = userInput;")).toContain("XSS");
    expect(types('el.innerHTML = "<b>" + userInput;')).toContain("XSS");
    expect(types("el.innerHTML = `<b>${userInput}</b>`;")).toContain("XSS");
    expect(types("return <div dangerouslySetInnerHTML={{ __html: html }} />;")).toContain("XSS");
  });

  it("only reports storage writes with a sensitive naming signal", () => {
    expect(types("localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));")).not.toContain(
      "LOCALSTORAGE_USAGE",
    );
    expect(types('localStorage.getItem("token"); localStorage.removeItem("token");')).not.toContain(
      "LOCALSTORAGE_USAGE",
    );
    expect(types('localStorage.setItem("access_token", response.accessToken);')).toContain(
      "LOCALSTORAGE_USAGE",
    );
    expect(types("localStorage.setItem(KEY, password);")).toContain("LOCALSTORAGE_USAGE");
  });
  it("does not promote high advisories to critical, or unknown to low", () => {
    expect(bucketSeverity("HIGH").severity).toBe("P1");
    expect(bucketSeverity("CRITICAL").severity).toBe("P0");
    expect(bucketSeverity(undefined)).toEqual({ severity: "P1", score: 0 });
  });

  it("reads conan.lock and does not pretend CMake or vcpkg are covered", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skyline-osv-manifest-"));
    try {
      expect(await hasAnyOsvManifest(dir)).toBe(false);
      await writeFile(path.join(dir, "conan.lock"), "{}");
      expect(await hasAnyOsvManifest(dir)).toBe(true);
      expect(OSV_MANIFESTS).not.toContain("CMakeLists.txt");
      expect(OSV_MANIFESTS).not.toContain("vcpkg.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("anchors npm advisories to the package, not line one", () => {
    const finding = issue({
      type: "VULNERABLE_DEPENDENCY",
      packageName: "braces",
      packageVersion: "3.0.3",
      line: 1,
      provenance: "osv",
    });
    enrichIssues(
      [finding],
      '{\n  "packages": {\n    "node_modules/braces": {\n      "version": "3.0.3"\n    }\n  }\n}',
    );
    expect(finding.line).toBe(3);
    expect(finding.category).toBe("dependencies");
  });
  it("attaches the German twin to curated knowledge without touching the English line", () => {
    const finding = issue({
      type: "SQL_INJECTION",
      fix: "Use parameterized queries or an ORM (e.g., Prisma, Drizzle)",
    });
    enrichIssues([finding]);
    // The English fields are the byte-stable contract the handoff channel and
    // the English card read — enrichment adds the German twin, it never edits.
    expect(finding.explanation).toBe(
      "A database query is built by string concatenation, so attacker-supplied text can change its meaning — read, modify or delete any data the query can touch.",
    );
    expect(finding.fix).toBe("Use parameterized queries or an ORM (e.g., Prisma, Drizzle)");
    expect(finding.explanationDe).toBe(
      "Eine Datenbankabfrage entsteht durch String-Verkettung, Angreifer-Text kann also ihre Bedeutung ändern — Daten lesen, ändern oder löschen, die die Abfrage erreicht.",
    );
    expect(finding.fixDe).toBe(
      "Parameterisierte Abfragen oder einen ORM verwenden (z. B. Prisma, Drizzle)",
    );
  });

  it("leaves the English fallback in place when a type has no curated entry", () => {
    const finding = issue({ type: "SEMGREP_UNKNOWN_RULE", provenance: "semgrep" });
    enrichIssues([finding]);
    expect(finding.explanation).toBe(
      "Scanner flagged this construct as a potential security or quality issue.",
    );
    expect(finding.explanationDe).toBe(
      "Der Scanner hat dieses Konstrukt als mögliches Sicherheits- oder Qualitätsproblem markiert.",
    );
    // No curated fix exists for an unknown rule, so no German fix is invented.
    expect(finding.fixDe).toBeUndefined();
  });

  it("does not attach current source to historical evidence or merge different commits", () => {
    const old = issue({ provenance: "gitleaks-history", historyCommit: "abc123" });
    enrichIssues([old], "unrelated\ncurrent\ncode\n");
    expect(old.snippet).toBeUndefined();
    expect(
      dedupIssues([old, { ...old }, { ...old, historyCommit: "def456" }, issue()]),
    ).toHaveLength(3);
  });
});
