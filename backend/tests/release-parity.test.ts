import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isNewerVersion } from "../src/server/routes/update-check.js";

/**
 * The release cut's own guard.
 *
 * `scripts/release-cut.mjs` writes the version into four manifests and the
 * lockfile, and the app compares what it has against the newest GitHub
 * release. Both halves fail quietly: a manifest the cut missed reports an old
 * number, and a fourth version component (`0.2.0.01`) compares EQUAL to its
 * parent inside `isNewerVersion` — the notice the bump exists to raise would
 * never fire. This file is the reason neither can happen unnoticed.
 */

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;

const MANIFESTS = [
  "package.json",
  "frontend/package.json",
  "backend/package.json",
  "package.publish.json",
] as const;

const version = (): string => json<{ version: string }>("package.json").version;

describe("one version, everywhere it is written", () => {
  it("carries the same number in all four manifests", () => {
    const want = version();
    for (const file of MANIFESTS) {
      expect(json<{ version: string }>(file).version, `${file} drifted from the root`).toBe(want);
    }
  });

  it("and the same number in the lockfile's own entries", () => {
    const want = version();
    const lock = json<{
      version: string;
      packages: Record<string, { version?: string }>;
    }>("package-lock.json");
    expect(lock.version).toBe(want);
    const entry = (key: string): string => {
      const found = lock.packages[key];
      expect(found, `package-lock.json has no packages.${key} entry`).not.toBeUndefined();
      return found?.version ?? "(none)";
    };
    expect(entry("")).toBe(want);
    expect(entry("frontend"), "frontend workspace").toBe(want);
    expect(entry("backend"), "backend workspace").toBe(want);
  });

  it("is three numbers, because a fourth would silence the update notice", () => {
    const v = version();
    expect(v, `version "${v}" is not MAJOR.MINOR.PATCH`).toMatch(/^\d+\.\d+\.\d+$/);
    // The claim made concrete: the shipped comparison cannot tell 0.2.0.01 from
    // 0.2.0, so a four-part tag is an update nobody is told about.
    expect(isNewerVersion("0.2.0.01", "0.2.0"), "four-part versions must not look newer").toBe(
      false,
    );
    expect(isNewerVersion("0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("v0.3.0", "0.2.9")).toBe(true);
  });
});

describe("the changelog keeps an inbox for the next cut", () => {
  it("has an Unreleased section to collect pushed improvements in", () => {
    expect(read("CHANGELOG.md"), "release-cut refuses without it — keep the heading").toMatch(
      /^## \[Unreleased\]$/m,
    );
  });

  it("names the released version in a section of its own", () => {
    expect(read("CHANGELOG.md")).toContain(`## [${version()}]`);
  });
});
