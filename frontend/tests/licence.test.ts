import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * The project moved from Business Source License 1.1 to Apache License 2.0 on
 * 2026-10-05. A licence claim that lives only in one file is a claim that drifts:
 * the badge, the package metadata, the rule-pack manifest and the prose all said
 * "BSL" at some point in this repository's life. So the pairing is checked here.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

describe("the Apache-2.0 relicensing", () => {
  it("puts the unmodified licence text in LICENSE", () => {
    const license = read("LICENSE");
    expect(license).toMatch(/Apache License\s+Version 2\.0, January 2004/);
    expect(license).toMatch(/TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
    expect(license).toMatch(/END OF TERMS AND CONDITIONS/);
    expect(license).toMatch(/APPENDIX: How to apply/);
    expect(license).not.toMatch(/Business Source License|Change Date|Change License/);
  });

  it("states the rights holder somewhere a reader can find", () => {
    expect(read("NOTICE")).toMatch(/Copyright \(c\) \d{4} Ephemora/);
  });

  it("says the same thing in every metadata file", () => {
    for (const rel of ["package.json", "backend/package.json", "frontend/package.json"]) {
      expect(JSON.parse(read(rel)).license, rel).toBe("Apache-2.0");
    }
    expect(JSON.parse(read("backend/rules/ephemora-core/pack.json")).license).toContain(
      "Apache-2.0",
    );
  });

  it("keeps the prose free of the old restrictions", () => {
    for (const rel of ["README.md", "CONTRIBUTING.md", "SECURITY.md", "docs/ARCHITECTURE.md"]) {
      const text = read(rel);
      expect(text, `${rel} still advertises a commercial licence`).not.toMatch(
        /commercial licen[cs]e|hosted-service rights|white-labelling/,
      );
      expect(text, `${rel} still claims Business Source License`).not.toMatch(
        /\bBSL-1\.1\b|Business Source License 1\.1/,
      );
    }
    expect(read("README.md")).toMatch(/Apache License 2\.0/);
  });

  it("still ships the font's own licence", () => {
    expect(read("frontend/public/OFL-JetBrains-Mono.txt")).toMatch(/SIL OPEN FONT LICENSE/);
  });
});
