import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  classifyCandidate,
  hasAnalyzableCandidate,
  isSourceShaped,
  noSourceTooLargeLine,
  onlyTooLarge,
  type FolderPlan,
} from "../src/hooks/useLocalAnalysis";
import { readFileSync } from "fs";
import path from "path";

/**
 * Item C of the claims lane (2026-10-14): the per-file wall was two numbers —
 * the browser capped at 1.5 MB while README and GETTING_STARTED promised 2 MB
 * and the backend route accepted 2 MB. A 1.7 MB file in a scanned folder was
 * refused although two documents said it would be read. The decision taken:
 * align the browser to the documented, backend-accepted 2 MB. This test walks
 * the user-visible case through the real classifier — no app run needed — and
 * `backend/tests/public-surface-claims.test.ts` pins the two constants and the
 * sentences to each other so neither side can move alone again.
 */

const emptyPlan = (): FolderPlan => ({
  candidates: [],
  found: 0,
  bytes: 0,
  dropped: {
    pathTooLong: 0,
    unsafePath: 0,
    tooLarge: 0,
    unreadable: 0,
    excluded: 0,
    gitIgnored: 0,
    gitBudget: 0,
    unsupportedFormat: 0,
  },
  overCap: false,
  setAside: new Set<string>(),
});

const file = (name: string, bytes: number): File =>
  new File([new Uint8Array(bytes)], name, { lastModified: 0 });

describe("the picker's per-file wall is the one the docs sell", () => {
  it("is 2 MB, the number the backend route and both documents carry", () => {
    expect(MAX_FILE_BYTES).toBe(2 * 1024 * 1024);
    const route = readFileSync(
      path.resolve(import.meta.dirname, "../../backend/src/server/routes/local-analyze.ts"),
      "utf-8",
    );
    const shared = /const MAX_FILE_BYTES = ([^;]+);/.exec(route);
    expect(shared, "the route no longer declares its per-file wall").not.toBeNull();
    const product = (shared?.[1] ?? "")
      .split("*")
      .reduce((acc, factor) => acc * Number(factor.trim()), 1);
    expect(product, "browser and route must share one per-file wall").toBe(MAX_FILE_BYTES);
  });

  it("counts a 1.7 MB file as read — the case the old 1.5 MB cap refused", () => {
    expect(isSourceShaped("src/big-file.ts")).toBe(true);
    const plan = emptyPlan();
    classifyCandidate("src/big-file.ts", file("big-file.ts", 1_782_579), [], plan, null);
    expect(plan.dropped.tooLarge, "1.7 MB must not fall into the too-large bucket").toBe(0);
    expect(plan.found, "1.7 MB joins the read").toBe(1);
    expect(plan.candidates.map((c) => c.rel)).toEqual(["src/big-file.ts"]);
    expect(plan.bytes).toBe(1_782_579);
  });

  it("still refuses a file past 2 MB, and counts it", () => {
    const plan = emptyPlan();
    classifyCandidate("src/oversize.ts", file("oversize.ts", 2 * 1024 * 1024 + 1), [], plan, null);
    expect(plan.found).toBe(0);
    expect(plan.dropped.tooLarge, "an oversized file is a number, never a silence").toBe(1);
    expect(plan.candidates).toHaveLength(0);
  });

  it("still counts the file exactly at the wall as read", () => {
    const plan = emptyPlan();
    classifyCandidate("src/at-wall.ts", file("at-wall.ts", 2 * 1024 * 1024), [], plan, null);
    expect(plan.found).toBe(1);
    expect(plan.dropped.tooLarge).toBe(0);
  });

  /**
   * edge-state 1c: a folder whose only source file is over the wall used to read
   * "no analyzable source files" — the file existed, it was only too large. The
   * honest sentence names the count, and only fires when the size wall is the
   * sole reason nothing was read.
   */
  it("says one oversized file is the size wall, not an empty folder", () => {
    const plan = emptyPlan();
    classifyCandidate("src/oversize.ts", file("oversize.ts", 2 * 1024 * 1024 + 1), [], plan, null);
    expect(onlyTooLarge(plan.dropped)).toBe(true);
    expect(noSourceTooLargeLine("de", plan.dropped.tooLarge)).toContain("1 Datei");
    expect(noSourceTooLargeLine("de", plan.dropped.tooLarge)).toContain("2-MB-Grenze");
    expect(noSourceTooLargeLine("en", plan.dropped.tooLarge)).toContain("1 file");
    expect(noSourceTooLargeLine("en", plan.dropped.tooLarge)).toContain("2 MB per-file limit");
  });

  it("names several oversized files with the plural", () => {
    expect(noSourceTooLargeLine("en", 3)).toContain("3 files");
    expect(noSourceTooLargeLine("de", 3)).toContain("3 Dateien");
  });

  it("keeps the generic sentence when another drop reason joined the size wall", () => {
    const plan = emptyPlan();
    plan.dropped.tooLarge = 1;
    plan.dropped.unsupportedFormat = 2;
    expect(onlyTooLarge(plan.dropped)).toBe(false);
    const allZero = { ...plan.dropped, unsupportedFormat: 0 };
    expect(onlyTooLarge(allZero)).toBe(true);
  });
});

/**
 * UX 2026-10-21: a docs-only folder (README.md + notes.txt) was staged for the
 * test runner, uploaded, and only then failed on the server. The same files are
 * still allowed to travel when code travels with them; they just cannot carry
 * the scan on their own.
 */
describe("the upload gate asks whether the scan can build anything", () => {
  const planFor = (paths: string[]): FolderPlan => {
    const plan = emptyPlan();
    for (const rel of paths)
      classifyCandidate(rel, file(rel.split("/").pop()!, 12), [], plan, null);
    return plan;
  };

  it("does not send a folder of docs and fixtures alone", () => {
    const plan = planFor(["README.md", "notes.txt"]);
    expect(plan.candidates, "test support still stages").toHaveLength(2);
    expect(hasAnalyzableCandidate(plan)).toBe(false);
  });

  it("does not count .git internals as analyzable", () => {
    expect(hasAnalyzableCandidate(planFor([".git/HEAD"]))).toBe(false);
  });

  it("sends docs when one source file rides along", () => {
    expect(hasAnalyzableCandidate(planFor(["README.md", "src/mod.ts"]))).toBe(true);
  });

  it("accepts a dotenv file, the one extensionless thing the server reads", () => {
    expect(hasAnalyzableCandidate(planFor([".env.production"]))).toBe(true);
  });
});
