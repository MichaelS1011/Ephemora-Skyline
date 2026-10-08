import { describe, it, expect } from "vitest";
import { getDirLayout } from "../src/city/layout";
import { distanceToSegment } from "../src/city/openWorldStreets";
import { CURB_OFFSET } from "../src/city/sidewalks";
import type { CityData, CityDir, CityFile } from "../src/city/types";

/**
 * A street that ends in the middle of nowhere is not a street: the crowd cannot
 * leave it, the traffic drives off the map, and the picture shows a blank cut in
 * the ground. The empty world is guarded against exactly that
 * (`openCityLife.test.ts`), and this is the same claim for the built city — the
 * district boundary that a focussed level stands inside has to be a closed ring,
 * not an open bracket.
 */

function file(path: string, lines: number): CityFile {
  return {
    id: path,
    name: path.split("/").pop()!,
    path,
    language: "TypeScript",
    linesOfCode: lines,
    cyclomaticComplexity: 5,
    threatLevel: "safe",
    findings: [],
  };
}

function dir(name: string, path: string, files: CityFile[], children: CityDir[] = []): CityDir {
  return {
    name,
    path,
    fileCount: files.length,
    linesOfCode: files.reduce((s, f) => s + f.linesOfCode, 0),
    languages: { TypeScript: 1 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 1,
    topFindings: [],
    children,
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
}

const leaf = (d: string) =>
  dir(
    d,
    d,
    Array.from({ length: 9 }, (_, i) => file(`${d}/m${i}.ts`, 120 + i * 40)),
  );
const src = leaf("src");
src.children = [leaf("components"), leaf("hooks")];
const city = {
  repo: { owner: "acme", name: "app", branch: "main" },
  totalFiles: 90,
  renderedFiles: 90,
  totalLines: 9000,
  findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  languages: { TypeScript: 1 },
  tree: dir(
    "",
    "",
    [],
    [src, leaf("server"), leaf("frontend"), leaf("infra"), leaf("tests"), leaf("docs")],
  ),
  fileConnections: [],
  dirConnections: [],
  meta: {
    churn: false,
    deadCode: false,
    duplicates: false,
    cycles: false,
    coverage: false,
    blame: false,
  },
} as unknown as CityData;

/** Every endpoint of every street has to run into another street. */
function freeEnds(streets: ReturnType<typeof getDirLayout>["streets"]): string[] {
  const bad: string[] = [];
  for (const s of streets) {
    for (const { x, z } of [
      { x: s.x1, z: s.z1 },
      { x: s.x2, z: s.z2 },
    ]) {
      const onward = streets.filter(
        (o) => o !== s && distanceToSegment(x, z, o) < CURB_OFFSET * 0.5,
      );
      if (onward.length === 0) bad.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
  return bad;
}

describe("the built city's roads", () => {
  for (const focus of [[], ["src"], ["src", "hooks"]] as string[][]) {
    it(`leaves no street end free at ${focus.length ? focus.join("/") : "the overview"}`, () => {
      const layout = getDirLayout(city, focus);
      expect(layout.streets.length).toBeGreaterThan(2);
      expect(freeEnds(layout.streets)).toEqual([]);
    });
  }

  it("surrounds a focussed district with a closed boundary, not an open bracket", () => {
    const layout = getDirLayout(city, ["src"]);
    // four corners, each shared by exactly the two edges that meet there
    const corners = new Map<string, number>();
    for (const s of layout.streets) {
      for (const { x, z } of [
        { x: s.x1, z: s.z1 },
        { x: s.x2, z: s.z2 },
      ]) {
        const k = `${x.toFixed(0)},${z.toFixed(0)}`;
        corners.set(k, (corners.get(k) ?? 0) + 1);
      }
    }
    const joined = [...corners.values()].filter((n) => n > 1).length;
    expect(joined).toBeGreaterThanOrEqual(4);
  });
});
