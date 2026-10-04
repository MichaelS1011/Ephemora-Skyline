import { expect, it } from "vitest";
import { findingContext } from "../src/findings/context";
import type { CityFinding } from "../src/city/types";
const finding: CityFinding = {
  type: "HARDCODED_SECRET",
  severity: "P0",
  line: 77,
  message: "Potential secret",
  provenance: "gitleaks-history",
  historyCommit: "abc123",
};
it("keeps scan, finding and historical revision identity in an agent handoff", () => {
  const context = JSON.parse(
    findingContext(finding, "src/demo.ts", "scan-1", "file#0", "false-positive"),
  );
  expect(context.sourceContext).toEqual({ kind: "git-history", commit: "abc123" });
  expect(context.analysisId).toBe("scan-1");
  expect(context.review).toBe("false-positive");
  expect(context.finding).toEqual(finding);
  expect(context.assessment).toContain("not a confirmed vulnerability");
});
it("does not invent a working-tree revision for ordinary findings", () => {
  const context = JSON.parse(
    findingContext(
      { ...finding, provenance: "regex", historyCommit: undefined },
      "src/a.ts",
      "scan-2",
      "file#1",
      null,
    ),
  );
  expect(context.sourceContext).toEqual({ kind: "analyzed-snapshot" });
});
