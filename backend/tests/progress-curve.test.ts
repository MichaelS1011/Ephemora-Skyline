/**
 * The progress curve is a measurement, not a step function.
 *
 * Measured in the audit: 0% → 88% → city, and the 88 % stood there for 14,7 s
 * (24 lines of code) up to 28 s (900 files) — `bericht.md` D3. The parse loop now
 * reports its share of the files it actually read, so the bar moves while work is
 * happening; the deep scan keeps its own stage because its duration is the
 * server's, not a counted quantity.
 *
 * The scanner is the quiet one from `helpers/scanners.ts` — this file measures the
 * parse phase's emissions over 40 small files, and `{ regex: true }` — the shipped
 * regex catalogue — is the only scanner code that question touches. Forking gitleaks
 * over the same 40 files cost this run its 30 s budget on a loaded machine without
 * ever being the assertion.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { AnalysisOrchestrator } from "../src/services/analyzer/orchestrator.js";
import { quietScanner } from "./helpers/scanners.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import type { GitHubRepo, ProgressEvent } from "../src/models/index.js";

const REPO: GitHubRepo = {
  owner: "local",
  name: "curve",
  branch: "local",
  cloneUrl: "",
  analyzedAt: new Date().toISOString(),
};

let dir = "";

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join("/tmp", "skyline-curve-"));
  // 40 small files: four parse batches of 16, so the loop has steps to report
  for (let i = 0; i < 40; i++) {
    const name = path.join(dir, "src", `f${String(i).padStart(2, "0")}.ts`);
    await fs.mkdir(path.dirname(name), { recursive: true });
    await fs.writeFile(name, `export const v${i} = ${i};\nconsole.log(v${i});\n`);
  }
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("the parse phase reports shares, not a jump", () => {
  it("emits several distinct progress values between 30 and 85 while parsing", async () => {
    const events: ProgressEvent[] = [];
    const orchestrator = new AnalysisOrchestrator(quietScanner({ regex: true }));
    const { config } = resolveConfig({ profile: "quick" });
    const result = await orchestrator.analyzeDirectory(
      "curve-test",
      dir,
      REPO,
      (event) => events.push(event),
      config,
    );
    expect(result.summary.totalFiles).toBe(40);

    const parsing = events.filter((e) => e.stage === "Parsing files");
    const values = [...new Set(parsing.map((e) => e.progress))].sort((a, b) => a - b);
    const between = values.filter((v) => v > 30 && v < 86);
    expect(between.length, `only ${values.join(", ")} were emitted`).toBeGreaterThanOrEqual(2);
    // monotone: a bar that goes backwards is not a measurement
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
    expect(parsing.at(-1)!.progress).toBe(85);
  });
});
