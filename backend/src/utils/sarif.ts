import type { AnalysisResult } from "../models/index.js";
import { APP_VERSION } from "../version.js";

export function resultToSarif(result: AnalysisResult) {
  const rulesMap = new Map<string, { name: string; desc: string }>();
  for (const f of result.files) {
    for (const v of f.vulnerabilities) {
      const ruleId = (v as unknown as { ruleId?: string }).ruleId ?? v.type;
      if (!rulesMap.has(ruleId)) rulesMap.set(ruleId, { name: v.type, desc: v.message });
    }
  }
  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Ephemora Skyline",
            version: APP_VERSION,
            informationUri: "https://github.com/MichaelS1011/Ephemora-Skyline",
            rules: [...rulesMap.entries()].map(([id, r]) => ({
              id,
              name: r.name,
              shortDescription: { text: r.desc },
              help: { text: r.desc },
            })),
          },
        },
        results: result.files.flatMap((f) =>
          f.vulnerabilities.map((v) => ({
            ruleId: (v as unknown as { ruleId?: string }).ruleId ?? v.type,
            level: v.severity === "P0" ? "error" : v.severity === "P1" ? "warning" : "note",
            message: { text: `${v.type}: ${v.message}` },
            locations: [
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
              provenance: (v as unknown as { provenance?: string }).provenance,
            },
          })),
        ),
      },
    ],
  };
}
