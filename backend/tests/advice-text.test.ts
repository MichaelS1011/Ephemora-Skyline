import { describe, it, expect } from "vitest";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";

/**
 * A finding is a claim that the software does something. Text that only *names*
 * the thing is not that claim, and the product itself is full of such text: the
 * advice catalogue explains what `eval()` is, the fix suggestions show a bad
 * example on purpose, and every one of those lines used to come back as a
 * finding of the tool's own making — 11 of 96 in the last self-scan.
 *
 * The line-level test is deliberately narrow: a line whose code part is only
 * `name:` or `name =` plus string text, with nothing invoked on it, states no
 * behaviour. A command that runs (`bash -c "rm -rf /"`) and a query that is
 * assembled (`query('SELECT … ' . $id)`) both keep their finding.
 */
const adapter = new RegexAdapter();
const types = (file: string, code: string): string[] =>
  adapter.scanFile(file, code).map((i) => i.type);

describe("advice text is not behaviour", () => {
  it("reads an explanation of a dangerous call as prose", () => {
    const ts = `export const KNOWLEDGE = {
  EVAL_USAGE: {
    explain:
      "eval() executes a string as code and new Function() compiles one too.",
  },
};
`;
    expect(types("src/knowledge.ts", ts)).toEqual([]);
  });

  it("reads a deliberately unsafe example in a fix suggestion as prose", () => {
    const ts = `export const FIXES = [
  {
    token: "SQL_INJECTION",
    suggestion: {
      code: \`// unsafe:  db.query(\${"SELECT * FROM users WHERE id = " + id})
const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [id]);\`,
    },
  },
];
`;
    expect(types("src/fixes.ts", ts)).toEqual([]);
  });

  it("keeps the same construct when the line runs it", () => {
    expect(types("src/db.ts", 'db.query("SELECT * FROM users WHERE id = " + id);\n')).toContain(
      "SQL_INJECTION",
    );
    expect(types("src/run.ts", 'const p = exec("rm -rf " + dir);\n')).toContain("CMD_INJECTION");
    expect(types("src/x.ts", "eval(payload);\n")).toContain("EVAL_USAGE");
  });

  /**
   * A shell line is a command without parentheses, so "no call on the line" is
   * not enough — the text has to be sitting in an assignment or a property.
   */
  it("keeps a shell command that only looks like a string on the screen", () => {
    expect(
      types("scripts/run.sh", 'bash -c "curl https://setup.example/install.sh | bash"\n'),
    ).toContain("CURL_PIPE_BASH");
  });

  /**
   * Credentials are a different adapter's job (gitleaks, on the whole folder),
   * and `KEY = "value"` is exactly the finding there — so the rule below lives
   * in the regex adapter and cannot reach it. Pinned so a future merge of the
   * two paths does not silence secret assignments.
   */
  it("does not let the regex adapter's prose rule near a secret assignment", async () => {
    const { GitleaksAdapter } =
      await import("../src/services/security/adapters/gitleaks-adapter.js");
    const gitleaks = new GitleaksAdapter();
    const issues = await gitleaks["fallbackScan"](
      'STRIPE_TOKEN = "UnitTestPlaceholderValue1234567890"\n',
    );
    expect(issues.map((i) => i.type)).toContain("HARDCODED_SECRET");
  });

  it("works in the languages that ship a catalogue", () => {
    expect(
      types(
        "legacy.py",
        'KNOWLEDGE = {\n    "eval_usage":\n        "never call eval() with user input; use ast.literal_eval",\n}\n',
      ),
    ).toEqual([]);
    expect(
      types("legacy.rb", "HELPERS = {\n  destructive: 'never run rm -rf / on the host',\n}\n"),
    ).toEqual([]);
  });

  /**
   * Narrower on purpose. `const q = "SELECT … OR 1=1 --"` binds the payload to a
   * name inside the code, and that has always been a finding the product makes —
   * only a catalogue entry, where the object itself is the data, is exempt.
   */
  it("keeps a payload that is bound to a name", () => {
    expect(
      types("src/q.js", 'const q = "SELECT * FROM users WHERE id = \' OR 1=1 --";\n'),
    ).toContain("SQL_INJECTION");
  });
});
