import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * SELBST-23 — the two numbers README.md:54 states about our own scan.
 *
 * The README sentence used to name 68 findings and 59 quoted test text for the
 * first scan of this repository, and nothing in the tree or in the working
 * folders could reproduce either number. A reader who doubts a number must be
 * able to form it, so the run's own finding list now ships as
 * `docs/self-scan-findings.ndjson`: the handoff text page of the product
 * (`backend/src/server/routes/agent.ts`, one finding per line — path, line,
 * rule, severity, CWE, fingerprint; the file's source never travels with it,
 * because the fingerprint hashes the line on the server).
 *
 * Both numbers are formed here, from that file plus this tree, the same two
 * steps any reader takes: `wc -l` over the file, and the line each finding
 * points at. Nothing is inherited from the README: the README is what gets
 * compared.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const FINDINGS = "docs/self-scan-findings.ndjson";
const MARKER = "There is no accuracy number here, on purpose.";

const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

/** One finding per line, exactly as the handoff endpoint returned it. */
const findingLines = (): string[] =>
  read(FINDINGS)
    .split("\n")
    .filter((l) => l.length > 0);

type Finding = {
  schema: string;
  path: string;
  line: number;
  type: string;
  ruleId: string;
  severity: string;
  provenance: string;
};

const findings = (): Finding[] => findingLines().map((l) => JSON.parse(l) as Finding);

/** The source line the finding points at, read out of this tree. */
const lineAt = (f: Finding): string => read(f.path).split("\n")[f.line - 1] ?? "";

/** A rule that fired inside an assertion is test text, not a call in the product. */
const isQuotedTestText = (f: Finding): boolean => /expect\s*\(/.test(lineAt(f));

/** The README's own bullet, found by its heading rather than by a line count. */
const readmeBullet = (): { text: string; line: number } => {
  const lines = read("README.md").split("\n");
  const i = lines.findIndex((l) => l.includes(MARKER));
  const bullet = lines[i];
  if (i < 0 || bullet === undefined) {
    throw new Error(`README.md has no bullet containing "${MARKER}"`);
  }
  return { text: bullet.replace(/\*/g, ""), line: i + 1 };
};

/** The two numbers the sentence states: total findings, and quoted test text. */
const readmeNumbers = (): { total: number; quoted: number; sentence: string } => {
  const { text } = readmeBullet();
  const m = /reported (\d+) findings?[^\n]*?(\d+) of them/.exec(text);
  expect(m, `the accuracy bullet states no pair of numbers: ${text.slice(0, 200)}`).not.toBeNull();
  return { total: Number(m?.[1]), quoted: Number(m?.[2]), sentence: text };
};

describe("the delivered self-scan list (docs/self-scan-findings.ndjson)", () => {
  it("is a finding list, not something else wearing the format", () => {
    const rows = findings();
    expect(rows.length, "the file holds at least one finding line").toBeGreaterThan(0);
    for (const [i, f] of rows.entries()) {
      const where = `line ${i + 1}`;
      expect(f.schema, where).toBe("ephemora.finding.v1");
      expect(typeof f.path, where).toBe("string");
      expect(Number.isInteger(f.line) && f.line > 0, where).toBe(true);
      expect(f.severity, where).toMatch(/^P[0-3]$/);
      expect(
        ["gitleaks", "semgrep", "osv", "ruff", "regex", "dependency", "history", "unknown"],
        where,
      ).toContain(f.provenance);
      /* the promise of this channel: the pointed-at line is hashed, never shipped */
      expect(f, `${where}: the source line must not travel`).not.toHaveProperty("code");
      expect(f, `${where}: no snippet field`).not.toHaveProperty("snippet");
      expect(f, `${where}: no matched-text field`).not.toHaveProperty("match");
    }
  });

  it("points only at paths inside this repository, and every one resolves", () => {
    for (const [i, f] of findings().entries()) {
      const where = `line ${i + 1}`;
      expect(path.isAbsolute(f.path), `${where}: absolute path ${f.path}`).toBe(false);
      expect(f.path.split("/").includes(".."), `${where}: escapes the repository`).toBe(false);
      expect(f.path.startsWith(".git/"), `${where}: git internals`).toBe(false);
      expect(existsSync(path.join(REPO, f.path)), `${where}: ${f.path} is not in the tree`).toBe(
        true,
      );
    }
  });

  it("carries no value that looks like a credential, only the rule that names it", () => {
    const shapes: Array<[string, RegExp]> = [
      ["aws-shaped key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
      ["github token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
      ["slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
      ["openai-shaped key", /\bsk-[A-Za-z0-9]{20,}\b/],
      ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/],
      ["credentials in a url", /\/\/[^/\s:@]+:[^/\s@]+@/],
    ];
    for (const [i, raw] of findingLines().entries()) {
      for (const [name, re] of shapes) {
        expect(re.test(raw), `line ${i + 1} quotes a value (${name})`).toBe(false);
      }
    }
  });
});

describe("the two numbers README.md:54 claims (README.md accuracy bullet)", () => {
  const total = () => findingLines().length;
  const quoted = () => findings().filter(isQuotedTestText).length;

  it("names the file the numbers come from", () => {
    const { text } = readmeBullet();
    expect(text.includes(FINDINGS), `the sentence does not name ${FINDINGS}`).toBe(true);
  });

  it("states the total the file counts", () => {
    const { total: claimed, sentence } = readmeNumbers();
    expect(
      claimed,
      `README says ${claimed}, the file holds ${total()}: ${sentence.slice(0, 260)}`,
    ).toBe(total());
  });

  it("states the quoted-test-text count the file counts", () => {
    const { quoted: claimed, sentence } = readmeNumbers();
    expect(
      claimed,
      `README says ${claimed}, findings on an expect(...) line: ${quoted()} — ${sentence.slice(0, 260)}`,
    ).toBe(quoted());
  });

  it("counts the quoted ones on assertion lines, which is what the sentence says", () => {
    const onAssert = findings().filter(isQuotedTestText);
    for (const f of onAssert) {
      expect(lineAt(f), `${f.path}:${f.line} is not an assertion`).toMatch(/expect\s*\(/);
    }
    expect(quoted()).toBe(onAssert.length);
  });
});
