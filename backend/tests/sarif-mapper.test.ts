import { describe, it, expect } from "vitest";
import { sarifToIssues } from "../src/services/security/sarif-mapper.js";

describe("sarifToIssues", () => {
  it("maps SARIF warning to P1 XSS with provenance", () => {
    const sarif = {
      runs: [
        {
          tool: {
            driver: {
              rules: [
                { id: "javascript.lang.security.audit.xss", shortDescription: { text: "XSS" } },
              ],
            },
          },
          results: [
            {
              ruleId: "javascript.lang.security.audit.xss",
              level: "warning",
              message: { text: "Detected XSS via innerHTML" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/app.ts" },
                    region: { startLine: 12, snippet: { text: "el.innerHTML = x" } },
                  },
                },
              ],
            },
          ],
        },
      ],
    } as never;
    const issues = sarifToIssues(sarif);
    expect(issues[0]!.type).toBe("XSS");
    expect(issues[0]!.severity).toBe("P1");
    expect(issues[0]!.provenance).toBe("semgrep");
    expect(issues[0]!.line).toBe(12);
  });

  it("maps error level to P0", () => {
    const sarif = {
      runs: [
        {
          tool: { driver: { rules: [] } },
          results: [
            {
              ruleId: "javascript.lang.security.audit.sqli",
              level: "error",
              message: { text: "SQLi" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/db.ts" },
                    region: { startLine: 5 },
                  },
                },
              ],
            },
          ],
        },
      ],
    } as never;
    expect(sarifToIssues(sarif)[0]!.severity).toBe("P0");
  });

  it("ships the threat score of 10 / 7 / 3 for error / warning / note", () => {
    // Characterization of the scale the mapping writes into every issue, not
    // of the constant it reads: the numbers below are what a stored result
    // carries today, and the city's tower height is built from them.
    const sarif = {
      runs: [
        {
          tool: { driver: { rules: [] } },
          results: (["error", "warning", "note"] as const).map((level, i) => ({
            ruleId: `javascript.lang.security.audit.${level}`,
            level,
            message: { text: `finding ${String(i)}` },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: "src/db.ts" },
                  region: { startLine: i + 1 },
                },
              },
            ],
          })),
        },
      ],
    } as never;
    const issues = sarifToIssues(sarif);
    expect(issues.map((i) => [i.severity, i.score])).toEqual([
      ["P0", 10],
      ["P1", 7],
      ["P2", 3],
    ]);
  });
});
