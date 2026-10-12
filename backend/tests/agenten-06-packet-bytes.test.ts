import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { AnalysisResult } from "../src/models/index.js";
import { buildHandoffLines, handleHandoff } from "../src/server/routes/agent.js";
import { FINDING_KNOWLEDGE } from "../src/services/security/finding-knowledge.js";
import { REGEX_PATTERNS } from "../src/services/security/adapters/regex-adapter.js";

/**
 * Every byte figure `docs/AGENTS.md` claims about the handoff line, recomputed
 * here from the serializer that writes it — no scan, no server, no network.
 *
 * The document is a public surface: it states a packet size, and the README
 * links it from the API table. A number nobody can recount is a number that
 * drifts the moment the payload changes, so the doc's example packet is built
 * from the shipped rule and knowledge tables, and the doc has to agree with
 * what `buildHandoffLines` actually emits.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const DOC_PATH = path.join(REPO, "docs/AGENTS.md");
const doc = readFileSync(DOC_PATH, "utf-8");

/** The analysis id the documented packet carries — a scan id is a uuid, any uuid. */
const ANALYSIS_ID = "956cfb77-4c3a-4d11-9c1f-7f5be2d18a04";

/** The packet the document prints: one regex SQL_INJECTION finding in src/db.js */
const pattern = REGEX_PATTERNS.find((p) => p.type === "SQL_INJECTION");
const knowledge = FINDING_KNOWLEDGE["SQL_INJECTION"];
if (!pattern || !knowledge) throw new Error("the shipped SQL_INJECTION tables moved");

const flaggedLine = 'db.query("SELECT * FROM users WHERE id = " + req.params.id)';

const finding = (line: number): Record<string, unknown> => ({
  type: pattern.type,
  severity: pattern.severity,
  score: pattern.score,
  line,
  // Input to the fingerprint, never part of the payload.
  code: flaggedLine,
  message: pattern.message,
  fix: pattern.fix,
  provenance: "regex",
  ruleId: `regex:${pattern.type}`,
  explanation: knowledge.explain,
  cwe: knowledge.cwe,
  refUrl: knowledge.refUrl,
});

const resultOf = (id: string, files: Array<{ path: string; lines: number[] }>): AnalysisResult =>
  ({
    id,
    files: files.map((f) => ({
      path: f.path,
      vulnerabilities: f.lines.map((line) => finding(line)),
    })),
  }) as unknown as AnalysisResult;

/** The four fields the document calls the reasoning fields. */
const REASONING_FIELDS = ["cwe", "refUrl", "explanation", "fix"];

const single = buildHandoffLines(resultOf(ANALYSIS_ID, [{ path: "src/db.js", lines: [1] }]))[0]!;
const packet = JSON.stringify(single);
/** UTF-8, because that is what the route sends and what `wc -c` counts. */
const packetBytes = Buffer.byteLength(packet, "utf-8");

const withoutReasoning = JSON.stringify(
  Object.fromEntries(Object.entries(single).filter(([k]) => !REASONING_FIELDS.includes(k))),
);
const reducedBytes = Buffer.byteLength(withoutReasoning, "utf-8");

interface Captured {
  body: unknown;
  type: string;
}

/** The body the route really writes: lines joined by \n, one trailing \n. */
function responseBody(result: AnalysisResult): string {
  const capture: Captured = { body: "", type: "" };
  const res = {
    type(t: string) {
      capture.type = t;
      return this;
    },
    send(body: unknown) {
      capture.body = body;
      return this;
    },
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  handleHandoff({ params: { id: "s" } } as unknown as Request, res as unknown as Response, {
    get: () => result,
  });
  return String(capture.body);
}

const threeLineBody = responseBody(
  resultOf(ANALYSIS_ID, [{ path: "src/db.js", lines: [1, 2, 3] }]),
);
const threeBytes = Buffer.byteLength(threeLineBody, "utf-8");

/** The first ```json block of the document, which is the packet it describes. */
function documentedPacket(): Record<string, unknown> {
  const start = doc.indexOf("```json");
  expect(start, "docs/AGENTS.md has no json example block").toBeGreaterThan(-1);
  const rest = doc.slice(start + "```json".length);
  const end = rest.indexOf("```");
  const text = rest.slice(0, end);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `the packet printed in docs/AGENTS.md is not valid JSON (${String(error)}):\n${text}`,
    );
  }
}

/** Every "<n> bytes" the document asserts about this channel, de-duplicated: it
 *  may name the same measured figure twice, it may not name an unmeasured one. */
function claimedByteFigures(): number[] {
  return [
    ...new Set(
      [...doc.matchAll(/(\d[\d,]*)\s*(?:bytes|KB|kB|kb)\b/g)].map((m) =>
        Number(m[1]!.replaceAll(",", "")),
      ),
    ),
  ].sort((a, b) => a - b);
}

describe("the handoff line and the bytes the document claims about it", () => {
  it("writes the packet the document prints, field for field and in order", () => {
    const documented = documentedPacket();
    expect(Object.keys(documented), "the key set and order of the printed packet").toEqual(
      Object.keys(single),
    );
    expect(documented, `the route's line for this finding is:\n${packet}`).toEqual(single);
  });

  it("states the byte figures the serializer produces, and no others", () => {
    const measured = [...new Set([packetBytes, reducedBytes, threeBytes])].sort((a, b) => a - b);
    const claimed = claimedByteFigures();
    expect(
      claimed,
      `docs/AGENTS.md must state exactly these byte figures: the line is ${packetBytes} bytes, ` +
        `${reducedBytes} without ${REASONING_FIELDS.join("/")}, ` +
        `and a three-finding response is ${threeBytes} bytes`,
    ).toEqual(measured);
  });

  it("keeps one finding to one line and a response to the bytes it says", () => {
    expect(threeLineBody.endsWith("\n")).toBe(true);
    expect(threeLineBody.trimEnd().split("\n")).toHaveLength(3);
    expect(threeBytes).toBe(packetBytes * 3 + 3);
    expect(reducedBytes).toBeLessThan(packetBytes);
  });

  it("writes the same bytes whatever order the stored findings came in", () => {
    const scrambled = resultOf("s1", [
      { path: "src/zeta.js", lines: [9] },
      { path: "src/alpha.js", lines: [40, 3] },
    ]);
    const canonical = resultOf("s1", [
      { path: "src/alpha.js", lines: [3, 40] },
      { path: "src/zeta.js", lines: [9] },
    ]);
    const scrambledBytes = responseBody(scrambled);
    expect(scrambledBytes).toBe(responseBody(canonical));
    // Sorting, not visiting: the two inputs differ, the output may not.
    expect(
      buildHandoffLines(scrambled).map((l) => `${l.path}:${l.line}`),
      "path then line, not the order the arrays held",
    ).toEqual(["src/alpha.js:3", "src/alpha.js:40", "src/zeta.js:9"]);
  });

  it("says in the document what the sort is actually keyed by", () => {
    expect(doc).toContain("path, then by line");
    expect(doc).not.toMatch(/two runs of the same scan/);
  });
});
