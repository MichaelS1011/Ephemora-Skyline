import { describe, it, expect } from "vitest";
import { buildSnippet } from "../src/services/security/finding-knowledge.js";
import { maskSecretText } from "../src/services/security/redact.js";

/**
 * BELEG-02 — what a finding card quotes, and what it must not quote.
 *
 * README.md:65 promises "the line the rule matched with two lines either side
 * read out of your copy of the file"; docs/PRIVACY.md:15 promises "a finding stores
 * the line it was found on plus a two-line code frame" and names the token
 * shapes the erasure hides "GitHub, AWS, Slack, Google, Stripe, OpenAI, npm,
 * JWT, private-key headers". The data is the frame builder and the masking
 * table themselves — no sentence from the README is read back here.
 */

const FILE = [
  "line 1", //                            1
  "line 2", //                            2
  "const query = db.find(a, b);", //      3
  "line 4", //                            4
  "line 5", //                            5
].join("\n");

describe("the frame around the line the rule matched (README.md:65)", () => {
  it("quotes two lines on either side of a finding in the middle of a file", () => {
    const frame = buildSnippet(FILE, 3)!;
    expect(frame.line).toBe("const query = db.find(a, b);");
    expect(frame.number).toBe(3);
    expect(frame.before).toEqual(["line 1", "line 2"]);
    expect(frame.after).toEqual(["line 4", "line 5"]);
  });

  it("is two lines deep, not one and not three", () => {
    const frame = buildSnippet(Array.from({ length: 21 }, (_, i) => `l${i + 1}`).join("\n"), 11)!;
    expect(frame.before).toHaveLength(2);
    expect(frame.after).toHaveLength(2);
    expect(frame.before).toEqual(["l9", "l10"]);
    expect(frame.after).toEqual(["l12", "l13"]);
  });

  it("says when there is nothing above or below instead of inventing a line", () => {
    const top = buildSnippet(FILE, 1)!;
    expect(top.before).toEqual([]);
    expect(top.after).toEqual(["line 2", "const query = db.find(a, b);"]);

    const bottom = buildSnippet(FILE, 5)!;
    expect(bottom.before).toEqual(["const query = db.find(a, b);", "line 4"]);
    expect(bottom.after).toEqual([]);
  });

  it("reads the lines out of the file it was given, in the file's own order", () => {
    const source = ["a", "b", "c", "d", "e", "f"].join("\n");
    for (const line of [1, 2, 3, 4, 5, 6]) {
      const frame = buildSnippet(source, line)!;
      expect(frame.line).toBe(source.split("\n")[line - 1]);
      expect([...frame.before, frame.line, ...frame.after]).toEqual(
        source.split("\n").slice(Math.max(0, line - 3), Math.min(6, line + 2)),
      );
    }
  });

  it("hands back nothing when there is no file to read", () => {
    // README.md:65: "on the demo it is the one line, because nothing was read"
    expect(buildSnippet(undefined, 4)).toBeUndefined();
  });

  it("clamps a line number the file does not have to the lines it does have", () => {
    const frame = buildSnippet("only\ntwo\nlines", 99)!;
    expect(frame.number).toBe(3);
    expect(frame.line).toBe("lines");
  });
});

describe("the shapes the erasure knows (docs/PRIVACY.md:15)", () => {
  const hidden = "‹hidden›";

  /**
   * The npm family is named in the README sentence and was the one shape the
   * existing masking tests did not quote, so it is checked here together with
   * the AWS temporary key id — both are in the table, neither was measured.
   *
   * FINDING (stays red until the table is fixed): the shipped npm pattern is
   * `/\b_npmp_[0-9a-f]{32,}\b/g` (backend/src/services/security/redact.ts:66),
   * which needs the literal "_npmp_" — a real npm token reads `npm_…`. Behind an
   * innocent name the value therefore reaches the city JSON, which is what
   * docs/PRIVACY.md:15 says cannot happen.
   */
  it("hides an npm token behind any name (docs/PRIVACY.md:15)", () => {
    const token = "npm_" + "0123456789abcdef0123456789abcdef0123";
    const masked = maskSecretText(`cfg.put("${token}")`);
    expect(masked, `npm token survived masking: ${masked}`).not.toContain(token);
    expect(masked).toContain(hidden);
  });

  /**
   * FINDING, same class: docs/PRIVACY.md:15 names "GitHub" among the shapes and the
   * sentence's own example is `const pat = "ghp_…"`. The fine-grained form, which
   * GitHub issues today, reads `github_pat_…` and matches no pattern in the table
   * (`gh[pousr]_` needs g/h followed by p,o,u,s,r and an underscore).
   */
  it("hides a GitHub fine-grained token behind an innocuous name (docs/PRIVACY.md:17)", () => {
    const token = "github_pat_" + "11ABCDEFG0abcdefghijklmn_9Z8y7x6w5v4u3t2s1r0q";
    const masked = maskSecretText(`const pat = "${token}";`);
    expect(masked, `fine-grained PAT survived masking: ${masked}`).not.toContain(token);
  });

  it("hides every other family the sentence lists", () => {
    const samples: Record<string, string> = {
      GitHub: "ghp_" + "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5",
      "AWS access key": "AKIA" + "ABCDEFGHIJKLMNOP",
      "AWS temporary key": "ASIAABCDEFGHIJKLMNOP",
      Slack: "xoxb-" + "1234567890-abcdefghij",
      Google: "AIza" + "SyD-abcdefghijklmnopqrstuvwxyz12345",
      "Stripe secret": "sk_live_" + "abcdefghijklmnopqrstuvwxyz",
      "Stripe publishable": "pk_test_abcdefghijklmnopqrstuvwx",
      OpenAI: "sk-" + "ABCDEFGHIJKLMNOPQRSTUVWX",
      JWT: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz123456",
      "private key header": "-----BEGIN OPENSSH PRIVATE KEY-----",
    };
    for (const [family, token] of Object.entries(samples)) {
      const masked = maskSecretText(`put("${token}")`);
      expect(masked, `${family} survives masking: ${masked}`).not.toContain(token);
    }
  });

  it("hides an AWS temporary key id, not only the long-lived one", () => {
    expect(maskSecretText(`aws = "ASIAABCDEFGHIJKLMNOP"`)).not.toContain("ASIAABCDEFGHIJKLMNOP");
    expect(maskSecretText(`aws = "AKIA" + "ABCDEFGHIJKLMNOP"`)).not.toContain(
      "AKIA" + "ABCDEFGHIJKLMNOP",
    );
  });

  it("keeps the name, because the name says where to fix (docs/PRIVACY.md:15)", () => {
    const masked = maskSecretText('const JWT_SECRET = "replaced-by-env";');
    expect(masked).toContain("JWT_SECRET");
    expect(masked).not.toContain("replaced-by-env");
  });
});
