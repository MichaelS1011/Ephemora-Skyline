import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { stubAdapters, type AdapterStubs } from "./helpers/scanners.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * A scan profile is a promise about what the city will show. Only one of the
 * four ways a finding arrives kept that promise: `scanFile` filtered through the
 * config, while the gitleaks/semgrep/ruff/osv batch merge and the dependency
 * merge appended their results unfiltered. Turning a category off therefore
 * worked for regex findings and silently did nothing for the deeper scanners.
 *
 * The engine fields are named through `stubAdapters()` from `helpers/scanners.ts`
 * now, not a local `poke()`: same fields, same fakes, same assertions — one place
 * that knows which of them may be null and which may not. This file never reached
 * a binary and still does not; it is the place where a merge is judged without
 * asking a program to produce one.
 */
const issue = (over: Partial<SecurityIssue>): SecurityIssue =>
  ({
    type: "HARDCODED_SECRET",
    severity: "P0",
    score: 10,
    line: 1,
    code: "const x = 1;",
    message: "Hardcoded secret detected",
    ...over,
  }) as SecurityIssue;

const file = (p: string): FileAnalysis =>
  ({
    path: p,
    language: "TypeScript",
    lines: { total: 1, code: 1, comments: 0, blank: 0 },
    complexity: { cyclomatic: 1 },
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    vulnerabilities: [],
  }) as FileAnalysis;

/** Batch adapters are swapped for a fixed result, so the merge is what is measured */
function scannerWithBatchFindings(
  findings: Map<string, SecurityIssue[]>,
  config = resolveConfig().config,
): SecurityScanner {
  return stubAdapters(new SecurityScanner(undefined, config), {
    gitleaks: { scanRepository: async () => findings },
    semgrep: null,
    ruff: { lastBatchExecuted: false },
    osv: { scanRepository: async () => new Map() },
  });
}

describe("the config judges every way a finding arrives", () => {
  it("drops a batch finding whose type is turned off", async () => {
    const scanner = scannerWithBatchFindings(
      new Map([["app.ts", [issue({ message: "secret in app.ts" })]]]),
      resolveConfig({ profile: "custom", disabledFindingTypes: ["HARDCODED_SECRET"] }).config,
    );
    const files = [file("app.ts")];
    const res = await scanner.scanRepositoryBatch("/tmp/does-not-need-to-exist", files);
    expect(res.mergedCount).toBe(0);
    expect(files[0]!.vulnerabilities).toEqual([]);
  });

  it("drops a batch finding below the severity threshold", async () => {
    const scanner = scannerWithBatchFindings(
      new Map([["app.ts", [issue({ type: "QUALITY_F401", severity: "P2", message: "unused" })]]]),
      resolveConfig({ profile: "quick" }).config, // P0 only
    );
    const files = [file("app.ts")];
    await scanner.scanRepositoryBatch("/tmp/does-not-need-to-exist", files);
    expect(files[0]!.vulnerabilities).toEqual([]);
  });

  /**
   * The batch scanners are handed the whole clone, so a path the user excluded
   * is not filtered at enumeration the way per-file scanning filters it.
   */
  it("drops a batch finding under an excluded path", async () => {
    const scanner = scannerWithBatchFindings(
      new Map([["third_party/legacy/app.ts", [issue({ message: "secret" })]]]),
      resolveConfig({ profile: "custom", excludePaths: ["third_party/"] }).config,
    );
    const files = [file("third_party/legacy/app.ts")];
    await scanner.scanRepositoryBatch("/tmp/does-not-need-to-exist", files);
    expect(files[0]!.vulnerabilities).toEqual([]);
  });

  it("drops a dependency finding whose type is turned off", async () => {
    const config = resolveConfig({
      profile: "custom",
      disabledFindingTypes: ["VULNERABLE_DEPENDENCY"],
    }).config;
    const scanner = stubAdapters(new SecurityScanner(undefined, config), {
      osv: {
        scanRepository: async () =>
          new Map([["package-lock.json", [issue({ type: "VULNERABLE_DEPENDENCY" })]]]),
        lastBatchExecuted: true,
        lastRunner: "osv-scanner",
      },
    });
    const files = [file("src/app.ts")];
    const res = await scanner.scanDependencies("/tmp/does-not-need-to-exist", files);
    expect(res.added).toBe(0);
    expect(files.find((f) => f.path === "package-lock.json")?.vulnerabilities ?? []).toEqual([]);
  });
});

