import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import type { FileAnalysis, SecurityIssue } from "../src/models/index.js";

/**
 * A scan profile is a promise about what the city will show. Only one of the
 * four ways a finding arrives kept that promise: `scanFile` filtered through the
 * config, while the gitleaks/semgrep/ruff/osv batch merge and the dependency
 * merge appended their results unfiltered. Turning a category off therefore
 * worked for regex findings and silently did nothing for the deeper scanners.
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

/** Private fields swapped for fakes: the merge is what is measured, not the tools */
function poke(scanner: SecurityScanner, field: string, value: unknown): void {
  (scanner as unknown as Record<string, unknown>)[field] = value;
}

/** Batch adapters are swapped for a fixed result, so the merge is what is measured */
function scannerWithBatchFindings(
  findings: Map<string, SecurityIssue[]>,
  config = resolveConfig().config,
): SecurityScanner {
  const scanner = new SecurityScanner(undefined, config);
  poke(scanner, "gitleaksAdapter", {
    scanRepository: async () => findings,
    enableBatchMode: () => {},
  });
  poke(scanner, "semgrepAdapter", null);
  poke(scanner, "ruffAdapter", { lastBatchExecuted: false });
  poke(scanner, "osvAdapter", {
    scanRepository: async () => new Map(),
    lastBatchExecuted: false,
    lastRunner: null,
  });
  return scanner;
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
    const scanner = new SecurityScanner(undefined, config);
    (
      scanner as unknown as {
        osvAdapter: {
          scanRepository: () => Promise<Map<string, SecurityIssue[]>>;
          lastBatchExecuted: boolean;
          lastRunner: string | null;
        };
      }
    ).osvAdapter = {
      scanRepository: async () =>
        new Map([["package-lock.json", [issue({ type: "VULNERABLE_DEPENDENCY" })]]]),
      lastBatchExecuted: true,
      lastRunner: "osv-scanner",
    };
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
    const scanner = new SecurityScanner(undefined, resolveConfig(config).config);
    const issues = new Map<string, SecurityIssue[]>();
    poke(scanner, "gitleaksAdapter", {
      scanRepository: async () => {
        calls.gitleaks++;
        return issues;
      },
      enableBatchMode: () => {},
    });
    poke(scanner, "semgrepAdapter", {
      lastBatchExecuted: false,
      scanBatch: async () => {
        calls.semgrep++;
        return [];
      },
    });
    poke(scanner, "osvAdapter", {
      lastBatchExecuted: false,
      lastRunner: null,
      scanRepository: async () => {
        calls.osv++;
        return new Map();
      },
    });
    poke(scanner, "dependencyAdapter", {
      scanRepository: async () => {
        calls.npmAudit++;
        return { issuesByFile: new Map(), executed: true };
      },
    });
    poke(scanner, "ruffAdapter", {
      lastBatchExecuted: false,
      scanRepository: async () => new Map(),
    });
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
