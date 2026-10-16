import { describe, it, expect } from "vitest";
import { sarifToIssues, stripScannerNoise } from "../src/services/security/sarif-mapper.js";
import { FINDING_KNOWLEDGE } from "../src/services/security/finding-knowledge.js";
/**
 * Stays as it is on purpose: `tests/helpers/scanners.ts` has nothing to take from
 * this file. The engine already ran — its SARIF is reproduced below as recorded
 * output, advertisement and unsubstituted `$FUNC` included — and what is under test
 * is the mapping that consumes those bytes. In-process, no binary, no child process,
 * no share of the suite's load. Replacing the recorded report with a stub would make
 * the case assert about the stub.
 */

/**
 * R3-10: a semgrep-derived finding carried the vendor's Pro advertisement and
 * an unsubstituted metavariable straight into the UI's "To fix" block —
 * verbatim in `target-warm.json`, findings[0].fix, reproduced in three
 * identical runs:
 *
 *   "Detected calls to child_process from a function argument `$FUNC`. …
 *    \n💎 Enable cross-file analysis and Pro rules for free at sg.run/pro"
 *
 * The adapter boundary is where these strings enter the system, so this is
 * where they leave again. The useful half of the sentence must survive.
 */
const WITNESS_MESSAGE =
  "Detected calls to child_process from a function argument `$FUNC`. " +
  "This could lead to a command injection if the input is user controllable. " +
  "Try to avoid calls to child_process, and if it is needed ensure user input " +
  "is correctly sanitized or sandboxed. \n" +
  "💎 Enable cross-file analysis and Pro rules for free at sg.run/pro";

const RULE_ID =
  "python.lang.security.audit.command-injection-os-system.command-injection-os-system";

function sarifWith(message: string, help: string) {
  return {
    runs: [
      {
        tool: {
          driver: {
            rules: [{ id: RULE_ID, help: { text: help }, shortDescription: { text: "cmd" } }],
          },
        },
        results: [
          {
            ruleId: RULE_ID,
            level: "error",
            message: { text: message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: "api/handlers.js" },
                  region: { startLine: 3 },
                },
              },
            ],
          },
        ],
      },
    ],
  } as never;
}

describe("stripScannerNoise (R3-10)", () => {
  it("removes the promotion line and the unsubstituted placeholder, keeps the sentence", () => {
    const cleaned = stripScannerNoise(WITNESS_MESSAGE);
    expect(cleaned).not.toContain("sg.run");
    expect(cleaned).not.toContain("$FUNC");
    expect(cleaned).not.toContain("💎");
    expect(cleaned).not.toContain("Pro rules");
    expect(cleaned).toContain("Detected calls to child_process from a function argument");
    expect(cleaned).toContain("This could lead to a command injection");
  });

  it("leaves money-looking tokens and clean text alone", () => {
    expect(stripScannerNoise("costs $5 per seat")).toBe("costs $5 per seat");
    expect(stripScannerNoise("Use parameterized queries.")).toBe("Use parameterized queries.");
  });

  it("carries the strip for message and fix at the boundary, so no consumer sees the promo", () => {
    const [issue] = sarifToIssues(sarifWith(WITNESS_MESSAGE, WITNESS_MESSAGE));
    expect(issue!.message).not.toContain("sg.run");
    expect(issue!.message).not.toContain("$FUNC");
    expect(issue!.fix).not.toContain("sg.run");
    expect(issue!.fix).not.toContain("$FUNC");
    expect(issue!.fix).toContain("Detected calls to child_process");
  });

  it("falls back to the curated knowledge entry when the strip leaves the fix empty", () => {
    const [issue] = sarifToIssues(
      sarifWith(
        "os.system call with user input.",
        "💎 Enable cross-file analysis and Pro rules for free at sg.run/pro",
      ),
    );
    expect(issue!.type).toBe("CMD_INJECTION");
    expect(issue!.fix).toBe(FINDING_KNOWLEDGE.CMD_INJECTION!.explain);
    expect(issue!.fix).not.toContain("sg.run");
  });

  it("falls back to the curated knowledge entry when the message is pure noise", () => {
    const [issue] = sarifToIssues(
      sarifWith(
        "💎 Enable cross-file analysis and Pro rules for free at sg.run/pro",
        "safe help text",
      ),
    );
    expect(issue!.message).toBe(FINDING_KNOWLEDGE.CMD_INJECTION!.explain);
    expect(issue!.message).not.toContain("sg.run");
  });
});
