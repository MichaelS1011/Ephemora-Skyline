/**
 * The city fixture builder, under test.
 *
 * ONE new test file, and it moves published numbers: the test-file count in
 * `README.md` and the same line in `CONTRIBUTING.md` (both walked out of the
 * tree by `backend/tests/public-surface-claims.test.ts`), plus the dated case
 * total in the README. Pulling those numbers is another lane's job — nothing
 * here touches documentation.
 *
 * What is pinned is the builder's own honesty: that it counts what it claims,
 * that an override changes one field and not the neighbourhood around it, and
 * that a payload with nothing optional in it is still a payload the app can
 * read. A builder that quietly invents a number would be worse than the 17
 * hand-built copies it replaces, because the wrongness would sit in one place
 * instead of many.
 */
import { describe, expect, it } from "vitest";
import {
  city,
  countBySeverity,
  dir,
  emptySeverityCounts,
  file,
  finding,
  provenance,
  subtreeFiles,
  threatLevelOf,
  threatScoreOf,
} from "./cityFixture";
import {
  isUncheckedClean,
  missingEnginesForFile,
  scanVerdict,
  uncheckedFileCount,
} from "../../src/city/provenance";
import { allFiles, districtDraw, tourStops } from "../../src/city/layout";
import type { CityData, CityFinding } from "../../src/city/types";

/** Read one field of a payload without asserting its type away. */
const at = (o: object, key: string): unknown => (o as Record<string, unknown>)[key];

/** The keys a built object actually carries — `undefined` must never be one. */
const keys = (o: object): string[] => Object.keys(o).sort();

/**
 * Every field of `a` that `b` also has, except the ones the caller meant to
 * change. Returns the names that moved anyway — the empty list is the claim.
 */
function unchanged(a: object, b: object, changed: string[]): string[] {
  return keys(a)
    .filter((k) => !changed.includes(k))
    .filter((k) => JSON.stringify(at(a, k)) !== JSON.stringify(at(b, k)));
}

const p0 = (): CityFinding => finding({ severity: "P0", line: 3 });
const p1 = (): CityFinding => finding({ severity: "P1", line: 4 });
const p2 = (): CityFinding => finding({ severity: "P2", line: 5 });

