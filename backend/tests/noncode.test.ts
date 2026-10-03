import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";
import { detectLanguage, maskForScanning } from "../src/services/analyzer/metrics.js";

/**
 * A finding is a claim about what the software DOES. Prose about what it once
 * did, or a sentence inside a comment, is not that claim. Measured on the
 * fixture case book: seven of the eight findings in src/legacy.php came from
 * its header comment, and the one real finding in web/mailer.php was doubled
 * by a comment mentioning the same function.
 */
const adapter = new RegexAdapter();
const types = (file: string, code: string): string[] =>
  adapter.scanFile(file, code).map((i) => i.type);

describe("comments are prose, not behaviour", () => {
  it("reads a PHP header comment as prose in both comment styles", () => {
    const php = `<?php
// the old dispatcher used eval($row["sql"]) here
/* chmod 777 on the cache was the previous failure mode */
# curl https://get.example.com/old | bash
function load($id) { return $stmt->execute([$id]); }
`;
    expect(types("src/legacy.php", php)).toEqual([]);
  });

  it("still finds the same construct when it is executed", () => {
    expect(types("src/legacy.php", "<?php\nfunction go($s) { eval($s); }\n")).toContain(
      "EVAL_USAGE",
    );
  });

  it("masks line and block comments in JavaScript", () => {
    const js = `// eval(userInput) was the old approach
/* console.log(token) lived here until 2024 */
const ok = JSON.parse(raw);
`;
    expect(types("src/old.ts", js)).toEqual([]);
  });

  it("masks shell comments", () => {
    expect(types("tools/x.sh", "# rm -rf / --no-preserve-root is what we removed\nls\n")).toEqual(
      [],
    );
  });

  it("keeps a string that the code really runs with", () => {
    // SQL injection lives INSIDE a string literal — masking every string would
    // trade one wrong number for a far worse one.
    expect(
      types("src/db.ts", 'const q = "SELECT name FROM users WHERE id = " + userId;\n'),
    ).toContain("SQL_INJECTION");
  });

  /**
   * The parameterised-query check read 400 characters *after* the match, so any
   * later ternary or `$1` in unrelated code muted a real injection. A placeholder
   * only ever parameterises the query it sits in, so the matched text is both the
   * smaller and the correct window.
   */
  it("judges a query by its own text, not by the code that follows", () => {
    const php = `function legacy_lookup_order(PDO $pdo, string $orderId): array
{
    $rows = $pdo->query('SELECT id, net, tax FROM orders WHERE id = ' . $orderId);

    return $rows === false ? [] : $rows->fetchAll(PDO::FETCH_ASSOC);
}
`;
    expect(types("src/legacy.php", php)).toContain("SQL_INJECTION");
    expect(
      types("src/db.ts", 'db.execute("SELECT id FROM users WHERE id = ?", [uid]);\n'),
    ).not.toContain("SQL_INJECTION");
  });

  it("masks a regex literal but not the code around it", () => {
    const ts = `const rule = /curl\\s+[^|\\n]*\\|\\s*bash/g;
const ok = rule.test(input);
`;
    expect(types("src/rules.ts", ts)).toEqual([]);
  });
});

describe("maskForScanning keeps the geometry of the file", () => {
  it("preserves length and line breaks so line numbers stay true", () => {
    const src = 'const a = 1; // eval(b)\nconst c = "x";\n';
    const masked = maskForScanning(src, "TypeScript");
    expect(masked.length).toBe(src.length);
    expect(masked.split("\n").length).toBe(src.split("\n").length);
    expect(masked.split("\n")[1]).toBe(src.split("\n")[1]);
  });

  /**
   * The block comment delimiters were consumed without leaving blanks behind, so
   * every finding below a block comment reported a line number too low. Four
   * characters per comment is enough to move a finding onto its neighbour.
   */
  it("keeps the block comment delimiters as blanks", () => {
    const src = "/* prose */\nconst c = eval(x);\n";
    const masked = maskForScanning(src, "TypeScript");
    expect(masked.length).toBe(src.length);
    expect(masked.split("\n")[1]).toBe(src.split("\n")[1]);
    const [hit] = adapter.scanFile("src/a.ts", src);
    expect(hit?.type).toBe("EVAL_USAGE");
    // the point of the mask: the finding is on line 2, not on line 1
    expect(hit?.line).toBe(2);
  });

  /**
   * Invariant over the backend's own sources: a mask that changes the length of
   * a file silently renumbers every finding in it, which is worse than the false
   * positives it removes. This is the case the hand-written snippets missed.
   */
  it("keeps length for every source file of this package", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(new URL("../src", import.meta.url).pathname).filter((f) =>
      /\.(ts|js|json|php|py|sh)$/.test(f),
    );
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const masked = maskForScanning(src, detectLanguage(file));
      expect(masked.length, file).toBe(src.length);
      expect(masked.split("\n").length, file).toBe(src.split("\n").length);
    }
  });
});
