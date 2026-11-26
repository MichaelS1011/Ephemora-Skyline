/** The BUILD export must land in files the existing Skyline analyzer actually reads. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isScannedPath } from "../src/services/analyzer/orchestrator.js";

const dir = path.resolve(import.meta.dirname, "../../frontend/src/forge");
const source = readFileSync(path.join(dir, "codegen.ts"), "utf8");
const runtime = readFileSync(path.join(dir, "runtime.tsx"), "utf8");
const exportedPaths = [...source.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]!);
const sources = exportedPaths.filter((file) => !file.endsWith(".md"));
const docs = exportedPaths.filter((file) => file.endsWith(".md"));
const stripExt = (file: string) => file.replace(/\.(ts|tsx|json)$/, "");

describe("FORGE export → Skyline analyzer", () => {
  it("writes only analyzer-readable source files", () => {
    expect(sources.length).toBeGreaterThanOrEqual(9);
    expect(sources).toContain("src/runtime.tsx");
    expect(sources).toContain("src/catalog.ts");
    expect(sources).toContain("src/graph.json");
    for (const file of sources) expect(isScannedPath(file), file).toBe(true);
  });

  it("exports every local module the runtime imports", () => {
    const exported = new Set(sources.map(stripExt));
    for (const match of runtime.matchAll(/from\s+"(\.\/[^"]+)"/g)) {
      const spec = match[1] ?? "";
      expect(exported.has(stripExt(`src/${spec.slice(2)}`)), `${spec} missing in export`).toBe(
        true,
      );
    }
  });

  it("keeps docs out of the analyzer on purpose", () => {
    // SUPPORTED_EXTENSIONS has no .md; docs are readable by the user, not the scanner.
    expect(docs).toEqual(["README.md", "NOTICE.md"]);
  });

  it("never writes outside the exported project root", () => {
    for (const file of exportedPaths) {
      expect(file.startsWith("/") || file.includes(".."), file).toBe(false);
    }
  });
});