describe("der Builder zählt, was er behauptet", () => {
  it("zählt die Severity aus den Dateien der Stadt", () => {
    const buildings = [
      file("src/a.ts", "TypeScript", [p0(), p0(), p1()]),
      file("src/b.ts", "TypeScript", [p2(), p2(), p2()]),
      file("src/c.ts", "TypeScript"),
    ];
    const c = city({ files: buildings });
    expect(c.findingsBySeverity).toEqual({ P0: 2, P1: 1, P2: 3 });
    expect(c.findingsBySeverity).toEqual(countBySeverity(buildings.flatMap((f) => f.findings)));
    // the city and its root district never say two different things
    expect(c.tree.findingsBySeverity).toEqual(c.findingsBySeverity);
    expect(c.tree.detailFiles).toHaveLength(3);
    expect(c.totalFiles).toBe(3);
    expect(c.renderedFiles).toBe(3);
    expect(c.totalLines).toBe(120);
    expect(c.languages).toEqual({ TypeScript: 120 });
    expect(Object.values(c.meta)).toEqual([false, false, false, false, false, false]);
    expect(c.fileConnections).toEqual([]);
    expect(c.dirConnections).toEqual([]);
    expect(c.repo).toEqual({ owner: "local", name: "probe", branch: "main" });
  });

  it("gewichtet den Risiko-Score nach der veröffentlichten Formel", () => {
    // P0×10 + P1×7 + P2×3 — the numbers `cityMapper.ts` writes and the type
    // comment promises, so one score means the same in the tree and on the card.
    const findings = [p0(), p0(), p1(), p2(), p2(), p2()];
    expect(threatScoreOf(findings)).toBe(20 + 7 + 9);
    const shipped = file("src/hot.ts", "TypeScript", findings);
    expect(dir({ path: "src", detailFiles: [shipped] }).threatScore).toBe(36);
    expect(city({ files: [shipped] }).tree.threatScore).toBe(36);
    expect(threatScoreOf([])).toBe(0);
  });

  it("hält Funde in Testcode aus dem Score der shipped Dateien draußen", () => {
    const shipped = file("src/a.ts", "TypeScript", [p0()]);
    const fixture = file("tests/a.test.ts", "TypeScript", [p0(), p1()], undefined, {
      role: "test",
    });
    const d = dir({ path: "", detailFiles: [shipped, fixture] });
    expect(d.threatScore).toBe(10);
    expect(d.testThreatScore).toBe(17);
    expect(d.testFiles).toBe(1);
    expect(d.findingsInTests).toBe(2);
    expect(d.findingsBySeverity).toEqual({ P0: 2, P1: 1, P2: 0 });
    // the city mirrors its root instead of counting it a second way
    const c = city({ tree: d });
    expect(c.findingsInTests).toBe(2);
    expect(c.testFiles).toBe(1);
    expect(c.findingsBySeverity).toEqual(d.findingsBySeverity);
  });

  it("rechnet einen Datenkatalog aus den Codezeilen heraus", () => {
    const code = file("src/a.ts", "TypeScript");
    const catalogue = file("messages/de.json", "JSON", [], undefined, { role: "data" });
    const d = dir({ path: "i18n", detailFiles: [code, catalogue] });
    expect(d.linesOfCode).toBe(80);
    expect(d.codeLines).toBe(40);
    expect(d.dataLines).toBe(40);
    expect(d.languages).toEqual({ TypeScript: 40 });
    expect(d.dataLanguages).toEqual({ JSON: 40 });
    // where no data file exists the split was never measured, so say nothing
    const noData = dir({ path: "src", detailFiles: [code] });
    expect("codeLines" in noData).toBe(false);
    expect("dataLines" in noData).toBe(false);
    expect("dataLanguages" in noData).toBe(false);
    expect(city({ tree: noData }).codeLines).toBeUndefined();
  });

  it("rechnet die Bezirke unter einem Ordner zusammen", () => {
    const src = dir({ path: "src", detailFiles: [file("src/a.ts", "TypeScript", [p1()])] });
    const tests = dir({
      path: "tests",
      detailFiles: [file("tests/b.ts", "TypeScript", [p2()])],
    });
    const root = dir({ path: "", name: "probe", children: [src, tests] });
    expect(root.fileCount).toBe(2);
    expect(root.linesOfCode).toBe(80);
    expect(root.languages).toEqual({ TypeScript: 80 });
    expect(root.findingsBySeverity).toEqual({ P0: 0, P1: 1, P2: 1 });
    expect(root.threatScore).toBe(10);
    // nothing of its own stands in the plaza, so nothing is folded away
    expect(root.remainingFiles).toBe(0);
    expect(subtreeFiles(root).map((f) => f.path)).toEqual(["src/a.ts", "tests/b.ts"]);
    // a folder whose own files do not all fit says how many are missing
    const plaza = dir({
      path: "big",
      fileCount: 60,
      detailFiles: [file("big/a.ts", "TypeScript")],
    });
    expect(plaza.remainingFiles).toBe(59);
    expect(districtDraw(plaza, { skylineTowers: 6, buildingsPerDirectory: 35 }).folded).toBe(59);
  });

  it("zählt die ungeprüften Häuser, nicht die mit Funden", () => {
    const clean = file("src/a.ts", "TypeScript", [], ["gitleaks"]);
    const unchecked = file("src/b.ts", "TypeScript", [], ["gitleaks", "semgrep"]);
    const found = file("src/c.ts", "TypeScript", [p0()], ["gitleaks"]);
    const d = dir({ path: "src", detailFiles: [clean, unchecked, found] });
    // a file that reported something was seen; only the clean-looking ones are
    // unknown ground
    expect(d.unverifiedFiles).toBe(2);
    expect(uncheckedFileCount(d)).toBe(2);
    expect(isUncheckedClean(clean)).toBe(true);
    expect(isUncheckedClean(found)).toBe(false);
    expect(
      uncheckedFileCount(dir({ path: "src", detailFiles: [file("src/a.ts", "TypeScript")] })),
    ).toBe(0);
    expect(city({ tree: d }).unverifiedFiles).toBe(2);
  });

  it("zählt die Kategorien nur, wo der Fund eine trägt", () => {
    const counted = dir({ path: "src", detailFiles: [file("src/a.ts", "TypeScript", [p0()])] });
    // `finding()` names its category, as a gitleaks hit does, so the kinds are
    // counted rather than declared
    expect(counted.findingsByCategory).toEqual({
      injection: 0,
      secrets: 1,
      crypto: 0,
      transport: 0,
      exposure: 0,
      dependencies: 0,
      permissions: 0,
      hygiene: 0,
      unclassified: 0,
    });
    // a finding that says nothing about its kind leaves the district silent:
    // nine zeroes would be a claim the payload never made
    const silent = dir({
      path: "src",
      detailFiles: [file("src/a.ts", "TypeScript", [finding({ category: undefined })])],
    });
    expect("findingsByCategory" in silent).toBe(false);
    expect(silent.findingsBySeverity).toEqual({ P0: 1, P1: 0, P2: 0 });
  });
});

