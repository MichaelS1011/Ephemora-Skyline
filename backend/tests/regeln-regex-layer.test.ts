/**
 * Regeln-Lane (2026-10-14) — the four always-on regex defects, each pinned by
 * one case that must fire and one that must not. The cases live in
 * `tests/fixtures/regeln/` as real files, so a future lane can re-measure the
 * corpus numbers without the temporary folders the panel lane used.
 *
 * Acceptance signature S3: >=28 of 36 planted vulnerabilities found, <=1 false
 * positive, none of them on P0.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import type { SecurityIssue } from "../src/models/index.js";

const FIX = path.join(import.meta.dirname, "fixtures/regeln");
const adapter = new RegexAdapter();

/**
 * The fixture read as product code (`src/…`), because a test path deliberately
 * downgrades severities; the shipped corpus scan sees both.
 */
function scan(fixture: string, type: string): SecurityIssue[] {
  const content = readFileSync(path.join(FIX, fixture), "utf-8");
  return adapter
    .scanFile(`src/${fixture}`, content)
    .filter((i) => i.type === type)
    .map((i) => ({ ...i }));
}

/** The 1-based line a fixture code snippet sits on — found by text, not by memory */
function lineOf(fixture: string, needle: string): number {
  const lines = readFileSync(path.join(FIX, fixture), "utf-8").split("\n");
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`fixture ${fixture} has no line containing ${needle}`);
  return i + 1;
}

const firedLines = (fixture: string, type: string): number[] =>
  scan(fixture, type)
    .map((i) => i.line)
    .sort((a, b) => a - b);

/**
 * A result the case is about has to exist, so existence is asserted first and
 * the finding is then read through a narrowed local — no non-null assertion.
 * The label stays the vitest message, so a missing finding still names itself.
 */
function oneHit(hit: SecurityIssue | undefined, label: string): SecurityIssue {
  expect(hit, label).toBeDefined();
  if (!hit) throw new Error(label);
  return hit;
}

describe("Traversierung — user input flowing into a path call is the traversal", () => {
  it("fires on each fs/path call whose argument carries request input", () => {
    const fired = firedLines("traversal.js", "PATH_TRAVERSAL");
    for (const needle of [
      'fs.readFileSync("/var/data/" + req.query.name',
      'fs.writeFileSync("/var/uploads/" + req.body.filename',
      'path.join("/srv/files", req.params.file)',
      '"/tmp/" + req.query.p',
    ]) {
      expect(fired, needle).toContain(lineOf("traversal.js", needle));
    }
  });

  it("stays silent on fixed paths and on an import-time relative specifier", () => {
    const fired = firedLines("traversal.js", "PATH_TRAVERSAL");
    for (const needle of [
      'fs.readFileSync(path.join(__dirname, "..", "package.json")',
      'res.sendFile(path.join(__dirname, "public", "index.html"))',
      'require("./helpers/privateStaging")',
    ]) {
      expect(fired, needle).not.toContain(lineOf("traversal.js", needle));
    }
  });

  it("is a P1 finding with CWE-22 from the regex layer", () => {
    const hit = oneHit(scan("traversal.js", "PATH_TRAVERSAL")[0], "no traversal finding at all");
    expect(hit.severity).toBe("P1");
    expect(hit.cwe).toBe("CWE-22");
    expect(hit.ruleId).toBe("regex:PATH_TRAVERSAL");
  });
});

describe("Serverseitiges XSS — the response body is where the sink lives", () => {
  it("fires on a response sink fed by concatenated request input", () => {
    const fired = firedLines("xss-server.js", "XSS");
    for (const needle of [
      'res.send("<p>" + req.query.q',
      'res.end("<div>" + req.body.html',
      'res.json("<b>" + req.params.name',
      "el.innerHTML = userInput",
    ]) {
      expect(fired, needle).toContain(lineOf("xss-server.js", needle));
    }
  });

  it("stays silent on constant and object responses", () => {
    const fired = firedLines("xss-server.js", "XSS");
    for (const needle of [
      "res.json({ ok: true })",
      "res.send(page)",
      'res.end("done")',
      "res.json({ q: req.query.q })",
    ]) {
      expect(fired, needle).not.toContain(lineOf("xss-server.js", needle));
    }
  });

  it("is a P1 finding with CWE-79 from the regex layer", () => {
    const hit = oneHit(
      scan("xss-server.js", "XSS").find(
        (i) => i.line === lineOf("xss-server.js", 'res.send("<p>"'),
      ),
      "no server-side XSS finding",
    );
    expect(hit.severity).toBe("P1");
    expect(hit.cwe).toBe("CWE-79");
    expect(hit.ruleId).toBe("regex:XSS");
  });
});

