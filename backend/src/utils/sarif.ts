import type { AnalysisResult } from "../models/index.js";
import { APP_VERSION } from "../version.js";
import { findingFingerprint } from "../services/security/finding-identity.js";

export function resultToSarif(result: AnalysisResult) {
  const rulesMap = new Map<
    string,
    {
      name: string;
      desc: string;
      explanation?: string;
      fix?: string;
      cwe?: string;
      refUrl?: string;
    }
  >();
  for (const f of result.files) {
    for (const v of f.vulnerabilities) {
      const ruleId = (v as unknown as { ruleId?: string }).ruleId ?? v.type;
      if (rulesMap.has(ruleId)) continue;
      rulesMap.set(ruleId, {
        name: v.type,
        desc: v.message,
        explanation: v.explanation,
        fix: v.fix,
        cwe: v.cwe,
        refUrl: v.refUrl,
      });
    }
  }
  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        // Which scan this report came out of. Without it a SARIF file is a
        // pile of findings with no stated provenance.
        automationDetails: { id: result.id },
        tool: {
          driver: {
            name: "Ephemora Skyline",
            version: APP_VERSION,
            informationUri: "https://github.com/MichaelS1011/Ephemora-Skyline",
            rules: [...rulesMap.entries()].map(([id, r]) => {
              // What the panel shows is what the file must carry, or the export
              // is the thinner of the two views. The reference GitHub fetched
              // today (docs.github.com, "SARIF support for code scanning",
              // 2026-10-05) names `properties.tags[]` as where metadata goes and
              // prefers `help.markdown` over `help.text`; it names no CWE tag
              // spelling, so the CWE is written as itself plus a plain property.
              const guidance = [r.explanation, r.fix ? `Fix: ${r.fix}` : null]
                .filter(Boolean)
                .join("\n\n");
              return {
                id,
                name: r.name,
                shortDescription: { text: r.desc },
                ...(guidance ? { fullDescription: { text: guidance } } : {}),
                ...(r.cwe ? { properties: { cwe: r.cwe, tags: [r.cwe] } } : {}),
                ...(r.refUrl ? { helpUri: r.refUrl } : {}),
                ...(guidance
                  ? { help: { text: guidance, markdown: guidance } }
                  : { help: { text: r.desc } }),
              };
            }),
          },
        },
        results: result.files.flatMap((f) =>
          f.vulnerabilities.map((v) => ({
            ruleId: (v as unknown as { ruleId?: string }).ruleId ?? v.type,
            // Same value the panel and the city JSON call this finding —
            // minted once in finding-identity.ts, never re-derived here.
            partialFingerprints: {
              primaryLocationLineHash: findingFingerprint({
                path: f.path,
                type: v.type,
                ruleId: (v as unknown as { ruleId?: string }).ruleId,
                line: v.line,
                code: v.code,
                provenance: v.provenance,
                historyCommit: v.historyCommit,
              }),
            },
            level: v.severity === "P0" ? "error" : v.severity === "P1" ? "warning" : "note",
            message: { text: `${v.type}: ${v.message}` },
            locations:
              v.provenance === "gitleaks-history"
                ? []
                : [
                    {
                      physicalLocation: {
                        artifactLocation: { uri: f.path },
                        region: { startLine: v.line, snippet: { text: v.code } },
                      },
                    },
                  ],
            properties: {
              severity: v.severity,
              score: v.score,
              historyCommit: v.historyCommit,
              historicalPath: v.provenance === "gitleaks-history" ? f.path : undefined,
              historicalLine: v.provenance === "gitleaks-history" ? v.line : undefined,
              sourceSeverity: v.sourceSeverity,
              packageName: v.packageName,
              packageVersion: v.packageVersion,
              provenance: (v as unknown as { provenance?: string }).provenance,
            },
          })),
        ),
      },
    ],
  };
}
