import { describe, it, expect } from "vitest";
import { getDemoResult } from "../src/server/routes/demo.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { emptyDroppedFiles, sumDroppedFiles } from "../src/services/analyzer/orchestrator.js";
import { sanitizeDropped } from "../src/server/routes/local-analyze.js";
import type { DroppedFiles } from "../src/models/index.js";
import type { CityDir, CityFile } from "../src/utils/cityMapper.js";

/**
 * BELEG-02 — what the sample city actually holds, and how a folder admits which
 * files it did not read.
 *
 * Claim source: README.md (the caption rows and the honesty bullets) and
 * CHANGELOG.md (the measurements it quotes for the sample city). Data source:
 * the demo payload the `/api/demo` route serves and the city payload
 * `cityMapper` builds from it — plus the drop accounting the pipeline writes.
 * Nothing here reads a sentence out of the document it is checking.
 */

const demo = getDemoResult();
const city = mapResultToCityData(demo);

const allFindings = demo.files.flatMap((f) =>
  f.vulnerabilities.map((v) => ({ ...v, file: f.path })),
);
const districts: CityDir[] = [];
const walkTree = (node: CityDir): void => {
  for (const child of node.children) {
    districts.push(child);
    walkTree(child);
  }
};
walkTree(city.tree);

describe("the caption over the built city (README.md:168)", () => {
  it("ships 74 sample files", () => {
    expect(demo.summary.totalFiles).toBe(74);
    expect(demo.files).toHaveLength(74);
    expect(city.totalFiles).toBe(74);
    expect(city.renderedFiles).toBe(74);
  });

  it("raises six districts over them", () => {
    // README.md:166 "74 sample files in six districts"; the summary says the same
    expect(demo.summary.totalDirectories).toBe(6);
    expect(city.tree.children).toHaveLength(6);
  });

  it("draws one tower per top-level folder at the overview", () => {
    expect(city.tree.children.map((d) => d.name)).toEqual([
      "frontend",
      "backend",
      "mobile",
      "scripts",
      "docs",
      "infrastructure",
    ]);
  });

  it("draws the riskiest file as the critical one, and it is the tallest too", () => {
    // README.md:22 and :158 "the riskiest file as a landmark tower with a red beam";
    // README.md:30-31 say what the two channels carry: height = complexity,
    // beacon = findings weighted by risk.
    const drawn: CityFile[] = [];
    const collect = (node: CityDir): void => {
      drawn.push(...node.detailFiles);
      node.children.forEach(collect);
    };
    collect(city.tree);
    expect(drawn).toHaveLength(74);

    const critical = drawn.filter((f) => f.threatLevel === "critical");
    expect(critical.map((f) => f.path).sort()).toEqual([
      "backend/src/services/auth-service.ts",
      "backend/src/services/clone-manager.ts",
      "backend/src/services/database.ts",
    ]);
    const riskiest = drawn.find((f) => f.path === "backend/src/services/auth-service.ts")!;
    expect(riskiest.findings).toHaveLength(2);
    expect(riskiest.cyclomaticComplexity).toBe(demo.summary.maxCyclomatic);
    // every file with a P0 finding is one the city marks as critical
    for (const file of demo.files) {
      if (file.vulnerabilities.some((v) => v.severity === "P0")) {
        expect(
          drawn.find((f) => f.path === file.path)!.threatLevel,
          `${file.path} holds a P0 but is not marked critical`,
        ).toBe("critical");
      }
    }
  });

  it("names its own alarm count: one of six plots carries a critical finding", () => {
    // README.md:166 quotes the map's sentence "▲ 1 of 6 plots carries a critical finding"
    const withCritical = city.tree.children.filter((d) => d.findingsBySeverity.P0 > 0);
    expect(withCritical).toHaveLength(1);
    expect(withCritical[0]!.name).toBe("backend");
    expect(city.tree.children).toHaveLength(6);
  });
});

