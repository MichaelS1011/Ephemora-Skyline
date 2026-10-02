import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../src/services/security/scanner.js";
import type { FileAnalysis } from "../src/models/index.js";

/** Helper: build a minimal FileAnalysis with the given source content */
function makeFile(content: string): FileAnalysis {
  return {
    path: "fake.ts",
    language: "TypeScript",
    lines: { total: content.split("\n").length, code: 10, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    content,
    vulnerabilities: [],
  };
}

describe("SecurityScanner", () => {
  const scanner = new SecurityScanner();

  // ── scan() batch API ────────────────────────────────────────────────────

  it("finds SQL injection patterns", async () => {
    const file = makeFile(`
const q = "SELECT * FROM users WHERE id = ' OR 1=1 --";
const q2 = "SELECT name FROM admin ORDER BY id";
    `);
    const [result] = await scanner.scan([file]);
    const sqlVulns = result!.vulnerabilities.filter((v) => v.type === "SQL_INJECTION");
    expect(sqlVulns.length).toBeGreaterThan(0);
    expect(sqlVulns.every((v) => v.severity === "P0")).toBe(true);
  });

  it("finds XSS patterns", async () => {
    const file = makeFile(`
document.getElementById('app').innerHTML = userInput;
el.innerHTML = data;
    `);
    const [result] = await scanner.scan([file]);
    const xssVulns = result!.vulnerabilities.filter((v) => v.type === "XSS");
    expect(xssVulns.length).toBeGreaterThan(0);
    expect(xssVulns.every((v) => v.severity === "P1")).toBe(true);
  });

  it("finds hardcoded secrets (high-entropy via gitleaks)", async () => {
    const file = makeFile(`
const config = {
  // high-entropy AWS + GitHub token patterns (gitleaks)
  token: "ghp_16C7e42F292c6912E7710c838347Ae178B4a",
  aws_key: "AKIAIOSFODNN7EXAMPLE",
  secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
    `);
    const [result] = await scanner.scan([file]);
    const secretVulns = result!.vulnerabilities.filter((v) => v.type === "HARDCODED_SECRET");
    expect(secretVulns.length).toBeGreaterThan(0);
    expect(secretVulns.every((v) => v.severity === "P0")).toBe(true);
    expect(secretVulns.some((v) => v.provenance?.startsWith("gitleaks"))).toBe(true);
  });

  it("ignores low-entropy placeholder secrets", async () => {
    const file = makeFile(
      `const password = "test123"; const secret = "example"; const api_key = "changeme";`,
    );
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities.filter((v) => v.type === "HARDCODED_SECRET")).toHaveLength(0);
  });

  it("returns empty vulnerabilities for clean files", async () => {
    const file = makeFile(`
function add(a: number, b: number): number {
  return a + b;
}

export { add };
    `);
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities.length).toBe(0);
  });

  it("returns empty vulnerabilities when content is absent", async () => {
    const file: FileAnalysis = {
      path: "no-content.ts",
      language: "TypeScript",
      lines: { total: 1, code: 1, comments: 0, blank: 0 },
      complexity: { cyclomatic: 0 },
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      vulnerabilities: [],
    };
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities).toEqual([]);
  });

  it("finds path traversal patterns", async () => {
    const file = makeFile(`
const filePath = userInput + '/../../etc/passwd';
    `);
    const [result] = await scanner.scan([file]);
    const traversal = result!.vulnerabilities.filter((v) => v.type === "PATH_TRAVERSAL");
    expect(traversal.length).toBeGreaterThan(0);
  });

  it("finds command injection patterns", async () => {
    const file = makeFile(`
child_process.exec(userInput);
    `);
    const [result] = await scanner.scan([file]);
    const cmdVulns = result!.vulnerabilities.filter((v) => v.type === "CMD_INJECTION");
    expect(cmdVulns.length).toBeGreaterThan(0);
  });

  it("assigns correct severity and score to eval()", async () => {
    const file = makeFile(`eval(userInput);`);
    const [result] = await scanner.scan([file]);
    const vuln = result!.vulnerabilities.find((v) => v.type === "EVAL_USAGE");
    expect(vuln).toBeDefined();
    expect(vuln!.severity).toBe("P0");
    expect(vuln!.score).toBe(10);
  });

  // ── scanFile() single-file API ──────────────────────────────────────────

  it("scanFile() returns issues directly for a content string", async () => {
    const issues = await scanner.scanFile("test.ts", "eval(x);");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.type).toBe("EVAL_USAGE");
  });

  // ── False-positive guards (regression) ──────────────────────────────────

  it("does not flag parametrized SQL with ? or $1 placeholders", async () => {
    const file = makeFile(`const q = "SELECT * FROM users WHERE id = ?"; db.query(q, [id]);`);
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities.filter((v) => v.type === "SQL_INJECTION")).toHaveLength(0);
    const file2 = makeFile(`const q = "SELECT * FROM users WHERE id = $1"`);
    const [r2] = await scanner.scan([file2]);
    expect(r2!.vulnerabilities.filter((v) => v.type === "SQL_INJECTION")).toHaveLength(0);
  });

  it("does not flag PATH_TRAVERSAL for mere userInput without ../", async () => {
    const file = makeFile(`const userInput = getUserInput(); element.textContent = userInput;`);
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities.filter((v) => v.type === "PATH_TRAVERSAL")).toHaveLength(0);
  });

  it("flags PATH_TRAVERSAL only when userInput flows into ../", async () => {
    const file = makeFile(`const p = userInput + "/../../etc/passwd";`);
    const [result] = await scanner.scan([file]);
    expect(result!.vulnerabilities.some((v) => v.type === "PATH_TRAVERSAL")).toBe(true);
    const file2 = makeFile(`const p = req.query.file + "/../secret";`);
    const [r2] = await scanner.scan([file2]);
    expect(r2!.vulnerabilities.some((v) => v.type === "PATH_TRAVERSAL")).toBe(true);
  });

  it("does not flag === as loose equality", async () => {
    expect(
      (await scanner.scanFile("test.ts", `if (x === "1")`)).filter(
        (v) => v.type === "LOOSE_EQUALITY",
      ),
    ).toHaveLength(0);
    expect(
      (await scanner.scanFile("test.ts", `if (x !== y)`)).filter(
        (v) => v.type === "LOOSE_EQUALITY",
      ),
    ).toHaveLength(0);
    expect(
      (await scanner.scanFile("test.ts", `if (x == "1")`)).filter(
        (v) => v.type === "LOOSE_EQUALITY",
      ).length,
    ).toBeGreaterThan(0);
  });

  // ── countBySeverity() ───────────────────────────────────────────────────

  it("countBySeverity() correctly buckets issues", async () => {
    const issues = await scanner.scanFile(
      "test.ts",
      `
eval(x);
password = "AKIAIOSFODNN7EXAMPLE-wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
console.log("debug");
      `,
    );
    const counts = scanner.countBySeverity(issues);
    expect(counts.P0).toBeGreaterThan(0);
    expect(counts.P2).toBeGreaterThan(0);
  });
});