describe("the tool toggles decide which engines run", () => {
  /**
   * A checkbox that only changes what the *label* says is worse than no
   * checkbox: gitleaks, semgrep and the dependency audit ran on every profile,
   * including the ones whose own text promises they do not.
   */
  function fakes(config: unknown): {
    scanner: SecurityScanner;
    calls: { gitleaks: number; semgrep: number; osv: number; npmAudit: number };
  } {
    const calls = { gitleaks: 0, semgrep: 0, osv: 0, npmAudit: 0 };
    const issues = new Map<string, SecurityIssue[]>();
    const stubs: AdapterStubs = {
      gitleaks: {
        scanRepository: async () => {
          calls.gitleaks++;
          return issues;
        },
      },
      semgrep: {
        lastBatchExecuted: false,
        scanBatch: async () => {
          calls.semgrep++;
          return [];
        },
      },
      osv: {
        lastBatchExecuted: false,
        lastRunner: null,
        scanRepository: async () => {
          calls.osv++;
          return new Map();
        },
      },
      dependency: {
        scanRepository: async () => {
          calls.npmAudit++;
          return { issuesByFile: new Map(), executed: true };
        },
      },
      ruff: { lastBatchExecuted: false, scanRepository: async () => new Map() },
    };
    const scanner = stubAdapters(
      new SecurityScanner(undefined, resolveConfig(config).config),
      stubs,
    );
    return { scanner, calls };
  }

  const files = () => [file("app.ts")];

  it("does not run gitleaks when the profile turned it off", async () => {
    const { scanner, calls } = fakes({ profile: "quality-only" });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    expect(calls.gitleaks).toBe(0);
  });

  it("still runs gitleaks when the profile asks for it", async () => {
    const { scanner, calls } = fakes({ profile: "standard" });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    expect(calls.gitleaks).toBe(1);
  });

  it("does not run semgrep when the profile turned it off", async () => {
    const { scanner, calls } = fakes({ profile: "quick" });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    expect(calls.semgrep).toBe(0);
  });

  /**
   * osv is a network tool. It used to run in the batch phase and again in the
   * dependency phase, so one scan asked the same question twice.
   */
  it("asks the CVE scanner once per scan, not once per phase", async () => {
    const { scanner, calls } = fakes({ profile: "standard" });
    // an osv that ANSWERED — "tried and absent from PATH" is the next test's case
    stubAdapters(scanner, {
      osv: {
        lastBatchExecuted: true,
        lastRunner: "osv",
        scanRepository: async () => {
          calls.osv++;
          return new Map();
        },
      },
    });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    await scanner.scanDependencies("/tmp/none", files());
    expect(calls.osv).toBe(1);
    expect(calls.npmAudit).toBe(0); // osv answered the question already
  });

  it("does not audit dependencies when the profile turned it off", async () => {
    const { scanner, calls } = fakes({
      profile: "custom",
      tools: { dependencies: false, osv: false },
    });
    const res = await scanner.scanDependencies("/tmp/none", files());
    expect(res.executed).toBe(false);
    expect(calls.osv + calls.npmAudit).toBe(0);
  });

  /**
   * The audit that finds nothing is the case most users get, and it used to
   * answer `executed: false` — so the panel said no dependency audit had looked
   * at the project, in front of a lockfile that had just been audited. The
   * finding count is not the provenance question.
   */
  it("counts a clean npm audit as an audit that ran", async () => {
    const { scanner, calls } = fakes({
      profile: "custom",
      tools: { dependencies: true, osv: false, gitleaks: false, semgrep: false, ruff: false },
    });
    const res = await scanner.scanDependencies("/tmp/none", files());
    expect(calls.npmAudit, "npm audit is the engine this path asks").toBe(1);
    expect(res.executed, "an audit with nothing to report is still an audit").toBe(true);
    expect(res.added).toBe(0);
    expect(res.runner).toBe("npm-audit");
  });

  /**
   * `dependencies` is one boolean for two programs. When osv-scanner answered
   * the CVE question, the card named `npm audit` — an engine that never ran —
   * so the payload now carries which runner it is talking about.
   */
  /**
   * Selected but not installed is not an answer. The batch phase used to mark the
   * question closed whatever it brought back, which both reported
   * `dependencies: true` with no engine on the machine and locked out the
   * `npm audit` fallback that SECURITY.md promises for exactly this case.
   */
  it("asks the npm audit fallback when the selected osv never ran", async () => {
    const { scanner, calls } = fakes({ profile: "standard" });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    const res = await scanner.scanDependencies("/tmp/none", files());
    expect(calls.osv, "the batch phase already tried osv — do not ask it twice").toBe(1);
    expect(calls.npmAudit, "the fallback is the answer this machine can give").toBe(1);
    expect(res.executed).toBe(true);
    expect(res.runner).toBe("npm-audit");
  });

  it("reports no dependency audit when neither osv nor the fallback could run", async () => {
    const { scanner } = fakes({ profile: "standard" });
    stubAdapters(scanner, {
      dependency: { scanRepository: async () => ({ issuesByFile: new Map(), executed: false }) },
    });
    await scanner.scanRepositoryBatch("/tmp/none", files());
    const res = await scanner.scanDependencies("/tmp/none", files());
    expect(res.executed, "nothing ran, so nothing may claim to have run").toBe(false);
    expect(res.runner).toBeNull();
  });

  it("reports the runner that answered, not the flag's own name", async () => {
    const { scanner, calls } = fakes({
      profile: "custom",
      tools: { dependencies: true, osv: true, gitleaks: false, semgrep: false, ruff: false },
    });
    stubAdapters(scanner, {
      osv: {
        lastBatchExecuted: true,
        lastRunner: "osv",
        scanRepository: async () => {
          calls.osv++;
          return new Map();
        },
      },
    });
    const res = await scanner.scanDependencies("/tmp/none", files());
    expect(res.executed).toBe(true);
    expect(res.runner, "npm audit never ran, and the payload must not claim it did").toBe("osv");
    expect(calls.npmAudit).toBe(0);
  });
});

