import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  isScannedPath,
  SUPPORTED_EXTENSIONS,
  supportedExtensionsLabel,
} from "../src/services/analyzer/orchestrator.js";
import { detectLanguage, ENV_FILE, isDataFile } from "../src/services/analyzer/metrics.js";
import { REGEX_PATTERNS, RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import { FINDING_KNOWLEDGE } from "../src/services/security/finding-knowledge.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const adapter = new RegexAdapter();

/** Types a file of the given path yields, as `type:line` for readable asserts */
function typesIn(filePath: string, content: string): string[] {
  return adapter.scanFile(filePath, content).map((i) => i.type);
}

describe("scan surface — which files the user's folder contributes", () => {
  const NEW_KINDS = [".sh", ".bash", ".sql", ".tf", ".php", ".cs", ".kt", ".swift"];

  it("puts script, query, infra and other-language files in scope", () => {
    for (const ext of NEW_KINDS) {
      expect(SUPPORTED_EXTENSIONS.has(ext), `${ext} must be scanned`).toBe(true);
    }
  });

  /**
   * The frontend walker and the backend pipeline each keep their own list, and
   * the only thing keeping them equal was a comment. A file the walker drops is
   * a file the user believes was scanned.
   */
  it("keeps the frontend walker's list identical to the backend's", () => {
    const src = readFileSync(
      path.join(repoRoot, "frontend/src/hooks/useLocalAnalysis.ts"),
      "utf-8",
    );
    const block = src.match(/const SUPPORTED_EXTENSIONS = new Set\(\[([\s\S]*?)\]\)/);
    expect(block, "frontend extension list not found").toBeTruthy();
    const listed = [...block![1]!.matchAll(/"(\.[a-z0-9]+)"/g)].map((m) => m[1]!);
    expect(new Set(listed)).toEqual(new Set(SUPPORTED_EXTENSIONS));
  });

  /**
   * `.env` is recognised by name, not by extension, and both walkers have to
   * agree: a file the browser never uploads cannot appear in any report.
   */
  it("keeps the frontend's env rule identical to the backend's", () => {
    const src = readFileSync(
      path.join(repoRoot, "frontend/src/hooks/useLocalAnalysis.ts"),
      "utf-8",
    );
    const frontend = src.match(/const ENV_FILE = \/(.*)\/;/)?.[1];
    expect(frontend, "frontend env rule not found").toBeTruthy();
    expect(frontend).toBe(ENV_FILE.source);
    expect(isScannedPath("config/.env.production")).toBe(true);
    expect(isScannedPath("README.md")).toBe(false);
  });

  /**
   * The message shown when a folder comes back empty named thirteen kinds while
   * the scan accepts many more — a lie about the tool's own reach.
   */
  it("names every kind it accepts when it says what it reads", () => {
    const label = supportedExtensionsLabel();
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(label, `${ext} missing from the message`).toContain(ext.slice(1));
    }
    expect(label).toContain("env");
  });

  it("names the new file kinds so the city colours them", () => {
    expect(detectLanguage("scripts/deploy.sh")).toBe("Shell");
    expect(detectLanguage("db/migrations/001.sql")).toBe("SQL");
    expect(detectLanguage("infra/network.tf")).toBe("Terraform");
    expect(detectLanguage("app/legacy.php")).toBe("PHP");
    expect(detectLanguage("src/Program.cs")).toBe("CSharp");
    expect(detectLanguage("src/Main.kt")).toBe("Kotlin");
    expect(detectLanguage("Sources/App.swift")).toBe("Swift");
  });
});