describe("the finding cards the captions describe (README.md:168, CHANGELOG.md)", () => {
  it("shows eight findings in seven files", () => {
    expect(allFindings).toHaveLength(8);
    expect(new Set(allFindings.map((f) => f.file)).size).toBe(7);
    expect(demo.summary.totalVulnerabilities).toBe(8);
  });

  it("puts the secret the README names on the line it names", () => {
    const card = allFindings.find((f) => f.type === "HARDCODED_SECRET")!;
    expect(card.file).toBe("backend/src/services/auth-service.ts");
    expect(card.line).toBe(23);
    expect(card.cwe).toBe("CWE-798");
    expect(card.category).toBe("secrets");
    expect(card.severity).toBe("P0");
  });

  it("carries a CWE and a category on every one of the seven (CHANGELOG.md:116)", () => {
    for (const finding of allFindings) {
      expect(finding.cwe, `${finding.type} has no CWE`).toBeTruthy();
      expect(finding.category, `${finding.type} has no category`).toBeTruthy();
    }
    expect(new Set(allFindings.map((f) => f.category))).toEqual(
      new Set(["injection", "secrets", "exposure", "hygiene"]),
    );
  });

  it("attributes the city to the demo and says which engines did not run", () => {
    const provenance = demo.summary.scanProvenance!;
    for (const [engine, ran] of Object.entries(provenance)) {
      expect(ran, `the demo claims ${engine} ran`).toBe(false);
    }
    // README.md:35 "The demo uses sample files and findings; no scanner ran on that city."
    expect(city.unverifiedEngines.length).toBeGreaterThan(0);
  });
});

describe("the district badge's three states, measured on the sample city (CHANGELOG.md:110-113)", () => {
  it("holds seventeen districts below the six top-level ones", () => {
    expect(districts).toHaveLength(17);
  });

  it("names nine of them unproven ground rather than green", () => {
    // CHANGELOG.md:113 "Measured on the sample city: 9 of 17 districts."
    // The rule the badge follows: no finding of any severity, and files the
    // switched-off engines never looked at.
    const unproven = districts.filter(
      (d) =>
        d.findingsBySeverity.P0 === 0 &&
        d.findingsBySeverity.P1 === 0 &&
        d.findingsBySeverity.P2 === 0 &&
        d.unverifiedFiles > 0,
    );
    expect(unproven).toHaveLength(9);
    // and none of the nine is announced as finding-free
    for (const d of unproven) expect(d.unverifiedFiles).toBeGreaterThan(0);
  });

  it("still calls a district with only a medium finding a district with a finding", () => {
    // the state the badge used to miss: frontend/src/stores holds one P2
    const stores = districts.find((d) => d.path === "frontend/src/stores")!;
    expect(stores.findingsBySeverity.P2).toBe(1);
    expect(stores.findingsBySeverity.P0).toBe(0);
  });
});

describe("the eight reasons a file gives for not joining a scan (README.md:43)", () => {
  const documented = [
    "pathTooLong",
    "unsafePath",
    "tooLarge",
    "unreadable",
    "excluded",
    "gitIgnored",
    "gitBudget",
    "unsupportedFormat",
  ] as const;

  it("counts exactly eight reasons, the eight the README lists", () => {
    expect(Object.keys(emptyDroppedFiles()).sort()).toEqual([...documented].sort());
  });

  it("starts every one of them at zero, so an absent reason reads as none", () => {
    for (const reason of documented) expect(emptyDroppedFiles()[reason]).toBe(0);
  });

  it("adds the reasons up into the one number the strip shows", () => {
    const browser: DroppedFiles = { ...emptyDroppedFiles(), pathTooLong: 2, unsupportedFormat: 9 };
    const server: DroppedFiles = { ...emptyDroppedFiles(), tooLarge: 1, excluded: 20 };
    const total = sumDroppedFiles(browser, server);
    expect(total).toEqual({
      ...emptyDroppedFiles(),
      pathTooLong: 2,
      unsupportedFormat: 9,
      tooLarge: 1,
      excluded: 20,
    });
    const unread = Object.values(total).reduce((a, b) => a + b, 0);
    expect(unread).toBe(32);
  });

  it("refuses a count it cannot read instead of inventing one", () => {
    // README.md:44 promises the numbers arrive together and reconstructable:
    // a garbage field must not become a number the UI quotes.
    expect(sanitizeDropped({ pathTooLong: 7, tooLarge: -3, unsupportedFormat: "nine" })).toEqual({
      ...emptyDroppedFiles(),
      pathTooLong: 7,
    });
  });
});
