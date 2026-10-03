import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  installDecision,
  REFUSAL,
  RUNNER_HOME,
  runnerBinaryPath,
  runnerEnv,
  sanitizeFileFilters,
} from "../src/server/routes/tests.js";

/**
 * "Run my tests" executes whatever the scanned folder contains — on this
 * machine. The folder is chosen by the user and may be third-party code, so the
 * process it starts must not inherit the credentials of the process that
 * started it, and it must not get to pick its own command line options.
 */
describe("the test run gets an environment without the user's credentials", () => {
  it("carries no variable from the parent beyond what a node run needs", () => {
    process.env["CODECITY_TEST_AWS_TOKEN"] = "should-never-be-passed-on";
    process.env["CODECITY_TEST_DB_URL"] = "postgres://user:pw@host/db";
    const env = runnerEnv("/tmp/runner-home");
    expect(env["CODECITY_TEST_AWS_TOKEN"]).toBeUndefined();
    expect(env["CODECITY_TEST_DB_URL"]).toBeUndefined();
    expect(env["PATH"]).toBe(process.env["PATH"]);
    delete process.env["CODECITY_TEST_AWS_TOKEN"];
    delete process.env["CODECITY_TEST_DB_URL"];
  });

  /** An `.npmrc` in the real HOME can hold a registry token npm would send */
  it("points npm at an empty config and a private cache", () => {
    const env = runnerEnv("/tmp/runner-home");
    expect(env["HOME"]).toBe("/tmp/runner-home");
    expect(env["npm_config_userconfig"]).toBe("/tmp/runner-home/.npmrc");
    expect(env["npm_config_cache"]).toBe(RUNNER_HOME.npmCache("/tmp/runner-home"));
    expect(env["CI"]).toBe("1");
  });
});

describe("the file selection cannot become a command line switch", () => {
  it("keeps plain paths and drops options and escapes", () => {
    const kept = sanitizeFileFilters([
      "tests/unit.test.ts",
      "./src/a.test.ts",
      "--config=/tmp/evil.vitest.config.ts",
      "-t",
      "tests/../../etc/passwd",
      "",
      "  ",
    ]);
    expect(kept).toEqual(["tests/unit.test.ts", "src/a.test.ts"]);
  });

  it("caps how many files one request may name", () => {
    const many = Array.from({ length: 400 }, (_, i) => `tests/f${i}.test.ts`);
    expect(sanitizeFileFilters(many)).toHaveLength(100);
  });
});

describe("the runner home is created without credentials in it", () => {
  it("writes an empty .npmrc rather than reusing the user's", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codecity-runnerhome-"));
    await RUNNER_HOME.prepare(dir);
    const npmrc = await fs.readFile(path.join(dir, ".npmrc"), "utf-8");
    expect(npmrc.trim()).toBe("");
    await fs.stat(path.join(dir, "npm-cache"));
    await fs.rm(dir, { recursive: true, force: true });
  });
});

/**
 * `npx vitest` resolves the project's own binary when it is installed and
 * otherwise downloads the newest one from the registry and runs it. Downloading
 * code and executing it is a decision the user should make, not a side effect of
 * pressing "run my tests" — so the run needs the dependency to be there already.
 */
describe("nothing is fetched to answer a test run", () => {
  it("installs only when the graph is pinned by a lockfile", () => {
    expect(installDecision({ nodeModules: false, lockfile: true })).toBe("install-pinned");
    expect(installDecision({ nodeModules: false, lockfile: false })).toBe("refuse");
    expect(installDecision({ nodeModules: true, lockfile: false })).toBe("skip");
  });

  it("names the local binary instead of asking npx", () => {
    expect(runnerBinaryPath("vitest")).toEqual(["node_modules", ".bin", "vitest"]);
    expect(runnerBinaryPath("jest")).toEqual(["node_modules", ".bin", "jest"]);
  });

  it("tells the user what to do when it refuses", () => {
    expect(REFUSAL).toMatch(/npm (ci|install)/);
    expect(REFUSAL).toMatch(/lockfile/);
  });
});
