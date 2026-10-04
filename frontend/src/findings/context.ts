import type { CityFinding, ReviewStatus } from "../city/types";

/** A portable evidence handoff. JSON is data, not an instruction to apply a fix. */
export function findingContext(
  finding: CityFinding,
  path: string,
  analysisId: string | null,
  findingId: string,
  review: ReviewStatus | null,
): string {
  return JSON.stringify(
    {
      schema: "ephemora.finding.v1",
      analysisId,
      findingId,
      path,
      sourceContext:
        finding.historyCommit || finding.provenance === "gitleaks-history"
          ? { kind: "git-history", commit: finding.historyCommit ?? null }
          : { kind: "analyzed-snapshot" },
      review,
      assessment: "Scanner finding requiring verification; not a confirmed vulnerability.",
      finding,
    },
    null,
    2,
  );
}
