import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { resultToSarif } from "../src/utils/sarif.js";
import { getHealth } from "../src/server/routes/health.js";
import { APP_VERSION } from "../src/version.js";
import type { AnalysisResult } from "../src/models/index.js";

/**
 * What the product says about itself on the way out. A SARIF file is handed to
 * other tools and often to other people, and the health endpoint is the first
 * thing anyone curls — both used to name an earlier project and a release that
 * has not happened.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const packageVersion = (file: string): string =>
  JSON.parse(readFileSync(path.join(REPO, file), "utf-8")).version;

const result = {
  files: [
    {
      path: "src/a.ts",
      vulnerabilities: [{ type: "EVAL_USAGE", severity: "P0", line: 3, message: "eval()" }],
    },
  ],
} as unknown as AnalysisResult;

describe("the product's own identity", () => {
  it("names itself in the SARIF driver", () => {
    const driver = resultToSarif(result).runs[0]!.tool.driver;
    expect(driver.name).toBe("Ephemora Skyline");
    expect(driver.informationUri).toBe("https://github.com/MichaelS1011/Ephemora-Skyline");
    expect(driver.name).not.toMatch(/codecity/i);
  });

  it("reports one version, and it is the one the package declares", async () => {
    expect(APP_VERSION).toBe(packageVersion("backend/package.json"));
    expect((await getHealth()).version).toBe(APP_VERSION);
    expect(resultToSarif(result).runs[0]!.tool.driver.version).toBe(APP_VERSION);
  });

  it("does not claim a release the version says has not happened", async () => {
    const [major] = APP_VERSION.split(".").map(Number);
    expect(major).toBeLessThan(1);
    expect((await getHealth()).version).not.toBe("1.0.0");
  });
});
