import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { OFFLINE_ENV, OUTBOUND_CALLS, isOffline } from "../src/services/security/network-policy.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import { installDecision } from "../src/server/routes/tests.js";

/**
 * "Local by design" is a claim about the network, so it is checked on the
 * network: what a scan actually reaches for was measured with a logging proxy
 * in front of the real scanners (25 attempts to api.osv.dev plus 8 to
 * semgrep.dev for this repository), and these tests keep the claim, the switch
 * and the documentation from drifting apart from that measurement.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const read = (rel: string): string => readFileSync(path.join(REPO, rel), "utf-8");

/** Whole source tree as one string — for guards that must see every call site. */
function readSource(relDir: string): string {
  const dir = path.join(REPO, relDir);
  const text: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) text.push(readSource(path.join(relDir, entry.name)));
    else if (entry.name.endsWith(".ts")) text.push(read(path.join(relDir, entry.name)));
  }
  return text.join("\n");
}

describe("the offline switch", () => {
  afterEach(() => {
    vi.stubEnv(OFFLINE_ENV, "");
    delete process.env[OFFLINE_ENV];
  });

  it("reads the environment at call time", () => {
    delete process.env[OFFLINE_ENV];
    expect(isOffline()).toBe(false);
    vi.stubEnv(OFFLINE_ENV, "1");
    expect(isOffline()).toBe(true);
  });

  it("stays quiet on anything that is not a yes", () => {
    for (const value of ["0", "false", "", "no", "off", "perhaps"]) {
      process.env[OFFLINE_ENV] = value;
      expect(isOffline()).toBe(false);
    }
  });

  /**
   * A preset or a client body that asks for the network engines must not win
   * against a machine-wide offline claim — otherwise the README promise is
   * only true until someone sends a `tools: { semgrep: true }`.
   */
  it("outranks the profile preset and the client's own toggles", () => {
    process.env[OFFLINE_ENV] = "1";
    const { config } = resolveConfig({
      profile: "deep",
      tools: { semgrep: true, osv: true, dependencies: true },
    });
    expect(config.tools.semgrep).toBe(false);
    expect(config.tools.osv).toBe(false);
    expect(config.tools.dependencies).toBe(false);
    // the engines that never leave the machine keep running
    expect(config.tools.gitleaks).toBe(true);
    expect(config.tools.ruff).toBe(true);
  });

  it("applies to the no-config path too", () => {
    process.env[OFFLINE_ENV] = "1";
    expect(resolveConfig().config.tools.semgrep).toBe(false);
  });

  it("changes nothing while the switch is off", () => {
    delete process.env[OFFLINE_ENV];
    const { config } = resolveConfig({ profile: "deep" });
    expect(config.tools).toMatchObject({ semgrep: true, osv: true, dependencies: true });
  });
});

describe("the release check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env[OFFLINE_ENV];
  });

  it("does not touch the network when the machine is offline", async () => {
    process.env[OFFLINE_ENV] = "1";
    const fetchMock = vi.fn(async () => {
      throw new Error("unreachable");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { handleUpdateCheck } = await import("../src/server/routes/update-check.js");
    const json = vi.fn();
    await handleUpdateCheck({} as never, { json } as unknown as import("express").Response);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.mock.calls[0]![0]).toMatchObject({ updateAvailable: false, offline: true });
  });
});

describe("the documented network surface", () => {
  /**
   * Every host the README names must be a host the code knows about, and the
   * other way round. A new outbound call that is not in OUTBOUND_CALLS fails
   * here, so the privacy table cannot quietly fall behind the scanner.
   */
  it("lists exactly the hosts the policy declares", () => {
    const docs = [read("README.md"), read("docs/GETTING_STARTED.md")].join("\n");
    for (const call of OUTBOUND_CALLS) {
      expect(docs, `README must document ${call.host}`).toContain(call.host);
    }
    for (const documented of [
      "api.osv.dev",
      "semgrep.dev",
      "api.github.com",
      "registry.npmjs.org",
      "pypi.org",
      "registry-1.docker.io",
    ]) {
      expect(
        OUTBOUND_CALLS.some((c) => c.host === documented),
        `${documented} is documented but not declared`,
      ).toBe(true);
    }
  });

  it("keeps every URL our own code fetches on the declared list", () => {
    const declared = new Set(OUTBOUND_CALLS.map((c) => c.host));
    const fetched = [
      ...readSource("backend/src").matchAll(/fetch\s*\(\s*[`"]https:\/\/([a-z0-9.-]+)/gi),
    ].map((m) => m[1]!);
    expect(fetched.length, "the guard is only meaningful while a fetch exists").toBeGreaterThan(0);
    for (const host of fetched) {
      expect(declared, `backend/src fetches ${host}, which the policy does not declare`).toContain(
        host,
      );
    }
  });

  /**
   * The scanners send names, never source. That distinction is the whole
   * privacy claim, so a sentence saying it must stay in the README.
   */
  it("says plainly that no source code is uploaded", () => {
    expect(read("README.md")).toMatch(/never uploaded and never sent to a third party/i);
  });

  /**
   * The table and the code list are the same claim written down twice. Reading
   * the hosts out of the table keeps the second copy from being transcribed by
   * hand — a new row without a declared call, or the other way round, fails.
   */
  it("lists the same hosts in the table as the policy declares", () => {
    const declared = new Set(OUTBOUND_CALLS.map((c) => c.host));
    const table = read("README.md").match(/^\| `([a-z0-9.-]+\.[a-z]{2,})` +\|/gm) ?? [];
    const documented = new Set(
      table.map((row) => row.replace(/^\| `|` +\|$/g, "")).filter((h) => h !== "127.0.0.1"),
    );
    expect(documented.size, "the privacy table names no hosts at all").toBeGreaterThan(3);
    for (const host of documented) {
      expect(declared, `the table names ${host}, which the policy does not declare`).toContain(
        host,
      );
    }
    for (const host of declared) {
      expect(documented, `${host} is declared but missing from the table`).toContain(host);
    }
  });
});

describe("the fallbacks a profile never asks about", () => {
  /**
   * Three paths reach out without the scan engines ever being switched on:
   * the in-city test runner installs the project's own dependencies, pip-audit
   * resolves Python advisories, and the Semgrep Docker fallback pulls an image.
   */
  it("will not resolve a dependency tree over the network while offline", () => {
    expect(installDecision({ nodeModules: false, lockfile: true, offline: true })).toBe(
      "refuse-offline",
    );
    // an installed tree needs nothing fetched, so the switch changes nothing
    expect(installDecision({ nodeModules: true, lockfile: false, offline: true })).toBe("skip");
    expect(installDecision({ nodeModules: false, lockfile: true, offline: false })).toBe(
      "install-pinned",
    );
  });

  it("asks the switch at both adapter fallbacks, not only at the presets", () => {
    const adapters = [
      "backend/src/services/security/adapters/osv-adapter.ts",
      "backend/src/services/security/adapters/semgrep-adapter.ts",
    ]
      .map((f) => read(f))
      .join("\n");
    expect(adapters.match(/isOffline\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
