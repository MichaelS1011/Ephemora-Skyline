// @vitest-environment jsdom
/**
 * "What changed since I was last here" — the browser's half of it.
 *
 * The server compares two scans it still holds; this module decides WHICH two.
 * The decision is the part that can be wrong in a way nobody notices: compare
 * against the wrong earlier scan and every number is plausible and false. So
 * the tests are about the anchor, not about the report — same folder shape,
 * newest earlier scan, one anchor per shape, and a visit of the same scan that
 * does not lose its anchor.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { anchorFor, folderShape, verifyAnchorScannedAt } from "../src/verify";
import type { CityData, CityDir } from "../src/city/types";

function dir(path: string, children: CityDir[] = [], files: string[] = []): CityDir {
  return {
    name: path.split("/").pop() ?? path,
    path,
    fileCount: files.length,
    linesOfCode: 10 * files.length,
    languages: { TypeScript: 10 * files.length },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    detailFiles: files.map((p, i) => ({
      id: `f${i}`,
      name: p.split("/").pop() ?? p,
      path: p,
      language: "TypeScript",
      linesOfCode: 10,
      cyclomaticComplexity: 1,
      threatLevel: "safe",
      findings: [],
    })),
    children,
  } as unknown as CityDir;
}

function city(id: string, tree: CityDir): CityData {
  return {
    analysisId: id,
    projectName: "p",
    rootPath: "",
    totalFiles: 1,
    totalLines: 10,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    tree,
    districts: [],
  } as unknown as CityData;
}

const repoA = city(
  "scan-1",
  dir("root", [dir("src", [], ["src/a.ts", "src/b.ts"])], ["README.md"]),
);
const repoB = city(
  "scan-2",
  dir("root", [dir("src", [], ["src/a.ts", "src/b.ts", "src/c.ts"])], ["README.md"]),
);

describe("the anchor keeps what 'last scan' means", () => {
  beforeEach(() => window.localStorage.clear());

  it("carries the scan's own time, so 'the last scan' can be dated", () => {
    // The anchor held only the moment this BROWSER showed the scan. A week
    // later the card would say "since your last scan" and mean "since you
    // looked", which are not the same day when a scan ran overnight in CI.
    const scanned = city("scan-1", repoA.tree);
    (scanned as unknown as { createdAt: string }).createdAt = "2026-10-11T07:30:00.000Z";
    const anchor = anchorFor(scanned);
    expect(anchor?.scannedAt, "the scan's own timestamp travels with it").toBe(
      "2026-10-11T07:30:00.000Z",
    );
  });

  it("keeps the earlier scan's time after that record is replaced", () => {
    // "Since the scan of 11 Oct" dates the EARLIER scan, and the anchor keeps
    // one record per folder — so the earlier one is gone from the anchor by the
    // time the comparison runs. Measured: the heading fell back to "the
    // earlier scan" even though both payloads carried their times.
    const first = city("scan-1", repoA.tree);
    (first as unknown as { createdAt: string }).createdAt = "2026-10-11T07:30:00.000Z";
    anchorFor(first);
    const second = city("scan-2", repoA.tree);
    (second as unknown as { createdAt: string }).createdAt = "2026-10-18T07:30:00.000Z";
    const anchor = anchorFor(second);
    expect(anchor?.previousId).toBe("scan-1");
    expect(verifyAnchorScannedAt("scan-1")).toBe("2026-10-11T07:30:00.000Z");
  });

  it("survives a reload without inventing a date", () => {
    // A payload from an older build has no createdAt: the anchor must then say
    // nothing about when, rather than borrow the browser's clock.
    const anchor = anchorFor(repoA);
    expect(anchor?.scannedAt).toBeUndefined();
  });
});

describe("the comparison anchor", () => {
  beforeEach(() => window.localStorage.clear());

  it("has no earlier scan the first time a folder is seen — and records the visit", () => {
    const first = anchorFor(repoA);
    expect(first?.previousId).toBeNull();
    // the version of this line that only asked for null passed even when
    // nothing was written at all; the record is what makes the next visit work
    expect(first?.scanId).toBe("scan-1");
    expect(
      JSON.parse(window.localStorage.getItem("codecity-verify-anchor:v1") ?? "[]"),
    ).toHaveLength(1);
    expect(anchorFor(repoB)?.previousId).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem("codecity-verify-anchor:v1") ?? "[]"),
    ).toHaveLength(2);
  });

  it("points at the newest earlier scan of the same folder shape", () => {
    anchorFor(repoA);
    const second = anchorFor(city("scan-3", repoA.tree));
    // scan-3 is the second visit of the same shape; scan-1 is its anchor
    expect(second?.previousId).toBe("scan-1");
    const third = anchorFor(city("scan-4", repoA.tree));
    expect(third?.previousId, "the newest earlier scan, not the oldest").toBe("scan-3");
  });

  it("does not tie two different folders together", () => {
    anchorFor(repoA);
    expect(anchorFor(repoB)?.previousId).toBeNull();
  });

  it("keeps the anchor when the same scan is opened again", () => {
    anchorFor(repoA);
    const again = anchorFor(repoA);
    expect(again?.previousId).toBeNull();
    expect(again?.shape).toBe(folderShape(repoA));
  });

  it("survives an edit: the shape is paths, not lines or values", () => {
    expect(folderShape(repoA)).toBe(folderShape(city("scan-x", repoA.tree)));
  });

  it("is blind to order and duplicates in the tree", () => {
    const shuffled = city(
      "scan-y",
      dir("root", [dir("src", [], ["src/b.ts", "src/a.ts", "src/a.ts"])], ["README.md"]),
    );
    expect(folderShape(shuffled)).toBe(folderShape(repoA));
  });

  it("does not leak a path into the shape", () => {
    expect(folderShape(repoA)).toMatch(/^\d+:[0-9a-f]{8}$/);
    expect(folderShape(repoA)).not.toMatch(/root|src|\//);
  });
});