describe("Overrides, die nichts anderes mitnehmen", () => {
  it("setzt ein Override nur sein eigenes Feld", () => {
    const buildings = [file("src/a.ts", "TypeScript", [p0()])];
    const plain = city({ files: buildings });
    const patched = city({
      files: buildings,
      languages: { TypeScript: 1, Shell: 2 },
      repo: { owner: "octo", name: "other", branch: "dev" },
      meta: {
        churn: true,
        deadCode: false,
        duplicates: false,
        cycles: false,
        coverage: false,
        blame: false,
      },
    });
    expect(patched.languages).toEqual({ TypeScript: 1, Shell: 2 });
    expect(patched.repo).toEqual({ owner: "octo", name: "other", branch: "dev" });
    expect(patched.meta.churn).toBe(true);
    expect(unchanged(plain, patched, ["languages", "meta", "repo"])).toEqual([]);
    expect(keys(plain)).toEqual(keys(patched));
    // a declared number is taken over as written, not recounted from the files
    const declared = city({ files: buildings, totalFiles: 92, renderedFiles: 16 });
    expect(declared.totalFiles).toBe(92);
    expect(declared.renderedFiles).toBe(16);
    expect(declared.tree.fileCount).toBe(1);
    expect(unchanged(plain, declared, ["totalFiles", "renderedFiles"])).toEqual([]);
  });

  it("lässt eine Override-Liste die Nachbarn-Defaults unangetastet", () => {
    const plain = file("src/a.ts", "TypeScript");
    const hot = file("src/a.ts", "TypeScript", [p0(), p1()], ["gitleaks"], {
      churnScore: 0.8,
      commitCount: 40,
      role: "test",
    });
    expect(hot.churnScore).toBe(0.8);
    expect(hot.commitCount).toBe(40);
    expect(hot.role).toBe("test");
    expect(hot.unverifiedBy).toEqual(["gitleaks"]);
    expect(hot.threatLevel).toBe("critical");
    expect(
      unchanged(plain, hot, [
        "findings",
        "threatLevel",
        "unverifiedBy",
        "churnScore",
        "commitCount",
        "role",
      ]),
    ).toEqual([]);
    // the defaults a bare file carries, named so a reader knows what they are
    expect(hot.id).toBe("f-src/a.ts");
    expect(hot.name).toBe("a.ts");
    expect(hot.linesOfCode).toBe(40);
    expect(hot.cyclomaticComplexity).toBe(1);
    expect(keys(plain)).toEqual([
      "cyclomaticComplexity",
      "findings",
      "id",
      "language",
      "linesOfCode",
      "name",
      "path",
      "threatLevel",
    ]);
    expect(plain.threatLevel).toBe("safe");
  });

  it("versteht ein geschriebenes undefined als „das Feld fehlt in der Payload“", () => {
    const withCategory = finding();
    const without = finding({ category: undefined });
    expect(withCategory.category).toBe("secrets");
    expect("category" in without).toBe(false);
    expect(without.message).toBe(withCategory.message);
    expect(keys(without)).toEqual(keys(withCategory).filter((k) => k !== "category"));
    // same rule one level up
    const data = file("de.json", "JSON", [], undefined, { role: "data" });
    expect("codeLines" in dir({ path: "x", detailFiles: [data] })).toBe(true);
    expect("codeLines" in dir({ path: "x", detailFiles: [data], codeLines: undefined })).toBe(
      false,
    );
  });

  it("ordnet jede Stufe der schlechtesten Funddatei zu", () => {
    const counts = countBySeverity([p2(), p0(), p2(), p1()]);
    expect(counts).toEqual({ P0: 1, P1: 1, P2: 2 });
    expect(emptySeverityCounts()).toEqual({ P0: 0, P1: 0, P2: 0 });
    expect(threatLevelOf([p0()])).toBe("critical");
    expect(threatLevelOf([p1()])).toBe("high");
    expect(threatLevelOf([p2()])).toBe("medium");
    expect(threatLevelOf([])).toBe("safe");
    // the worst finding decides, not the last one written
    expect(file("src/a.ts", "TypeScript", [p2(), p0()]).threatLevel).toBe("critical");
    expect(file("src/a.ts", "TypeScript", [p1(), p2()]).threatLevel).toBe("high");
  });
});

