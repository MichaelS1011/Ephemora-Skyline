/**
 * A hosted page is a demo, and the build must say so in code.
 *
 * The page on GitHub Pages has no backend, so two promises change: the demo
 * comes from a baked file, and the folder picker is not offered at all. This
 * file checks the parts a test can check without a browser: the URL the bake
 * is read from, the flag's two readings, and the source-level fact that the
 * picker is behind that flag (a later `{hosted &&` slipping off would put a
 * picker on a page that cannot scan, which is the failure this exists for).
 *
 * What no unit test can check — that the page really renders the city — was
 * measured in a real Chromium against the built page; the numbers are in the
 * commit message of the change that added the build.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoCityPath, isHostedDemo } from "../src/demo/hosted";

const REPO = path.resolve(process.cwd(), "..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the hosted build's demo", () => {
  it("reads the baked city from the page's own directory", () => {
    expect(demoCityPath("/Ephemora-Skyline/")).toBe("/Ephemora-Skyline/demo/city.json");
    expect(demoCityPath("/")).toBe("/demo/city.json");
    expect(demoCityPath("/sub")).toBe("/sub/demo/city.json");
  });

  it("is on only when the build says so", () => {
    vi.stubEnv("VITE_HOSTED_DEMO", "1");
    expect(isHostedDemo()).toBe(true);
    for (const value of ["", "0", "true", "yes"]) {
      vi.stubEnv("VITE_HOSTED_DEMO", value);
      expect(isHostedDemo(), `"${value}" is not a yes`).toBe(false);
    }
  });

  it("ships a baked city that parses and names itself a demo", () => {
    const file = path.join(REPO, "frontend/public/demo/city.json");
    expect(existsSync(file), "frontend/public/demo/city.json is missing").toBe(true);
    const city = JSON.parse(readFileSync(file, "utf8")) as {
      analysisId?: string;
      totalFiles?: number;
    };
    expect(city.analysisId).toBe("demo-001");
    expect(city.totalFiles, "the bake must carry the demo's 74 files").toBe(74);
  });
});