describe("new finding types on the code the scan already sees", () => {
  it("flags install hooks in a package manifest, not in source", () => {
    const pkg = `{
  "name": "widget",
  "scripts": {
    "postinstall": "node scripts/setup.js"
  }
}`;
    expect(typesIn("package.json", pkg)).toContain("INSTALL_HOOKS");
    // A source file merely mentioning the lifecycle name is not a manifest
    expect(typesIn("src/build.ts", `const hook = "postinstall"; // ${pkg}`)).not.toContain(
      "INSTALL_HOOKS",
    );
  });

  it("flags remote code piped into a shell but not a plain download", () => {
    expect(
      typesIn("scripts/install.sh", "curl -fsSL https://get.example.com | sudo bash\n"),
    ).toContain("CURL_PIPE_BASH");
    expect(
      typesIn("scripts/get.sh", "curl -o data.json https://example.com/data.json\n"),
    ).not.toContain("CURL_PIPE_BASH");
  });

  it("flags world-writable permissions but not ordinary ones", () => {
    expect(typesIn("scripts/fix.sh", "chmod 777 /var/run/app.sock\n")).toContain("WORLD_WRITABLE");
    expect(typesIn("scripts/fix.sh", "chmod 644 README.md\n")).not.toContain("WORLD_WRITABLE");
  });

  it("flags disabled certificate checks in every dialect that appears", () => {
    expect(typesIn("api/client.py", "requests.get(url, verify=False)\n")).toContain(
      "TLS_VERIFICATION_DISABLED",
    );
    expect(
      typesIn("src/tls.ts", "const agent = new https.Agent({ rejectUnauthorized: false });\n"),
    ).toContain("TLS_VERIFICATION_DISABLED");
    expect(typesIn("Makefile", "wget --no-check-certificate https://example.com/x\n")).toContain(
      "TLS_VERIFICATION_DISABLED",
    );
    expect(
      typesIn("src/tls.ts", "const ok = check({ rejectUnauthorized: true });\n"),
    ).not.toContain("TLS_VERIFICATION_DISABLED");
  });

  it("flags wiping the filesystem but not a normal build cleanup", () => {
    expect(typesIn("scripts/reset.sh", "rm -rf / --no-preserve-root\n")).toContain(
      "DESTRUCTIVE_COMMAND",
    );
    expect(typesIn("scripts/reset.sh", "dd if=/dev/zero of=/dev/sda bs=1M\n")).toContain(
      "DESTRUCTIVE_COMMAND",
    );
    expect(typesIn("scripts/clean.sh", 'rm -rf "$BUILD_DIR"\n')).not.toContain(
      "DESTRUCTIVE_COMMAND",
    );
    expect(typesIn("src/fs.ts", "fs.rm(dir, { recursive: true });\n")).not.toContain(
      "DESTRUCTIVE_COMMAND",
    );
  });

  /**
   * Measured on this repo: the new rules hit their own test fixtures first.
   * A fixture string that describes a destructive command is not a machine
   * about to run one.
   */
  it("does not mistake quoted fixture text for an executed shell command", () => {
    const findings = adapter.scanFile(
      "tests/fixtures.sh.test.ts",
      'expect(run("rm -rf / --no-preserve-root")).toBe(false);\n',
    );
    const hit = findings.find((f) => f.type === "DESTRUCTIVE_COMMAND");
    expect(hit).toBeUndefined();
  });

  it("keeps the same command outside a test file an alarm", () => {
    const findings = adapter.scanFile("scripts/reset.sh", "rm -rf / --no-preserve-root\n");
    expect(findings.find((f) => f.type === "DESTRUCTIVE_COMMAND")?.severity).toBe("P0");
  });

  /**
   * A .sql file IS the query language — flagging every statement in a migration
   * as injection would bury the real findings under hundreds of false ones.
   */
  it("does not read a migration file as SQL injection", () => {
    const migration = `INSERT INTO users (id, name) VALUES (1, 'a');
SELECT id, name FROM users WHERE active = 1 ORDER BY id;
DELETE FROM sessions WHERE expired = true;
`;
    expect(typesIn("db/migrations/001_init.sql", migration)).not.toContain("SQL_INJECTION");
  });

  it("still flags raw SQL built inside application code", () => {
    expect(
      typesIn("src/db.ts", 'const q = "SELECT name FROM users WHERE id = " + userId;\n'),
    ).toContain("SQL_INJECTION");
  });

  /**
   * `== null` / `== undefined` is the deliberate nullish idiom — it is the one
   * loose comparison a reviewer expects to read, not a bug. A real audit of
   * this repo's own scan found the rule firing on exactly that (twice) and on
   * nothing else in ordinary source.
   */
  it("does not read the nullish idiom as loose equality", () => {
    for (const src of [
      "if (focusTier == null) return 1;\n",
      "const gone = value == undefined;\n",
      "a = b == null ? 0 : b;\n",
      "if (x != null) y();\n",
    ]) {
      expect(typesIn("src/a.ts", src), src.trim()).not.toContain("LOOSE_EQUALITY");
    }
  });

  it("still flags a loose comparison against a value", () => {
    expect(typesIn("src/a.ts", 'if (a == "1") {}\n')).toContain("LOOSE_EQUALITY");
    expect(typesIn("src/a.ts", "if (a == b) {}\n")).toContain("LOOSE_EQUALITY");
    expect(typesIn("src/a.ts", "if (a == 0) {}\n")).toContain("LOOSE_EQUALITY");
  });

  /** The negative lookahead must not let `===` slip back in as a match */
  it("keeps strict equality quiet", () => {
    for (const src of ["if (a === b) {}\n", "if (a !== b) {}\n", "x = y === null;\n"]) {
      expect(typesIn("src/a.ts", src), src.trim()).not.toContain("LOOSE_EQUALITY");
    }
  });
});

describe("every emitted finding type explains itself", () => {
  it("has curated knowledge for all regex pattern types", () => {
    const undocumented = REGEX_PATTERNS.map((p) => p.type).filter((t) => !FINDING_KNOWLEDGE[t]);
    expect(undocumented).toEqual([]);
  });

  it("carries a German explanation and fix for every curated type", () => {
    const untranslated = Object.entries(FINDING_KNOWLEDGE)
      .filter(([, k]) => !k.explainDe?.trim() || !k.fixDe?.trim())
      .map(([type]) => type);
    expect(untranslated).toEqual([]);
  });
});
