import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * The product answers to "Ephemora Skyline" in the README, the UI and the
 * licence, and its internal identifiers answer to the same name since the
 * 2026-11-02 rename: the packages, the staging root, the environment variables,
 * the temp prefixes and the browser-storage keys all carry `ephemora-skyline`
 * or `EPHEMORA_`. This guard keeps the old lower-case name from creeping back
 * into either source tree, or into a package manifest.
 */
const REPO = path.resolve(import.meta.dirname, "../..");

function sources(rel: string, extensions: string[]): Array<{ file: string; text: string }> {
  const dir = path.join(REPO, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => extensions.includes(path.extname(f)))
    .map((f) => ({ file: `${rel}/${f}`, text: readFileSync(path.join(dir, f), "utf-8") }));
}

describe("the name a reader is given", () => {
  it("is the same in both source trees, internal identifiers included", () => {
    const offenders = [
      ...sources("backend/src", [".ts"]),
      ...sources("frontend/src", [".ts", ".tsx"]),
    ]
      // One intentional exception: the one-time staging cleanup must name the
      // retired folder. It carries a `legacy-cleanup` marker on the same line.
      .filter((f) =>
        f.text
          .split("\n")
          .some((line) => /codecity/i.test(line) && !line.includes("legacy-cleanup")),
      )
      .map((f) => f.file);
    expect(offenders, `still carries the old name:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("names each package after the product", () => {
    for (const rel of ["package.json", "frontend/package.json", "backend/package.json"]) {
      const pkg = JSON.parse(readFileSync(path.join(REPO, rel), "utf-8")) as { name: string };
      expect(pkg.name, `${rel} kept an old package name`).toMatch(
        /^ephemora-skyline(-frontend|-backend)?$/,
      );
    }
    const root = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf-8")) as {
      repository?: { url?: string };
    };
    expect(root.repository?.url ?? "", "the root package points elsewhere").toContain(
      "Ephemora-Skyline",
    );
  });

  it("names the product in the messages that refuse a request", () => {
    const localOnly = readFileSync(path.join(REPO, "backend/src/server/local-only.ts"), "utf-8");
    expect(localOnly).toContain("Ephemora Skyline only accepts its own page");
    const analyze = readFileSync(
      path.join(REPO, "backend/src/server/routes/local-analyze.ts"),
      "utf-8",
    );
    expect(analyze).toContain("Ephemora Skyline reads:");
    expect(analyze).toContain("Ephemora Skyline ignores build output");
  });

  it("does not describe a route that is gone", () => {
    const orch = readFileSync(
      path.join(REPO, "backend/src/services/analyzer/orchestrator.ts"),
      "utf-8",
    );
    expect(orch).not.toMatch(/Clone repo → local temp dir|CloneManager/);
    expect(orch).toMatch(/no clone step and no remote to clone from/);
  });
});