describe("Credential-Literal — one bounded always-on fallback", () => {
  it("fires on a credential bound to a name in ordinary source", () => {
    const fired = firedLines("credentials.js", "HARDCODED_SECRET");
    for (const needle of [
      'const DB_PASSWORD = "Sup3rS3cretPg!"',
      'secretAccessKey: "wJalrXUtnFEMI',
      'api_key: "sk-live-1234567890',
    ]) {
      expect(fired, needle).toContain(lineOf("credentials.js", needle));
    }
  });

  it("stays silent on labels, placeholders and environment reads", () => {
    const fired = firedLines("credentials.js", "HARDCODED_SECRET");
    for (const needle of [
      'const password = "password-field-selector"',
      'const loginHint = "changeme"',
      'secret: "example", token: "placeholder-value"',
      "password: process.env.DB_PASSWORD",
      'token: "", key: "abc123"',
    ]) {
      expect(fired, needle).not.toContain(lineOf("credentials.js", needle));
    }
  });

  it("is a P1 fallback, marked as such and not a scanner verdict", () => {
    const hits = scan("credentials.js", "HARDCODED_SECRET");
    expect(hits.length, "no credential finding at all").toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.severity).toBe("P1");
      expect(hit.provenance).toBe("regex");
      expect(hit.ruleId).toBe("regex:HARDCODED_SECRET");
      expect(hit.message.toLowerCase(), hit.message).toContain("fallback");
    }
    expect(oneHit(hits[0], "no credential finding at all").cwe).toBe("CWE-798");
  });
});

describe("Fehlalarm Backtick — a quoted constant is not a query under construction", () => {
  it("fires on concatenation and interpolation, the two shapes that really build a query", () => {
    const fired = firedLines("sql-static.js", "SQL_INJECTION");
    for (const needle of [
      'const sql = "SELECT * FROM accounts WHERE id = \'" + req.params.id',
      "SELECT id FROM users WHERE name = ${req.query.name}",
      'query("SELECT * FROM users WHERE id = " + id)',
    ]) {
      expect(fired, needle).toContain(lineOf("sql-static.js", needle));
    }
  });

  it("does not fire on a template constant, a parameterised statement, or prose", () => {
    const fired = firedLines("sql-static.js", "SQL_INJECTION");
    for (const needle of [
      "const metricsQuery = `SELECT COUNT(*) FROM metrics LIMIT 10`",
      'const SAFE_SQL = "SELECT name FROM widgets WHERE kind = ?"',
      'const DOC = "the report',
    ]) {
      expect(fired, needle).not.toContain(lineOf("sql-static.js", needle));
    }
  });
});

describe("Credential-Literal — provider-prefix form (rule 4)", () => {
  it("fires on the value shape alone, without a credential keyword", () => {
    const fired = firedLines("credentials.js", "HARDCODED_SECRET");
    expect(fired, 'accessKeyId: "AKIAIOSFODNN7EXAMPLE').toContain(
      lineOf("credentials.js", 'accessKeyId: "AKIAIOSFODNN7EXAMPLE'),
    );
  });

  it("classifies the vendor-documented example value as an example, not a P0 alarm", () => {
    const hit = oneHit(
      scan("credentials.js", "HARDCODED_SECRET").find(
        (i) => i.line === lineOf("credentials.js", 'accessKeyId: "AKIAIOSFODNN7EXAMPLE'),
      ),
      "no provider-form finding on the AKIA line",
    );
    expect(hit.severity).toBe("P1");
    expect(hit.message.toLowerCase(), hit.message).toContain("example");
    expect(hit.provenance).toBe("regex");
  });

  it("stays silent on key-format documentation and a bare prefix", () => {
    const fired = firedLines("credentials.js", "HARDCODED_SECRET");
    for (const needle of ['const awsKeyFormat = "AKIA followed', 'const slackShape = "xoxb-"']) {
      expect(fired, needle).not.toContain(lineOf("credentials.js", needle));
    }
  });
});

describe("SSRF — a URL taken from the request is fetched server-side (rule 5)", () => {
  it("fires on fetch/http.get/axios fed by request input", () => {
    const fired = firedLines("ssrf.js", "SSRF");
    for (const needle of [
      "await fetch(req.body.url)",
      "https.get(req.query.target",
      "axios.post(req.params.hook",
    ]) {
      expect(fired, needle).toContain(lineOf("ssrf.js", needle));
    }
  });

  it("stays silent on fixed URLs and config objects", () => {
    const fired = firedLines("ssrf.js", "SSRF");
    for (const needle of [
      'fetch("/api/health")',
      "axios.get(config.url)",
      'https.get("https://status.example/ping")',
    ]) {
      expect(fired, needle).not.toContain(lineOf("ssrf.js", needle));
    }
  });

  it("is a P1 finding with CWE-918 from the regex layer", () => {
    const hit = oneHit(
      scan("ssrf.js", "SSRF").find(
        (i) => i.line === lineOf("ssrf.js", "await fetch(req.body.url)"),
      ),
      "no SSRF finding",
    );
    expect(hit.severity).toBe("P1");
    expect(hit.cwe).toBe("CWE-918");
    expect(hit.ruleId).toBe("regex:SSRF");
  });
});

