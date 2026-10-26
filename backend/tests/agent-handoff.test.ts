import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import type { AnalysisResult } from "../src/models/index.js";
import {
  buildHandoffLines,
  compareScans,
  handleHandoff,
  handleVerify,
} from "../src/server/routes/agent.js";
import { findingFingerprint } from "../src/services/security/finding-identity.js";

/**
 * A coding agent gets two things: a channel it can read (one finding per line,
 * keyed by the fingerprint the human's UI shows) and a way to check its own
 * work (did the finding survive a later scan?). Both are checked here against
 * synthetic results — including the case where an agent would happily believe a
 * false "fixed": a finding that only moved line is reported as moved.
 */
const hit = (over: Record<string, unknown> = {}) => ({
  type: "SQL_INJECTION",
  severity: "P0",
  score: 9,
  line: 3,
  code: 'db.query("SELECT " + x)',
  message: "query built by concatenation",
  provenance: "regex",
  cwe: "CWE-89",
  refUrl: "https://owasp.org/www-community/attacks/SQL_Injection",
  explanation: "A query is built by concatenation.",
  fix: "use placeholders",
  ...over,
});

const resultWith = (
  id: string,
  files: Array<{ path: string; vulns: Array<Record<string, unknown>> }>,
): AnalysisResult =>
  ({
    id,
    files: files.map((f) => ({ path: f.path, vulnerabilities: f.vulns.map(hit) })),
  }) as unknown as AnalysisResult;

const fpOf = (path: string, v: Record<string, unknown>): string =>
  findingFingerprint({
    path,
    type: String(v.type),
    ruleId: (v.ruleId as string) ?? String(v.type),
    line: Number(v.line),
    code: String(v.code),
    provenance: String(v.provenance),
    historyCommit: v.historyCommit as string | undefined,
  });

interface Captured {
  status: number;
  body: unknown;
  type: string;
}

const fakeRes = (): { capture: Captured; res: Response } => {
  const capture: Captured = { status: 200, body: undefined, type: "" };
  const res = {
    status(code: number) {
      capture.status = code;
      return this;
    },
    json(body: unknown) {
      capture.body = body;
      return this;
    },
    type(t: string) {
      capture.type = t;
      return this;
    },
    send(body: unknown) {
      capture.body = body;
      return this;
    },
  };
  return { capture, res: res as unknown as Response };
};

const store = {
  get: (id: string): AnalysisResult | undefined =>
    id === "vorher" ? resultWith("vorher", [{ path: "src/a.js", vulns: [hit()] }]) : undefined,
};

describe("the agent handoff", () => {
  const two = resultWith("s1", [
    { path: "src/b.js", vulns: [hit({ line: 7 })] },
    { path: "src/a.js", vulns: [hit({ line: 3 }), hit({ line: 12, type: "EVAL_USAGE" })] },
  ]);

  it("writes one line per finding, ordered by path then line", () => {
    const lines = buildHandoffLines(two);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => `${l.path}:${l.line}`)).toEqual([
      "src/a.js:3",
      "src/a.js:12",
      "src/b.js:7",
    ]);
  });

  it("keys every line by the fingerprint the panel and the SARIF use", () => {
    const lines = buildHandoffLines(two);
    expect(lines[0]!.fingerprint).toBe(fpOf("src/a.js", { ...hit(), ruleId: "SQL_INJECTION" }));
    expect(new Set(lines.map((l) => l.fingerprint)).size).toBe(3);
  });

  it("carries the reasoning and the source text of the file stays out", () => {
    const [first] = buildHandoffLines(two);
    expect(first!.cwe).toBe("CWE-89");
    expect(first!.refUrl).toContain("owasp");
    expect(first!.explanation).toContain("concatenation");
    expect(first!.fix).toBe("use placeholders");
    expect(first!.assessment).toMatch(/not a confirmed vulnerability/);
    expect(JSON.stringify(first)).not.toContain("db.query"); // the line itself is not shipped
    expect(JSON.stringify(first)).not.toContain("snippet");
  });

  it("is byte-identical when asked twice", () => {
    const once = buildHandoffLines(two)
      .map((l) => JSON.stringify(l))
      .join("\n");
    const twice = buildHandoffLines(two)
      .map((l) => JSON.stringify(l))
      .join("\n");
    expect(twice).toBe(once);
  });

  it("answers the route as ndjson or 404", () => {
    const ok = fakeRes();
    handleHandoff({ params: { id: "vorher" } } as unknown as Request, ok.res, store);
    expect(ok.capture.type).toBe("application/x-ndjson");
    expect(String(ok.capture.body).trim().split("\n")).toHaveLength(1);
    expect(String(ok.capture.body).endsWith("\n")).toBe(true);

    const missing = fakeRes();
    handleHandoff({ params: { id: "weg" } } as unknown as Request, missing.res, store);
    expect(missing.capture.status).toBe(404);
  });
});

describe("verifying an agent's own fix", () => {
  const before = resultWith("vorher", [
    { path: "src/a.js", vulns: [hit({ line: 3 }), hit({ line: 40, type: "CONSOLE_USAGE" })] },
  ]);

  it("separates present, gone and moved instead of calling everything fixed", () => {
    const same = resultWith("nachher", [
      { path: "src/a.js", vulns: [hit({ line: 3 }), hit({ line: 44, type: "CONSOLE_USAGE" })] },
    ]);
    const report = compareScans(before, same);
    expect(report.checked).toBe(2);
    expect(report.present).toHaveLength(1);
    expect(report.moved).toHaveLength(1);
    expect(report.moved[0]!.from.line).toBe(40);
    expect(report.moved[0]!.to.line).toBe(44);
    expect(report.gone).toHaveLength(0);
  });

  it("reports a vanished fingerprint as gone, and never as proof of a fix", () => {
    const cleaned = resultWith("nachher", [
      { path: "src/a.js", vulns: [hit({ line: 3 })] },
      { path: "src/b.js", vulns: [{ ...hit(), line: 9, type: "XSS" }] },
    ]);
    const report = compareScans(before, cleaned);
    expect(report.gone.map((g) => g.type)).toEqual(["CONSOLE_USAGE"]);
    expect(report.gone[0]!.path).toBe("src/a.js");
  });

  it("counts a renamed file as gone, because the path is part of the identity", () => {
    const renamed = resultWith("nachher", [
      { path: "src/a.ts", vulns: [hit({ line: 3 }), hit({ line: 40, type: "CONSOLE_USAGE" })] },
    ]);
    const report = compareScans(before, renamed);
    expect(report.present).toHaveLength(0);
    expect(report.gone).toHaveLength(2);
    expect(report.moved).toHaveLength(0);
  });

  it("answers what it was not told about instead of guessing", () => {
    const report = compareScans(before, before, ["fp:0000000000"]);
    expect(report.checked).toBe(1);
    expect(report.unknown).toEqual(["fp:0000000000"]);
  });

  it("refuses a one-sided or malformed request", async () => {
    const noAfter = fakeRes();
    const req = { body: { before: "vorher" } } as unknown as Request;
    await handleVerify(req, noAfter.res, store);
    expect(noAfter.capture.status).toBe(400);

    const wrongType = fakeRes();
    await handleVerify(
      { body: { before: "vorher", after: "x", fingerprints: "fp:1" } } as unknown as Request,
      wrongType.res,
      store,
    );
    expect(wrongType.capture.status).toBe(400);

    const missingScan = fakeRes();
    await handleVerify(
      { body: { before: "vorher", after: "später" } } as unknown as Request,
      missingScan.res,
      store,
    );
    expect(missingScan.capture.status).toBe(404);
  });
});
