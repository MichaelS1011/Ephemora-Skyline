import { describe, it, expect } from "vitest";
import { resultToSarif } from "../src/utils/sarif.js";
import type { AnalysisResult } from "../src/models/index.js";

/**
 * The panel shows a rule with its CWE, its source of wisdom and a plain-language
 * explanation. The exported file used to carry none of that (measured on a real
 * 127-result export: `cwe` 0x, `refUrl` 0x, `helpUri` 0x), so the export was the
 * thinner of the two views — exactly backwards for the artefact a team reviews.
 */
function resultWith(extra: Record<string, unknown>): AnalysisResult {
  return {
    id: "scan-1",
    files: [
      {
        path: "src/a.ts",
        vulnerabilities: [
          {
            type: "SQL_INJECTION",
            severity: "P0",
            score: 9,
            line: 3,
            code: "db.query(sql)",
            message: "query built by concatenation",
            provenance: "regex",
            ...extra,
          },
        ],
      },
    ],
  } as unknown as AnalysisResult;
}

/**
 * The rule fields this file asserts on. An open `any` would let a rename in the
 * exporter pass every assertion here while the panel and the file disagree —
 * this is the file whose whole point is that the export carries the reasoning.
 * Optional because the last case asserts absence: a finding with neither CWE nor
 * explanation must invent neither.
 */
interface SarifRule {
  helpUri?: string;
  shortDescription?: { text?: string };
  fullDescription?: { text?: string };
  help?: { markdown?: string };
  properties?: { cwe?: string; tags?: string[] };
}

const ruleOf = (sarif: ReturnType<typeof resultToSarif>) =>
  sarif.runs[0]!.tool.driver.rules[0] as SarifRule;

describe("the SARIF export carries the reasoning the panel shows", () => {
  it("writes the CWE, the reference and the explanation onto the rule", () => {
    const rule = ruleOf(
      resultToSarif(
        resultWith({
          cwe: "CWE-89",
          refUrl: "https://owasp.org/www-community/attacks/SQL_Injection",
          explanation: "A database query is built by string concatenation.",
        }),
      ),
    );
    expect(rule.helpUri).toBe("https://owasp.org/www-community/attacks/SQL_Injection");
    expect(rule.properties?.cwe).toBe("CWE-89");
    expect(rule.properties?.tags).toEqual(["CWE-89"]);
    expect(rule.fullDescription?.text).toContain("string concatenation");
    // the fetched GitHub support page prefers help.markdown over help.text
    expect(rule.help?.markdown).toContain("string concatenation");
  });

  it("adds the suggested fix to the same guidance", () => {
    const rule = ruleOf(
      resultToSarif(
        resultWith({ explanation: "Untrusted HTML rendered.", fix: "use textContent" }),
      ),
    );
    expect(rule.fullDescription?.text).toContain("Fix: use textContent");
  });

  it("invents nothing when a finding has neither CWE nor explanation", () => {
    const rule = ruleOf(resultToSarif(resultWith({})));
    expect(rule.properties).toBeUndefined();
    expect(rule.helpUri).toBeUndefined();
    expect(rule.fullDescription).toBeUndefined();
    expect(rule.shortDescription?.text).toBe("query built by concatenation");
  });

  it("keeps the result identity untouched while the rule gets richer", () => {
    const sarif = resultToSarif(resultWith({ cwe: "CWE-89" }));
    const result = sarif.runs[0]!.results[0] as {
      partialFingerprints: Record<string, string>;
    };
    expect(Object.keys(result.partialFingerprints)).toEqual(["primaryLocationLineHash"]);
    expect(result.partialFingerprints.primaryLocationLineHash).toMatch(/^[0-9a-f]{16,}$/);
    expect(sarif.runs[0]!.automationDetails.id).toBe("scan-1");
  });
});
