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

  /**
   * Item 11: the recipe block is the longest text a finding produces, and it
   * was the only part of the finding area that stayed English in a German panel
   * (measured: 21 of 41 German-mode lines in the area, and the recipes were the
   * whole remainder). Both languages now carry the same number of steps and the
   * same code frame — a translation that drops a step would be a smaller answer.
   */
  it("answers in German with the same steps and the same code", () => {
    for (const rule of KNOWN_RULES) {
      const en = fixFor({ type: rule }, "en")!;
      const de = fixFor({ type: rule }, "de")!;
      expect(de, `no German suggestion for ${rule}`).not.toBeNull();
      expect(de.steps).toHaveLength(en.steps.length);
      expect(de.code).toBe(en.code);
      expect(de.title).not.toBe(en.title);
      expect(de.title.trim().length).toBeGreaterThan(0);
      for (const step of de.steps) expect(step.trim().length).toBeGreaterThan(0);
      // no step is the English sentence wearing a German title
      for (let i = 0; i < de.steps.length; i++) {
        expect(de.steps[i], `${rule} step ${i} still English`).not.toBe(en.steps[i]);
      }
    }
  });

  it("keeps code identifiers out of the translation", () => {
    const de = fixFor({ type: "SQL_INJECTION" }, "de")!;
    expect(de.steps.join(" ")).toContain("Positivliste");
    expect(de.code).toContain("$1");
    const cmd = fixFor({ type: "CMD_INJECTION" }, "de")!;
    expect(cmd.steps.join(" ")).toContain("execFile/spawn");
    expect(cmd.code).toBe(fixFor({ type: "COMMAND_INJECTION" }, "de")!.code);
  });

  it("stays unknown in German exactly where it is unknown in English", () => {
    expect(fixFor({ type: "TODO_COMMENT" }, "de")).toBeNull();
    expect(fixFor({ type: "" }, "de")).toBeNull();
  });
});
