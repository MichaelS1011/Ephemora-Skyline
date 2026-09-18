import { describe, it, expect } from "vitest";
import { RegexAdapter } from "../src/services/security/adapters/regex-adapter.js";

describe("RegexAdapter noise aggregation", () => {
  const adapter = new RegexAdapter();

  it("aggregates repeated CONSOLE_USAGE into one finding with count", () => {
    const content = [
      'console.log("a");',
      'console.log("b");',
      'console.log("c");',
      'console.log("d");',
      'console.log("e");',
    ].join("\n");
    const issues = adapter.scanFile("src/chatty.ts", content);
    const consoleIssues = issues.filter((i) => i.type === "CONSOLE_USAGE");
    expect(consoleIssues).toHaveLength(1);
    expect(consoleIssues[0]!.message).toContain("×5");
    expect(consoleIssues[0]!.line).toBe(1);
  });

  it("aggregates LOOSE_EQUALITY but keeps real findings untouched", () => {
    const content = 'if (a == "1") {}\nif (b == "2") {}\nif (c == "3") {}\neval(userInput);';
    const issues = adapter.scanFile("src/mixed.ts", content);
    const loose = issues.filter((i) => i.type === "LOOSE_EQUALITY");
    expect(loose).toHaveLength(1);
    expect(loose[0]!.message).toContain("×3");
    const evalIssues = issues.filter((i) => i.type === "EVAL_USAGE");
    expect(evalIssues).toHaveLength(1);
    expect(evalIssues[0]!.message).not.toContain("×");
  });

  it("still flags user-input concatenation into ../ paths", () => {
    const content = `const p = userInput + '/../../etc/passwd';`;
    const issues = adapter.scanFile("src/traversal.ts", content);
    expect(issues.some((i) => i.type === "PATH_TRAVERSAL")).toBe(true);
  });
});
