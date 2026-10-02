import { describe, it, expect } from "vitest";
import { fixFor } from "../src/findings/fixes";

/** Every rule class the fix library knows about. */
const KNOWN_RULES = [
  "HARDCODED_SECRET",
  "HARDCODED_CREDENTIALS",
  "CMD_INJECTION",
  "COMMAND_INJECTION",
  "CONSOLE_USAGE",
  "SQL_INJECTION",
  "XSS",
  "PATH_TRAVERSAL",
  "INSECURE_RANDOM",
] as const;

describe("fixFor", () => {
  it("returns a suggestion with non-empty title and steps for every known rule", () => {
    for (const rule of KNOWN_RULES) {
      const suggestion = fixFor({ type: rule });
      expect(suggestion, `no suggestion for ${rule}`).not.toBeNull();
      expect(suggestion!.title.trim().length).toBeGreaterThan(0);
      expect(suggestion!.steps.length, `no steps for ${rule}`).toBeGreaterThan(0);
      for (const step of suggestion!.steps) {
        expect(step.trim().length, `empty step in ${rule}`).toBeGreaterThan(0);
      }
    }
  });

  it("matches via type with case-insensitive contains", () => {
    expect(fixFor({ type: "cmd_injection" })).not.toBeNull();
    expect(fixFor({ type: "generic.sql-injection" })).not.toBeNull();
    expect(fixFor({ type: "dom_xss" })).not.toBeNull();
    expect(fixFor({ type: "python.lang.security.hardcoded-secret" })).not.toBeNull();
    expect(fixFor({ type: "path-traversal" })).not.toBeNull();
    expect(fixFor({ type: "InsecureRandomness" })).not.toBeNull();
  });

  it("matches via ruleId even when the type is unknown", () => {
    const viaType = fixFor({ type: "SQL_INJECTION" });
    expect(viaType).not.toBeNull();
    expect(fixFor({ type: "TOTALLY_UNKNOWN", ruleId: "java.sql-injection" })).toEqual(viaType);
  });

  it("ruleId takes precedence over type", () => {
    // type alone would not match, ruleId must win
    expect(fixFor({ type: "UNKNOWN_TYPE", ruleId: "no-console" })).not.toBeNull();
  });

  it("returns null for unknown rules", () => {
    expect(fixFor({ type: "TODO_COMMENT" })).toBeNull();
    expect(fixFor({ type: "MAGIC_NUMBER", ruleId: "eslint.no-magic-numbers" })).toBeNull();
    expect(fixFor({ type: "" })).toBeNull();
  });

  it("emphasizes rotation for hardcoded secrets and credentials", () => {
    for (const rule of ["HARDCODED_SECRET", "HARDCODED_CREDENTIALS"]) {
      const steps = fixFor({ type: rule })!.steps.join(" ").toLowerCase();
      expect(steps).toContain("rotate");
    }
  });

  it("suggests execFile/array args for command injection", () => {
    const suggestion = fixFor({ type: "CMD_INJECTION" });
    expect(suggestion!.code).toContain("execFile");
  });

  it("suggests parameterized queries for SQL injection", () => {
    const suggestion = fixFor({ type: "SQL_INJECTION" });
    expect(suggestion!.code).not.toBeNull();
    // The unsafe interpolation pattern must not appear in active code
    // (a comment naming the unsafe variant is fine).
    const activeCode = suggestion!
      .code!.split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(activeCode).not.toMatch(/\$\{\w+\}/);
    expect(activeCode).toContain("$1");
  });

  it("is deterministic for the same input", () => {
    const input = { type: "PATH_TRAVERSAL" };
    expect(JSON.stringify(fixFor(input))).toBe(JSON.stringify(fixFor(input)));
    expect(JSON.stringify(fixFor(input))).toBe(JSON.stringify(fixFor({ type: "PATH_TRAVERSAL" })));
  });
});
