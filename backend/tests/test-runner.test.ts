/**
 * tests route — runner detection + jest-style JSON parsing.
 * (No npm install / actual test execution in unit tests — those paths are
 * exercised end-to-end against the real project.)
 */

import { describe, expect, it } from "vitest";
import {
  detectRunner,
  parseJestStyleJson,
  filtersForTarget,
  resultPath,
  sanitizeFileFilters,
} from "../src/server/routes/tests.js";

describe("detectRunner", () => {
  it("detects vitest from devDependencies", () => {
    expect(
      detectRunner({ devDependencies: { vitest: "^4.0.0" }, scripts: { test: "vitest run" } }),
    ).toBe("vitest");
  });

  it("detects jest from the test script", () => {
    expect(detectRunner({ scripts: { test: "jest --coverage" } })).toBe("jest");
  });

  it("returns null without a supported runner", () => {
    expect(
      detectRunner({ scripts: { test: "mocha" }, devDependencies: { mocha: "^1" } }),
    ).toBeNull();
    expect(detectRunner({})).toBeNull();
  });

  it("prefers vitest when both are listed", () => {
    expect(
      detectRunner({
        devDependencies: { jest: "^29", vitest: "^4" },
        scripts: { test: "vitest" },
      }),
    ).toBe("vitest");
  });
});

describe("parseJestStyleJson", () => {
  it("parses jest --json output into per-file results", () => {
    const raw = JSON.stringify({
      numTotalTests: 3,
      numFailedTests: 1,
      testResults: [
        {
          name: "/repo/frontend/tests/a.test.ts",
          status: "passed",
          assertionResults: [
            { ancestorTitles: ["math"], title: "adds", status: "passed" },
            { ancestorTitles: ["math"], title: "subs", status: "passed" },
          ],
        },
        {
          name: "/repo/frontend/tests/b.test.tsx",
          status: "failed",
          assertionResults: [
            { title: "renders", status: "passed" },
            {
              ancestorTitles: ["auth"],
              title: "rejects bad token",
              status: "failed",
              failureMessages: [
                "expect(received).toBe(true)\n\n at Object.<anonymous> b.test.tsx:9",
              ],
            },
          ],
        },
      ],
    });
    const result = parseJestStyleJson(raw)!;
    expect(result).not.toBeNull();
    expect(result.totalTests).toBe(4); // counted from assertionResults
    expect(result.failedTests).toBe(1);
    expect(result.files.length).toBe(2);
    expect(result.files[0]!.path).toBe("/repo/frontend/tests/a.test.ts");
    expect(result.files[0]!.status).toBe("passed");
    expect(result.files[1]!.status).toBe("failed");
    expect(result.files[1]!.failures[0]!.name).toBe("auth › rejects bad token");
    expect(result.files[1]!.failures[0]!.message.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("survives vitest's non-JSON preamble", () => {
    const raw =
      'run test…\n{"testResults":[{"name":"x.test.ts","assertionResults":[{"title":"t","status":"passed"}]}]}';
    const result = parseJestStyleJson(raw);
    expect(result?.files[0]!.path).toBe("x.test.ts");
  });

  it("returns null for garbage", () => {
    expect(parseJestStyleJson("no json here")).toBeNull();
    expect(parseJestStyleJson("{}")).toBeNull(); // no testResults
  });
});

describe("test outcomes and workspace selection", () => {
  it("never counts pending, todo or empty suites as passed", () => {
    const result = parseJestStyleJson(
      JSON.stringify({
        testResults: [
          {
            name: "skipped.test.ts",
            status: "passed",
            assertionResults: [{ status: "pending" }, { status: "todo" }],
          },
          { name: "empty.test.ts", status: "passed", assertionResults: [] },
          {
            name: "mixed.test.ts",
            assertionResults: [{ status: "passed" }, { status: "skipped" }],
          },
        ],
      }),
    )!;
    expect(result.passedTests).toBe(1);
    expect(result.skippedTests).toBe(3);
    expect(result.files.map((f) => f.status)).toEqual(["skipped", "skipped", "passed"]);
  });
  it("retains suite errors before assertions exist", () => {
    const result = parseJestStyleJson(
      JSON.stringify({
        testResults: [
          {
            name: "broken.test.ts",
            status: "failed",
            message: "Cannot import fixture",
            assertionResults: [],
          },
        ],
      }),
    )!;
    expect(result.failedSuites).toBe(1);
    expect(result.files[0]!.failures[0]!.message).toContain("Cannot import fixture");
    expect(result.passedTests).toBe(0);
  });
  it("selects only the owning workspace and removes the repository prefix", () => {
    const files = ["frontend/tests/a.test.ts"];
    expect(filtersForTarget("/repo", "/repo/backend", files)).toEqual([]);
    expect(filtersForTarget("/repo", "/repo/frontend", files)).toEqual(["tests/a.test.ts"]);
    expect(resultPath("/repo", "/repo/frontend", "/repo/frontend/tests/a.test.ts")).toBe(files[0]);
    expect(resultPath("/repo", "/repo/frontend", "tests/a.test.ts")).toBe(files[0]);
  });
  it("rejects absolute, parent and option filters", () => {
    expect(
      sanitizeFileFilters([
        "/tmp/a.test.ts",
        "C:\\tests\\a.test.ts",
        "../a",
        "--config=evil",
        "tests/a.test.ts",
      ]),
    ).toEqual(["tests/a.test.ts"]);
  });
});
