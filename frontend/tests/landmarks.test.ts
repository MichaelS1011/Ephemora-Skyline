import { describe, expect, it } from "vitest";
import {
  detectRoleLandmarks,
  roleLandmarkRoof,
  ROLE_LANDMARK_KINDS,
  type RoleLandmarkKind,
} from "../src/city/landmarks";
import type { CityData, CityDir, CityFile, FileRole } from "../src/city/types";

/**
 * Role landmarks are read off the scan payload, never guessed: a kind appears
 * only when a real path or role matches, and the returned `basis` is the exact
 * rule that fired. The risk landmark (`landmarkFileId`) is a separate axis and
 * must not be touched here.
 */

function file(path: string, role?: FileRole): CityFile {
  return {
    id: path,
    name: path.split("/").pop()!,
    path,
    language: path.endsWith(".md") ? "Markdown" : "TypeScript",
    role,
    linesOfCode: 10,
    cyclomaticComplexity: 1,
    threatLevel: "safe",
    findings: [],
  };
}

function dir(name: string, path: string, files: CityFile[]): CityDir {
  return {
    name,
    path,
    fileCount: files.length,
    linesOfCode: files.reduce((s, f) => s + f.linesOfCode, 0),
    languages: { TypeScript: 1 },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    threatScore: 0,
    topFindings: [],
    children: [],
    detailFiles: files,
    remainingFiles: 0,
    districtFiles: files,
  };
}

function city(files: CityFile[]): CityData {
  return {
    repo: { owner: "acme", name: "app", branch: "main" },
    totalFiles: files.length,
    renderedFiles: files.length,
    totalLines: files.reduce((s, f) => s + f.linesOfCode, 0),
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    languages: { TypeScript: 1 },
    tree: dir("", "", files),
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
  };
}

function byKind(kind: RoleLandmarkKind, files: CityFile[]) {
  return detectRoleLandmarks(city(files)).find((l) => l.kind === kind);
}

describe("detectRoleLandmarks", () => {
  it("returns nothing when the scan holds no conventional role", () => {
    expect(detectRoleLandmarks(city([file("src/lib/util.ts")]))).toEqual([]);
  });

  it("keeps at most one landmark per kind, in a stable order", () => {
    const found = detectRoleLandmarks(
      city([
        file("src/main.tsx"),
        file("README.md"),
        file("tests/app.test.ts"),
        file("package.json"),
      ]),
    );
    expect(found.map((l) => l.kind)).toEqual([...ROLE_LANDMARK_KINDS]);
    expect(new Set(found.map((l) => l.kind)).size).toBe(found.length);
  });

  it("reads a conventional entry point as the lighthouse", () => {
    expect(byKind("lighthouse", [file("src/main.tsx")])).toEqual({
      kind: "lighthouse",
      fileId: "src/main.tsx",
      path: "src/main.tsx",
      basis: "basename = main.tsx",
    });
  });

  it("prefers main.* over a barrel index and a server entry", () => {
    const found = byKind("lighthouse", [
      file("src/components/index.ts"),
      file("src/server.ts"),
      file("src/main.py"),
    ]);
    expect(found?.path).toBe("src/main.py");
    expect(found?.basis).toBe("basename = main.py");
  });

  it("does not call a component barrel an entry point", () => {
    expect(byKind("lighthouse", [file("src/components/index.ts")])).toBeUndefined();
  });

  it("does accept an index.* file at a conventional app root", () => {
    expect(byKind("lighthouse", [file("apps/web/src/index.js")])?.basis).toBe(
      "path = apps/web/src/index.js",
    );
  });

  it("reads a root README as the library", () => {
    expect(byKind("library", [file("README.md"), file("docs/guide.md")])).toEqual({
      kind: "library",
      fileId: "README.md",
      path: "README.md",
      basis: "path = README.md",
    });
  });

  it("falls back to a docs file when no README exists", () => {
    expect(byKind("library", [file("docs/a.md"), file("docs/b.md")])).toEqual({
      kind: "library",
      fileId: "docs/a.md",
      path: "docs/a.md",
      basis: "path matches docs/**",
    });
  });

  it("reads the scan's own test role as the watchtower", () => {
    expect(byKind("watchtower", [file("src/checks.ts", "test"), file("src/app.ts")])).toEqual({
      kind: "watchtower",
      fileId: "src/checks.ts",
      path: "src/checks.ts",
      basis: "role = test",
    });
  });

  it("falls back to conventional test paths when role is absent", () => {
    expect(byKind("watchtower", [file("frontend/tests/city.ts")])?.basis).toBe(
      "path matches **/tests/**",
    );
    expect(byKind("watchtower", [file("src/city.test.ts")])?.basis).toBe(
      "basename matches *.test.*",
    );
  });

  it("reads CI before a Dockerfile and both before package.json", () => {
    const files = [file("package.json"), file("Dockerfile"), file(".github/workflows/ci.yml")];
    expect(byKind("factory", files)).toEqual({
      kind: "factory",
      fileId: ".github/workflows/ci.yml",
      path: ".github/workflows/ci.yml",
      basis: "path matches .github/workflows/**",
    });
    expect(
      byKind(
        "factory",
        files.filter((f) => f.path !== ".github/workflows/ci.yml"),
      )?.basis,
    ).toBe("basename = Dockerfile");
    expect(byKind("factory", [file("package.json")])?.basis).toBe("path = package.json");
  });

  it("does not read test fixtures as factory or library landmarks", () => {
    expect(byKind("factory", [file("tests/package.json", "test")])).toBeUndefined();
    expect(byKind("library", [file("tests/README.md", "test")])).toBeUndefined();
  });
});

describe("roleLandmarkRoof", () => {
  it("stands the prop above the roof, scaled from the smaller footprint", () => {
    const roof = roleLandmarkRoof("library", 4, 6, 12);
    expect(roof.baseY).toBeGreaterThan(12);
    expect(roof.scale).toBe(1.6);
    expect(roof.bodyHeight).toBeGreaterThan(0);
  });

  it("clamps small and missing footprints to a finite prop", () => {
    const small = roleLandmarkRoof("watchtower", 0.2, 0.2, 3);
    expect(small.scale).toBe(0.55);
    const missing = roleLandmarkRoof("factory", Number.NaN, 0, 5);
    expect(Number.isFinite(missing.scale)).toBe(true);
    expect(missing.scale).toBeGreaterThan(0);
    expect(missing.baseY).toBe(5.04);
  });
});