describe("ein Payload ohne die optionalen Felder bleibt lesbar", () => {
  /** A city carrying nothing beyond what `CityData` requires. */
  const bare = (): CityData => city({ files: [file("src/a.ts", "TypeScript", [p0()])] });

  it("schreibt keine optionale Spur als undefined", () => {
    const c = bare();
    for (const absent of [
      "additionalFiles",
      "analysisId",
      "codeLines",
      "dataLanguages",
      "dataLines",
      "dropped",
      "findingsInData",
      "findingsInTests",
      "limits",
      "scanProvenance",
      "skippedByGitignore",
      "testFiles",
      "unverifiedEngines",
      "unverifiedFiles",
    ]) {
      expect(absent in c, `${absent} is in a payload that never said it`).toBe(false);
    }
    expect(Object.values(c).every((v) => v !== undefined)).toBe(true);
    // and it survives the round trip a report or an export puts it through
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    const f = c.tree.detailFiles[0]!;
    expect(Object.values(f).every((v) => v !== undefined)).toBe(true);
    expect("unverifiedBy" in f).toBe(false);
    expect("role" in f).toBe(false);
  });

  it("lässt die Leser des Programms damit arbeiten, ohne zu raten", () => {
    const c = bare();
    const a = c.tree.detailFiles[0]!;
    // no provenance in the payload: nothing may claim a checked sweep
    expect(scanVerdict(c.scanProvenance, 1, c.languages)).toEqual({ kind: "findings" });
    expect(scanVerdict(c.scanProvenance, 0, c.languages)).toEqual({ kind: "unknown" });
    expect(missingEnginesForFile(a, c.scanProvenance)).toEqual([]);
    expect(isUncheckedClean(a)).toBe(false);
    expect(uncheckedFileCount(c.tree)).toBe(0);
    expect(subtreeFiles(c.tree).map((f) => f.id)).toEqual(["f-src/a.ts"]);
    expect(allFiles(c).map((hit) => hit.file.path)).toEqual(["src/a.ts"]);
    expect(tourStops(c).map((hit) => hit.file.id)).toEqual(["f-src/a.ts"]);
    expect(districtDraw(c.tree, c.limits).totalFiles).toBe(1);
    expect(districtDraw(c.tree, c.limits).drawnHere).toBe(1);
    expect(c.tree.findingsBySeverity.P0).toBe(1);
  });

  it("kennt dependencyRunner, statt es stillschweigend fallen zu lassen", () => {
    // THE field no local builder knew. A payload that names the engine which
    // answered the CVE question has to be able to say so through this builder.
    const legacy = provenance();
    expect("dependencyRunner" in legacy).toBe(false);
    expect("churn" in legacy).toBe(false);
    expect(legacy.regex).toBe(true);
    expect(legacy.gitleaks).toBe(true);
    const named = provenance({ dependencyRunner: "osv", churn: true });
    expect(named.dependencyRunner).toBe("osv");
    expect(named.churn).toBe(true);
    expect(JSON.parse(JSON.stringify(named))).toEqual(named);
    const refused = provenance({ dependencyRunner: null, gitleaks: false });
    expect(refused.dependencyRunner).toBeNull();
    expect(refused.gitleaks).toBe(false);
    const oneBuilding = [file("src/a.ts", "TypeScript", [p1()])];
    const without = city({ files: oneBuilding });
    const c = city({ files: oneBuilding, scanProvenance: named });
    expect(c.scanProvenance?.dependencyRunner).toBe("osv");
    // naming the runner is the one thing that changes about the payload
    expect(keys(c)).toEqual([...keys(without), "scanProvenance"].sort());
    expect(unchanged(without, c, ["scanProvenance"])).toEqual([]);
  });
});
