/**
 * coverage — lcov parsing tests.
 */

import { describe, expect, it } from "vitest";
import { parseLcov } from "../src/services/analyzer/coverage.js";

describe("parseLcov", () => {
  it("parses SF/LF/LH trace records into percentages", () => {
    const lcov = [
      "TN:",
      "SF:src/full.ts",
      "FN:1,main",
      "LF:10",
      "LH:10",
      "end_of_record",
      "SF:src/half.ts",
      "LF:100",
      "LH:50",
      "end_of_record",
      "SF:src/zero.ts",
      "LF:4",
      "LH:0",
      "end_of_record",
    ].join("\n");

    const map = parseLcov(lcov);
    expect(map.get("src/full.ts")).toBe(100);
    expect(map.get("src/half.ts")).toBe(50);
    expect(map.get("src/zero.ts")).toBe(0);
  });

  it("strips ./ prefixes from paths", () => {
    const map = parseLcov("SF:./src/a.ts\nLF:2\nLH:1\nend_of_record\n");
    expect(map.has("src/a.ts")).toBe(true);
  });

  it("skips records with zero found lines and tolerates missing end_of_record", () => {
    const map = parseLcov("SF:src/x.ts\nLF:0\nLH:0\nend_of_record\nSF:src/y.ts\nLF:4\nLH:2\n");
    expect(map.size).toBe(1);
    expect(map.get("src/y.ts")).toBe(50);
  });

  it("returns empty map for garbage input", () => {
    expect(parseLcov("not an lcov file\nat all\n").size).toBe(0);
  });
});
