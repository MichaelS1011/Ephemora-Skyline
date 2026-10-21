// The one rule that makes a live result honest: a delta was read by built-in
// rules only, so zero findings is not a clean sweep and a re-read file must not
// name an external engine that only saw the full scan.
import { describe, expect, it } from "vitest";
import { coverageLine, scanVerdict } from "../src/city/provenance";
import { provenance } from "./helpers/cityFixture";

const live = {
  at: "2026-10-20T10:00:00.000Z",
  fullScanAt: "2026-10-20T09:00:00.000Z",
  changed: 1,
  added: 0,
  removed: 0,
  refreshed: 1,
  stale: ["semgrep", "gitleaks"],
};

describe("live provenance", () => {
  it("never reads as a clean sweep after a delta", () => {
    expect(scanVerdict(provenance({ live }), 0, { TypeScript: 100 })).toEqual({
      kind: "live",
      stale: ["semgrep", "gitleaks"],
    });
    // Findings still outrank the stale note; the band carries it beside them.
    expect(scanVerdict(provenance({ live }), 1, {})).toEqual({ kind: "findings" });
  });

  it("a file the delta re-read says built-in rules only", () => {
    const line = coverageLine(
      { language: "TypeScript", path: "src/a.ts", liveRefreshed: true },
      provenance(),
      "en",
    );
    expect(line?.kind).toBe("no-scanner");
    expect(line?.text).toContain("built-in rules only");
  });
});
