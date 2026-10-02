import { describe, expect, it } from "vitest";
import { estimateCyclomaticComplexity as cx } from "../src/services/analyzer/metrics.js";

/**
 * The file-level cyclomatic number is not decoration: cityMapper ships it as
 * `cyclomaticComplexity` and mapping.ts turns it into BUILDING HEIGHT (45 % of
 * the synthetic-complexity sum, saturating at 25). So every error in this
 * counter is a metre of facade. These tests pin the property the geometry
 * depends on: the number counts decision points, and nothing else.
 */
describe("estimateCyclomaticComplexity", () => {
  it("scores straight-line code as 1", () => {
    expect(cx("const a = 1; return a + 2;")).toBe(1);
    expect(cx("")).toBe(1);
  });

  it("counts each control-flow decision exactly once", () => {
    expect(cx("if (a) {}")).toBe(2);
    expect(cx("for (let i = 0; i < n; i++) {}")).toBe(2);
    expect(cx("while (a) {}")).toBe(2);
    expect(cx("try { x() } catch (e) { y() }")).toBe(2);
    expect(cx("switch (a) { case 1: break; case 2: break; }")).toBe(3);
  });

  it("counts a boolean operator per branch it introduces", () => {
    expect(cx("if (a && b) {}")).toBe(3);
    expect(cx("if (a || b || c) {}")).toBe(4);
    expect(cx("const v = a ?? b;")).toBe(2);
    expect(cx("const v = a ? b : c;")).toBe(2);
  });

  it("treats else-if as one decision, not two", () => {
    expect(cx("if (a) {} else if (b) {} else {}")).toBe(4);
  });

  it("ignores code-shaped words inside comments", () => {
    const withComments = `
      // if (a) { for (;;) {} }
      /* while (x) { case 1: catch (e) { a && b || c ? d : e } } */
      /**
       * @returns the thing
       * if you want it
       */
      const a = 1;
    `;
    expect(cx(withComments)).toBe(1);
  });

  it("ignores code-shaped words inside strings and templates", () => {
    expect(cx('const s = "if (a) { for (;;) } while && || ??";')).toBe(1);
    expect(cx("const s = `a && b || c ? d : e`;")).toBe(1);
    expect(cx("const s = 'it\\'s if else';")).toBe(1);
  });

  it("is invariant to formatting", () => {
    const flat = "function f(a){if(a){for(let i=0;i<a;i++){if(a&&i){return 1}}}}";
    const pretty = [
      "function f(a) {",
      "  if (a) {",
      "    for (let i = 0; i < a; i++) {",
      "      if (a && i) {",
      "        return 1;",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    expect(cx(pretty)).toBe(cx(flat));
    expect(cx(pretty)).toBe(5);
  });

  it("does not read TypeScript syntax as ternaries", () => {
    expect(cx("function f(a?: number) { return a?.toFixed(2) }")).toBe(1);
    expect(cx("type T = { a?: string; b?: number; c?: boolean }")).toBe(1);
    expect(cx("const v = a?.b?.c ?? d")).toBe(2);
  });

  it("counts python's own decision spellings", () => {
    expect(cx("if a and b or c:\n    pass", "Python")).toBe(4);
    expect(cx("if a:\n    pass\nelif b:\n    pass\nelse:\n    pass", "Python")).toBe(4);
    expect(cx("for x in xs:\n    pass", "Python")).toBe(2);
    expect(cx("try:\n    x()\nexcept E as e:\n    y()", "Python")).toBe(2);
    // # is a comment in python, and 'and' inside a string is not a decision
    expect(cx("# if a and b\nx = 'and or if'\n", "Python")).toBe(1);
  });

  it("never scores below 1 whatever the input", () => {
    expect(cx("} } } else else else //", "Python")).toBeGreaterThanOrEqual(1);
  });
});
