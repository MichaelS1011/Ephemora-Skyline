import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../src/services/security/scanner.js";
import { resolveConfig, type CustomPattern } from "../src/services/security/scan-config.js";

/**
 * `customPatterns` was validated (ReDoS canary, caps, id shape), stored on the
 * config and then never read again: the RegexAdapter was built with the built-in
 * catalogue only. A user who added a rule got a clean scan back and no way to
 * tell that their rule had never run.
 */
const rule = (over: Partial<CustomPattern> = {}): CustomPattern => ({
  id: "CUSTOM_NO_MOMENT",
  regex: "\\bmoment\\s*\\(",
  severity: "P2",
  message: "The team agreed to drop moment",
  ...over,
});

async function scanWith(config: unknown, filePath: string, content: string) {
  const scanner = new SecurityScanner(undefined, resolveConfig(config).config);
  return scanner.scanFile(filePath, content);
}

describe("a custom rule runs like a built-in one", () => {
  const src = "const a = 1;\nconst d = moment().format();\n";

  it("produces a finding when its regex matches", async () => {
    const issues = await scanWith({ profile: "custom", customPatterns: [rule()] }, "src/a.ts", src);
    const hit = issues.find((i) => i.type === "CUSTOM_NO_MOMENT");
    expect(hit).toBeDefined();
    expect(hit!.line).toBe(2);
    expect(hit!.severity).toBe("P2");
    expect(hit!.provenance).toBe("regex");
  });

  it("keeps the built-in catalogue working next to it", async () => {
    const issues = await scanWith(
      { profile: "custom", customPatterns: [rule()] },
      "src/a.ts",
      "eval(userInput);\nconst d = moment().format();\n",
    );
    expect(issues.map((i) => i.type)).toContain("EVAL_USAGE");
    expect(issues.map((i) => i.type)).toContain("CUSTOM_NO_MOMENT");
  });

  /** Same rule as the built-ins: prose about the construct is not the construct */
  it("does not fire on a comment that only mentions it", async () => {
    const issues = await scanWith(
      { profile: "custom", customPatterns: [rule()] },
      "src/a.ts",
      "// const d = moment().format();\n",
    );
    expect(issues.map((i) => i.type)).not.toContain("CUSTOM_NO_MOMENT");
  });

  it("stays inside the file extensions it asked for", async () => {
    const py = await scanWith(
      { profile: "custom", customPatterns: [rule({ fileExtensions: [".py"] })] },
      "src/a.ts",
      src,
    );
    expect(py.map((i) => i.type)).not.toContain("CUSTOM_NO_MOMENT");
    const ts = await scanWith(
      { profile: "custom", customPatterns: [rule({ fileExtensions: [".py", ".ts"] })] },
      "src/a.ts",
      src,
    );
    expect(ts.map((i) => i.type)).toContain("CUSTOM_NO_MOMENT");
  });

  it("stays inside the languages it asked for", async () => {
    const only = await scanWith(
      { profile: "custom", customPatterns: [rule({ languages: ["python"] })] },
      "src/a.ts",
      src,
    );
    expect(only.map((i) => i.type)).not.toContain("CUSTOM_NO_MOMENT");
  });

  it("is off when the profile turns its type off, like any other type", async () => {
    const issues = await scanWith(
      {
        profile: "custom",
        customPatterns: [rule()],
        disabledFindingTypes: ["CUSTOM_NO_MOMENT"],
      },
      "src/a.ts",
      src,
    );
    expect(issues.map((i) => i.type)).not.toContain("CUSTOM_NO_MOMENT");
  });

  /** The scanner is reused between scans, so a config change must take effect */
  it("follows setConfig instead of staying built with the first catalogue", async () => {
    const scanner = new SecurityScanner(undefined, resolveConfig({ profile: "standard" }).config);
    expect((await scanner.scanFile("src/a.ts", src)).map((i) => i.type)).not.toContain(
      "CUSTOM_NO_MOMENT",
    );
    scanner.setConfig(resolveConfig({ profile: "custom", customPatterns: [rule()] }).config);
    expect((await scanner.scanFile("src/a.ts", src)).map((i) => i.type)).toContain(
      "CUSTOM_NO_MOMENT",
    );
  });
});
