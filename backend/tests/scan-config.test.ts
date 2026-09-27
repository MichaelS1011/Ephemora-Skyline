import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  redosRisk,
  validateCustomPattern,
  defaultScanConfig,
  languageOfPath,
} from "../src/services/security/scan-config.js";

describe("resolveConfig", () => {
  it("resolves undefined to the standard profile (today's behavior)", () => {
    const { config, errors } = resolveConfig(undefined);
    expect(errors).toHaveLength(0);
    expect(config.profile).toBe("standard");
    expect(config.tools.semgrep).toBe(true);
    expect(config.customPatterns).toHaveLength(0);
  });

  it("quick profile disables heavy tools and applies P0 threshold", () => {
    const { config, errors } = resolveConfig({ profile: "quick" });
    expect(errors).toHaveLength(0);
    expect(config.severityThreshold).toBe("P0");
    expect(config.tools.semgrep).toBe(false);
    expect(config.disabledFindingTypes).toContain("CONSOLE_USAGE");
  });

  it("deep profile enables gitleaks history", () => {
    const { config } = resolveConfig({ profile: "deep" });
    expect(config.tools.gitleaksHistory).toBe(true);
  });

  it("user tool toggles win over presets", () => {
    const { config } = resolveConfig({ profile: "quick", tools: { semgrep: true } });
    expect(config.tools.semgrep).toBe(true); // user override
    expect(config.tools.osv).toBe(false); // preset still applies
  });

  it("rejects unknown profiles with an error list", () => {
    const { errors } = resolveConfig({ profile: "turboscan" });
    expect(errors.some((e) => e.includes("unknown profile"))).toBe(true);
  });

  it("accepts valid custom patterns and enforces the CUSTOM_ prefix", () => {
    const { config, errors } = resolveConfig({
      customPatterns: [
        {
          id: "TODO_NO_TICKET",
          regex: "TODO(?!\\s*#\\d+)",
          severity: "P2",
          message: "TODO without ticket number",
          languages: ["javascript", "typescript"],
          fileExtensions: [".ts"],
        },
      ],
    });
    expect(errors).toHaveLength(0);
    expect(config.customPatterns[0]!.id).toBe("CUSTOM_TODO_NO_TICKET");
  });

  it("rejects ReDoS-shaped and invalid custom patterns", () => {
    const { errors } = resolveConfig({
      customPatterns: [
        { id: "EVIL", regex: "(a+)+$", severity: "P1", message: "x" }, // nested quantifier
        { id: "BROKEN", regex: "([unclosed", severity: "P1", message: "x" },
        { id: "NO_MESSAGE", regex: "abc", severity: "P1", message: "" },
        { id: "BAD_CWE", regex: "abc", severity: "P1", message: "ok message", cwe: "CWE" },
      ],
    });
    expect(errors.length).toBe(4);
    expect(errors.some((e) => e.includes("ReDoS") || e.includes("backtracking"))).toBe(true);
    expect(errors.some((e) => e.includes("invalid regular expression"))).toBe(true);
  });

  it("caps pattern count and invalid severity yields default + error", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `P_${i}`,
      regex: "abc",
      severity: "P1",
      message: "msg",
    }));
    const { config, errors } = resolveConfig({ customPatterns: many });
    expect(config.customPatterns).toHaveLength(25);
    expect(errors.some((e) => e.includes("truncated"))).toBe(true);
    const { errors: sevErrors } = resolveConfig({
      customPatterns: [{ id: "S", regex: "abc", severity: "X9", message: "msg" }],
    });
    expect(sevErrors.some((e) => e.includes("P0, P1 or P2"))).toBe(true);
  });
});

describe("redosRisk", () => {
  it("flags nested quantifiers and long patterns", () => {
    expect(redosRisk("(a+)+b")).toContain("backtracking");
    expect(redosRisk("a".repeat(600))).toContain("too long");
    expect(redosRisk("^TODO(?!\\s*#\\d+).*$")).toBeNull();
  });
});

describe("validateCustomPattern", () => {
  it("canary test rejects patterns that take too long", () => {
    // (a|a)* against 'a'.repeat(2000)+'b' — classic blowup
    const err = validateCustomPattern({
      id: "SLOW",
      regex: "(a|aa)*b",
      severity: "P1",
      message: "slow pattern",
    });
    expect(err).not.toBeNull();
  });

  it("accepts a sane pattern", () => {
    expect(
      validateCustomPattern({
        id: "OK",
        regex: "console\\.log",
        severity: "P2",
        message: "console.log found",
      }),
    ).toBeNull();
  });
});

describe("languageOfPath", () => {
  it("maps extensions to language names for the scope filter", () => {
    expect(languageOfPath("src/x.py")).toBe("python");
    expect(languageOfPath("src/x.tsx")).toBe("typescript");
    expect(languageOfPath("README.md")).toBe("other");
  });
});

describe("defaultScanConfig", () => {
  it("is the identity config", () => {
    const d = defaultScanConfig();
    expect(d.severityThreshold).toBe("P2");
    // everything on EXCEPT gitleaksHistory (expensive — deep-profile opt-in)
    expect(d.tools.gitleaks).toBe(true);
    expect(d.tools.gitleaksHistory).toBe(false);
  });
});