describe("allowlist matching", () => {
  const allows = (config: Parameters<typeof resolveConfig>[0], type: string): boolean => {
    const scanner = new SecurityScanner(undefined, resolveConfig(config).config);
    return (
      scanner as unknown as { configFilterAllows: (i: SecurityIssue) => boolean }
    ).configFilterAllows(issue({ type, message: type }));
  };

  /**
   * A profile names a family, not every member of it: ruff contributes
   * `QUALITY_<code>` and semgrep `SECURITY_<check-id>`, so an exact-match list
   * could never describe them and a quality profile would silently keep only the
   * three hand-written types.
   */
  it("reads an allowlist entry as a family, not only an exact name", () => {
    expect(allows({ enabledFindingTypes: ["QUALITY"] }, "QUALITY_F401")).toBe(true);
    expect(allows({ enabledFindingTypes: ["QUALITY"] }, "SQL_INJECTION")).toBe(false);
    expect(allows({ enabledFindingTypes: ["SQL_INJECTION"] }, "SQL_INJECTION")).toBe(true);
  });

  it("applies the profile's own allowlist, which the presets already promised", () => {
    const quality = resolveConfig({ profile: "quality-only" }).config;
    expect(quality.enabledFindingTypes.length).toBeGreaterThan(0);
    expect(allows(quality, "CONSOLE_USAGE")).toBe(true);
    expect(allows(quality, "QUALITY_F401")).toBe(true);
    expect(allows(quality, "SQL_INJECTION")).toBe(false);
  });

  it("security-only drops the complete Python hygiene family", () => {
    expect(allows({ profile: "security-only" }, "QUALITY_F401")).toBe(false);
    expect(allows({ profile: "security-only" }, "QUALITY_E501")).toBe(false);
    expect(allows({ profile: "security-only" }, "SQL_INJECTION")).toBe(true);
  });

  it("lets an explicit user list replace the profile's list, not widen it", () => {
    const merged = resolveConfig({
      profile: "quality-only",
      enabledFindingTypes: ["SQL_INJECTION"],
    }).config;
    expect(merged.enabledFindingTypes).toEqual(["SQL_INJECTION"]);
  });
});
