/**
 * The baked demo and the live demo must be the same city.
 *
 * `Explore demo` fetches `GET /api/cities/default`; a hosted page has no
 * backend, so `scripts/demo-city.mjs` writes the same bytes into
 * `frontend/public/demo/city.json` at build time. Two artefacts describing one
 * demo are exactly the kind of pair that drifts: this test regenerates the
 * city from the backend's own two functions and compares. If it is red, run
 * `npm run build --workspace backend && node scripts/demo-city.mjs`.
 *
 * The other two cases guard the promise that makes a demo publishable at all:
 * it must announce itself as unanalysed (`provenance: "demo"`, every engine
 * off), and it must not smuggle a machine path or a person's name into a
 * public page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_SCANNED_AT, getDemoResult } from "../src/server/routes/demo.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";

const REPO = path.resolve(import.meta.dirname, "../..");
const BAKED = "frontend/public/demo/city.json";
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf8");

/** The fields this file reads. The frontend's own `CityData` is not imported:
 *  the backend's module resolution refuses extensionless relative paths, and a
 *  second import path for one interface is the drift this guard exists to stop. */
interface BakedCity {
  createdAt?: string;
  repo: { owner: string; name: string; branch: string };
  tree: unknown;
  scanProvenance?: Record<string, boolean>;
}

/** Every finding in the tree, at any depth — districts nest. */
function findingsOf(city: BakedCity): Array<{ provenance?: string }> {
  const out: Array<{ provenance?: string }> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.findings))
      out.push(...(record.findings as Array<{ provenance?: string }>));
    for (const value of Object.values(record)) walk(value);
  };
  walk(city.tree);
  return out;
}

describe("the hosted demo is the demo the app draws", () => {
  it("carries the bytes the backend would answer with", () => {
    const fresh = `${JSON.stringify(mapResultToCityData(getDemoResult()))}\n`;
    expect(
      read(BAKED),
      `${BAKED} no longer matches the backend's demo city. Run: ` +
        `npm run build --workspace backend && node scripts/demo-city.mjs`,
    ).toBe(fresh);
  });

  it("was frozen on one date, so a bake can be checked at all", () => {
    const baked = JSON.parse(read(BAKED)) as BakedCity;
    expect(baked.createdAt, "the demo's createdAt must be the frozen date").toBe(DEMO_SCANNED_AT);
    // The mapper drops the result's own `analyzedAt`; a second clock in the file
    // would be a second answer to "when", so it must not be there at all.
    expect(baked.repo).toEqual({ owner: "ephemora-skyline", name: "demo-city", branch: "main" });
  });

  it("arrives marked as a demo, never as a scan", () => {
    const baked = JSON.parse(read(BAKED)) as BakedCity;
    const findings = findingsOf(baked);
    expect(findings.length, "the demo must have something to point at").toBeGreaterThan(20);
    expect(
      new Set(findings.map((f) => f.provenance)),
      "every demo finding says provenance: demo — a hosted page must not read as a real scan",
    ).toEqual(new Set(["demo"]));
    expect(
      Object.values(baked.scanProvenance ?? {}).some(Boolean),
      "every engine is declared off: nothing was analysed",
    ).toBe(false);
  });

  it("names no machine and no person", () => {
    const text = read(BAKED);
    expect(text).not.toMatch(/\/Users\/|\/home\/[a-z]|[A-Za-z]:\\\\Users/);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });
});
