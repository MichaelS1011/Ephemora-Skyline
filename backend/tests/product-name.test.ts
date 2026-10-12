import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * The product answers to "Ephemora Skyline" in the README, the UI and the
 * licence, but eight of its refusal messages — the exact sentences a confused
 * or blocked reader sees — still said "CodeCity", and the analyzer header
 * described a clone step that has not existed for weeks. Internal identifiers
 * keep the old lower-case name on purpose (package names, the staging directory,
 * the localStorage prefixes); renaming those would break stored state and paths
 * for no reader's benefit. What has to be consistent is what a person reads.
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
  it("is the same in both source trees", () => {
    const offenders = [
      ...sources("backend/src", [".ts"]),
      ...sources("frontend/src", [".ts", ".tsx"]),
    ]
      .filter((f) => f.text.includes("CodeCity"))
      .map((f) => f.file);
    expect(offenders, `still calls the product CodeCity:\n${offenders.join("\n")}`).toEqual([]);
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
