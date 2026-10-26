import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult } from "../src/models/index.js";
import {
  compareScans,
  fingerprintIndex,
  handleVerify,
  type VerifyReport,
} from "../src/server/routes/agent.js";
import { findingFingerprint } from "../src/services/security/finding-identity.js";

/**
 * `docs/AGENTS.md` promises a coding agent four verdicts. Four verdicts are four
 * branches of `compareScans`, so each one is driven here by the branch it takes,
 * and the document is held to what those branches actually do — not to a number
 * somebody remembered from one fix on one repository.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const doc = readFileSync(path.join(REPO, "docs/AGENTS.md"), "utf-8");
/** Line wrapping is prose, not claim: compare against the flattened text. */
const flat = doc.replace(/\s+/g, " ");

const hit = (over: Record<string, unknown> = {}) => ({
  type: "SQL_INJECTION",
  severity: "P0",
  score: 9,
  line: 3,
  code: 'db.query("SELECT " + x)',
  message: "query built by concatenation",
  provenance: "regex",
  ruleId: "regex:SQL_INJECTION",
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

const fp = (path: string, v: Record<string, unknown>): string =>
  findingFingerprint({
    path,
    type: String(v.type),
    ruleId: (v.ruleId as string) ?? String(v.type),
    line: Number(v.line),
    code: String(v.code),
    provenance: String(v.provenance),
  });

const SQL = hit();
const MOVER = hit({ line: 40, type: "CONSOLE_USAGE", ruleId: "regex:CONSOLE_USAGE" });
const OTHER = hit({ line: 7, type: "XSS", ruleId: "regex:XSS" });

const before = resultWith("vorher", [
  { path: "src/a.js", vulns: [SQL, MOVER] },
  { path: "src/b.js", vulns: [OTHER] },
]);

describe("the four verdicts are branches, and the document says which", () => {
  it("present: the later scan still holds the same fingerprint", () => {
    const after = resultWith("nachher", [{ path: "src/a.js", vulns: [SQL] }]);
    const report = compareScans(before, after, [fp("src/a.js", SQL)]);
    expect(report.present.map((p) => p.path)).toEqual(["src/a.js"]);
    expect(report.gone).toHaveLength(0);
    expect(report.moved).toHaveLength(0);
    expect(report.unknown).toHaveLength(0);
  });

  it("gone: the rule left the path altogether, and that is all the report says", () => {
    const after = resultWith("nachher", [{ path: "src/c.js", vulns: [] }]);
    const report = compareScans(before, after, [fp("src/a.js", MOVER)]);
    expect(report.gone.map((g) => g.type)).toEqual(["CONSOLE_USAGE"]);
    expect(report.present).toHaveLength(0);
    expect(report.moved).toHaveLength(0);
  });

  it("moved: same path, same rule id, another line — never counted as gone", () => {
    const after = resultWith("nachher", [
      {
        path: "src/a.js",
        vulns: [SQL, hit({ line: 44, type: "CONSOLE_USAGE", ruleId: "regex:CONSOLE_USAGE" })],
      },
    ]);
    const report = compareScans(before, after, [fp("src/a.js", MOVER)]);
    expect(report.moved).toHaveLength(1);
    expect(report.gone).toHaveLength(0);
    expect(report.moved[0]!.from.line).toBe(40);
    expect(report.moved[0]!.to.line).toBe(44);
    expect(report.moved[0]!.to.ruleId).toBe("regex:CONSOLE_USAGE");
  });

  it("unknown: a fingerprint the before-scan never held is answered, not guessed", () => {
    const report = compareScans(before, before, ["0000000000000000"]);
    expect(report.checked).toBe(1);
    expect(report.unknown).toEqual(["0000000000000000"]);
    expect(report.present).toHaveLength(0);
    expect(report.gone).toHaveLength(0);
    expect(report.moved).toHaveLength(0);
  });

  it("a renamed file is gone, because the path is half of the identity", () => {
    const renamed = resultWith("nachher", [{ path: "src/renamed.js", vulns: [SQL, MOVER, OTHER] }]);
    const report = compareScans(before, renamed);
    expect(report.present).toHaveLength(0);
    expect(report.moved).toHaveLength(0);
    expect(report.gone).toHaveLength(3);
  });

  it("a silenced finding is gone too — the comparison has no third state for it", () => {
    const silenced = resultWith("nachher", [
      { path: "src/a.js", vulns: [SQL] },
      { path: "src/b.js", vulns: [OTHER] },
    ]);
    const report = compareScans(before, silenced);
    expect(report.gone.map((g) => g.type)).toEqual(["CONSOLE_USAGE"]);
    expect(report.moved).toHaveLength(0);
  });

  it("asks nothing and gets everything: without a list, before is the list", () => {
    const report = compareScans(before, before);
    expect(report.checked).toBe(fingerprintIndex(before).size);
    expect(report.present).toHaveLength(3);
    expect(report.unknown).toHaveLength(0);
  });

  it("answers with exactly the fields the document names", () => {
    const report = compareScans(before, before);
    expect(Object.keys(report)).toEqual([
      "before",
      "after",
      "checked",
      "present",
      "gone",
      "moved",
      "unknown",
    ]);
  });

  it("names each verdict by the branch that produces it, in the document too", () => {
    expect(flat).toContain("four branches of one comparison");
    expect(flat).toContain("is `moved`, never `gone`");
    expect(flat).toContain("A renamed file and a silenced finding do land in `gone`");
    expect(flat).toContain("the path is part of the finding's identity");
    expect(flat).toContain("`gone` says only that this fingerprint is not in the later scan");
    expect(flat).toContain("not proof of a fix");
    expect(flat).toContain("`before`, `after`, `checked`");
  });

  it("holds no verdict number that no test recomputes", () => {
    expect(doc).not.toMatch(/Measured on a real fix/);
    expect(doc).not.toMatch(/present\s+\d+\s*·\s*gone\s+\d+/);
    expect(doc).not.toMatch(/·\s*(?:gone|present|moved|unknown)\s+\d+/);
  });
});

/**
 * `unknown` is only reachable when the caller names fingerprints, so the
 * document has to show the field — a verdict it describes but never explains how
 * to trigger is a verdict a reader cannot use.
 */
describe("what a verify request may ask for", () => {
  const after = resultWith("nachher", [{ path: "src/a.js", vulns: [SQL] }]);
  const store = {
    get: (id: string): AnalysisResult | undefined =>
      id === before.id ? before : id === after.id ? after : undefined,
  };

  async function verify(
    body: Record<string, unknown>,
  ): Promise<{ status: number; report: VerifyReport }> {
    const capture: { status: number; report: unknown } = { status: 200, report: undefined };
    const res = {
      status(code: number) {
        capture.status = code;
        return this;
      },
      json(value: unknown) {
        capture.report = value;
        return this;
      },
      type() {
        return this;
      },
      send(value: unknown) {
        capture.report = value;
        return this;
      },
    };
    await handleVerify({ body } as unknown as Request, res as unknown as Response, store);
    return capture as { status: number; report: VerifyReport };
  }

  it("checks only the fingerprints the caller names", async () => {
    const asked = await verify({
      before: before.id,
      after: after.id,
      fingerprints: [fp("src/a.js", SQL), "0000000000000000"],
    });
    expect(asked.status).toBe(200);
    expect(asked.report.checked).toBe(2);
    expect(asked.report.present).toHaveLength(1);
    expect(asked.report.gone).toHaveLength(0);
    expect(asked.report.unknown).toEqual(["0000000000000000"]);
  });

  it("without the list, the before-scan is the list", async () => {
    const all = await verify({ before: before.id, after: after.id });
    expect(all.report.checked).toBe(3);
    expect(all.report.gone.map((g: { type: string }) => g.type).sort()).toEqual([
      "CONSOLE_USAGE",
      "XSS",
    ]);
    expect(all.report.unknown).toHaveLength(0);
  });

  it("shows the field in the document, so `unknown` is reachable", () => {
    expect(flat).toContain('"fingerprints"');
    expect(flat).toContain("Only the fingerprints the caller names are checked");
    expect(flat).toContain("every finding of the before-scan is checked");
  });

  /** The handler reads 2000 of them and no more — a number the document carries. */
  it("stops reading a fingerprint list at the number the document says", async () => {
    const asked = Array.from({ length: 2001 }, (_, i) => `fp-${i}`);
    const report = (await verify({ before: before.id, after: before.id, fingerprints: asked }))
      .report;
    expect(report.checked).toBe(2000);
    expect(report.unknown).toHaveLength(2000);
    expect(flat).toContain("up to 2000 fingerprints");
  });
});
