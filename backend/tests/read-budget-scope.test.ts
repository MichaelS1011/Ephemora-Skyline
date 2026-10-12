import { describe, it, expect } from "vitest";
import { READ_BUDGET_EXEMPT } from "../src/server/read-budget.js";

/**
 * Befund 6 was "a 429 in normal use, not in an attack". The exemption list
 * fixed the progress poll and left two calls of the same shape inside the
 * budget: the test runner's once-a-second poll of its own run, and the shipped
 * rule-pack list. A ten-minute project suite spent all 600 slots and the read
 * that came afterwards — the user's city — answered 429.
 *
 * The list is a pattern, so it is checked against the real route names rather
 * than against a paraphrase of them.
 */
const test = (url: string): boolean => READ_BUDGET_EXEMPT.test(url);

describe("what the read budget is not for", () => {
  it("does not charge a running scan for asking about itself", () => {
    expect(test("/api/status/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0")).toBe(true);
    expect(test("/api/tests/run/run-17")).toBe(true);
    expect(test("/api/rule-packs")).toBe(true);
    expect(test("/api/analyze-local")).toBe(true);
    expect(test("/api/analyze-local/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/cancel")).toBe(true);
  });

  it("still counts every read of the user's own data", () => {
    for (const url of [
      "/api/result/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
      "/api/result/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/city",
      "/api/result/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/sarif",
      "/api/result/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/handoff",
      "/api/result/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/source/f-3",
      "/api/cities/default",
      "/api/footprint",
    ]) {
      expect(test(url), `${url} must stay charged`).toBe(false);
    }
  });

  it("does not let a prefixed path slip into the exemption", () => {
    // A pattern that matched a prefix would exempt the wrong route entirely.
    expect(test("/api/tests/run/run-1/log")).toBe(false);
    expect(test("/api/statusx")).toBe(false);
    expect(test("/api/rule-packs/ephemora-core")).toBe(false);
    expect(test("/api/../etc/passwd")).toBe(false);
  });
});