describe("Weak Randomness — Math.random behind a security-shaped name (rule 6)", () => {
  it("fires on an assignment and on a token factory's return line", () => {
    const fired = firedLines("weak-random.js", "WEAK_RANDOMNESS");
    for (const needle of [
      "const resetToken = Math.random()",
      "return Math.random().toString(36) + Math.random().toString(36)",
    ]) {
      expect(fired, needle).toContain(lineOf("weak-random.js", needle));
    }
  });

  it("stays silent on plain numbers and on the strong source", () => {
    const fired = firedLines("weak-random.js", "WEAK_RANDOMNESS");
    for (const needle of [
      "const jitter = Math.random() * 50",
      "const dice = Math.floor(Math.random() * 6)",
      "const requestId = crypto.randomUUID()",
    ]) {
      expect(fired, needle).not.toContain(lineOf("weak-random.js", needle));
    }
  });

  it("is a P2 finding with CWE-330 from the regex layer", () => {
    const hit = oneHit(
      scan("weak-random.js", "WEAK_RANDOMNESS").find(
        (i) => i.line === lineOf("weak-random.js", "const resetToken = Math.random()"),
      ),
      "no weak-randomness finding",
    );
    expect(hit.severity).toBe("P2");
    expect(hit.cwe).toBe("CWE-330");
    expect(hit.ruleId).toBe("regex:WEAK_RANDOMNESS");
  });
});

describe("CORS — wildcard origin paired with credentials (rule 7)", () => {
  it("fires on the wildcard line when credentials sit in the same block", () => {
    const fired = firedLines("cors.js", "CORS");
    expect(fired, "setHeader block").toContain(
      lineOf("cors.js", 'res.setHeader("Access-Control-Allow-Origin", "*");'),
    );
    expect(fired, "object configuration").toContain(
      lineOf("cors.js", '"Access-Control-Allow-Origin": "*",'),
    );
  });

  it("stays silent on a wildcard without credentials and on an allowlisted origin", () => {
    const fired = firedLines("cors.js", "CORS");
    expect(fired, "wildcard alone").not.toContain(
      lineOf("cors.js", "// wildcard alone, no credentials"),
    );
    expect(fired, "allowlisted origin").not.toContain(
      lineOf("cors.js", '"Access-Control-Allow-Origin": "https://app.example"'),
    );
  });

  it("is a P1 finding with CWE-942 from the regex layer", () => {
    const hit = oneHit(
      scan("cors.js", "CORS").find(
        (i) => i.line === lineOf("cors.js", '"Access-Control-Allow-Origin": "*",'),
      ),
      "no CORS finding",
    );
    expect(hit.severity).toBe("P1");
    expect(hit.cwe).toBe("CWE-942");
    expect(hit.ruleId).toBe("regex:CORS");
  });

  for (const reverse of [false, true]) {
    const source = (value: string, object: boolean): string => {
      const pair = object
        ? ['"Access-Control-Allow-Origin": "*",', `"Access-Control-Allow-Credentials": ${value},`]
        : [
            'res.setHeader("Access-Control-Allow-Origin", "*");',
            `res.setHeader("Access-Control-Allow-Credentials", ${value});`,
          ];
      if (reverse) pair.reverse();
      return object ? `const headers = {\n${pair.join("\n")}\n};` : pair.join("\n");
    };

    it(`requires explicit true in either syntax (reverse=${reverse})`, () => {
      for (const object of [false, true]) {
        for (const value of ["true", '"true"', "'true'"]) {
          const content = source(value, object);
          const hits = adapter
            .scanFile("src/cors.ts", content)
            .filter((issue) => issue.type === "CORS");
          expect(hits, content).toHaveLength(1);
          expect(hits[0]?.line).toBe(
            content.split("\n").findIndex((line) => line.includes("Allow-Origin")) + 1,
          );
        }
      }
    });

    it(`ignores false, missing and nonliteral credentials (reverse=${reverse})`, () => {
      for (const object of [false, true]) {
        for (const value of [
          "false",
          '"false"',
          "'false'",
          "undefined",
          "enabled",
          '"trueish"',
          "trueish",
          '"TRUE"',
        ]) {
          const content = source(value, object);
          expect(
            adapter.scanFile("src/cors.ts", content).filter((issue) => issue.type === "CORS"),
            content,
          ).toEqual([]);
        }
      }
    });
  }

  it("explains a blocked browser response, not authenticated data exfiltration", () => {
    const hit = oneHit(scan("cors.js", "CORS")[0], "no CORS finding");
    expect(hit.message).toMatch(/misconfiguration/i);
    expect(hit.message).toMatch(/browser.*block/i);
    expect(hit.explanation).toMatch(/browser.*block/i);
    expect(hit.explanation).toContain("Access-Control-Allow-Credentials: true");
    expect(hit.explanation).toMatch(/allowlist/i);
    expect(`${hit.message} ${hit.explanation}`).not.toMatch(
      /any website can read|hand the authenticated body|session rides along/i,
    );
  });
});
