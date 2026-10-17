import { describe, expect, it } from "vitest";
import type { AnalysisResult, SecurityIssue } from "../src/models/index.js";
import { mapResultToCityData } from "../src/utils/cityMapper.js";
import { resultToSarif } from "../src/utils/sarif.js";
import {
  findingFingerprint,
  normalizeIdentityPath,
} from "../src/services/security/finding-identity.js";
import { makeFile, makeResult } from "./helpers/fixtures.js";

/**
 * A review verdict is only worth keeping if the finding it belongs to can be
 * named again later. Until now the name was positional: `f-<walk order>` plus
 * the index inside the file's array, so a second scan of an unchanged folder
 * could hand every verdict to a different finding — or to none.
 *
 * These tests pin the replacement: one identity, minted once, identical in the
 * panel's JSON and in the SARIF export, and untouched by anything that merely
 * reorders the walk.
 */

function makeIssue(overrides: Partial<SecurityIssue> & { line: number }): SecurityIssue {
  return {
    type: "EVAL_USAGE",
    severity: "P1",
    score: 6,
    code: "eval(payload)",
    message: "Untrusted input can reach eval.",
    provenance: "semgrep",
    ruleId: "javascript-lang.security.rules.eval.eval",
    ...overrides,
  } as SecurityIssue;
}

/** Every fingerprint the city JSON carries, keyed by `path:line`. */
function cityFingerprints(result: AnalysisResult): Map<string, string> {
  const city = mapResultToCityData(result) as unknown;
  const out = new Map<string, string>();
  // Walk the whole payload rather than trusting one field: findings live on
  // files, and files sit in the tree, in the district skylines and in
  // `additionalFiles` depending on what the render budget let through.
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const o = node as Record<string, unknown>;
    if (typeof o.path === "string" && Array.isArray(o.findings)) {
      for (const v of o.findings as { line: number; fingerprint?: string }[]) {
        if (v?.fingerprint) out.set(`${o.path}:${v.line}`, v.fingerprint);
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(city);
  return out;
}

describe("one finding, one identity", () => {
  it("names the scan that produced the city", () => {
    const city = mapResultToCityData(
      makeResult([makeFile({ path: "a.ts", vulnerabilities: [makeIssue({ line: 3 })] })], {
        id: "scan-42",
      }),
    ) as unknown as {
      analysisId?: string;
    };
    expect(city.analysisId).toBe("scan-42");
  });

  it("puts the same identity in the city JSON and in the SARIF", () => {
    const result = makeResult([
      makeFile({ path: "src/a.ts", vulnerabilities: [makeIssue({ line: 3 })] }),
      makeFile({
        path: "src/b.ts",
        vulnerabilities: [makeIssue({ line: 9, ruleId: "no-fs-read" })],
      }),
    ]);
    const inCity = cityFingerprints(result);
    const sarif = resultToSarif(result) as unknown as {
      runs: {
        automationDetails?: { id?: string };
        results: {
          partialFingerprints?: Record<string, string>;
          locations: {
            physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } };
          }[];
        }[];
      }[];
    };
    expect(sarif.runs[0]!.automationDetails?.id, "the report names its scan").toBe("scan-1");
    const inSarif = new Map<string, string>();
    for (const r of sarif.runs[0]!.results) {
      const loc = r.locations[0]?.physicalLocation;
      if (!loc) continue;
      inSarif.set(
        `${loc.artifactLocation.uri}:${loc.region.startLine}`,
        r.partialFingerprints?.primaryLocationLineHash ?? "",
      );
    }
    expect([...inSarif.keys()].length).toBeGreaterThan(0);
    for (const [key, hash] of inCity) {
      expect(inSarif.get(key), `SARIF disagrees about ${key}`).toBe(hash);
    }
  });

  it("is unmoved by the order the walk happened to return the files in", () => {
    const files = [
      makeFile({ path: "src/a.ts", vulnerabilities: [makeIssue({ line: 3 })] }),
      makeFile({ path: "src/b.ts", vulnerabilities: [makeIssue({ line: 9 })] }),
      makeFile({ path: "src/c.ts", vulnerabilities: [makeIssue({ line: 12, type: "DEBUG_LOG" })] }),
    ];
    const vorwaerts = cityFingerprints(makeResult(files));
    const rueckwaerts = cityFingerprints(makeResult([...files].reverse()));
    expect(rueckwaerts.size, "the reversed run found findings too").toBe(vorwaerts.size);
    for (const [key, hash] of vorwaerts) {
      expect(rueckwaerts.get(key), `${key} changed identity with walk order`).toBe(hash);
    }
  });

  it("does not shift the other findings when one more is added to the file", () => {
    const vorher = cityFingerprints(
      makeResult([
        makeFile({
          path: "src/a.ts",
          vulnerabilities: [makeIssue({ line: 3 }), makeIssue({ line: 8 })],
        }),
      ]),
    );
    const nachher = cityFingerprints(
      makeResult([
        makeFile({
          path: "src/a.ts",
          vulnerabilities: [makeIssue({ line: 1 }), makeIssue({ line: 3 }), makeIssue({ line: 8 })],
        }),
      ]),
    );
    for (const key of ["src/a.ts:3", "src/a.ts:8"]) {
      expect(nachher.get(key), `${key} moved because a neighbour appeared`).toBe(vorher.get(key));
    }
  });

  it("treats a reindented line as the same finding, and a moved line as a new one", () => {
    const basis = findingFingerprint({
      path: "a.ts",
      type: "EVAL_USAGE",
      ruleId: "r",
      line: 7,
      code: "  eval(  payload )  ",
    });
    const umgebrochen = findingFingerprint({
      path: "a.ts",
      type: "EVAL_USAGE",
      ruleId: "r",
      line: 7,
      code: "eval( payload )",
    });
    const verschoben = findingFingerprint({
      path: "a.ts",
      type: "EVAL_USAGE",
      ruleId: "r",
      line: 8,
      code: "eval( payload )",
    });
    expect(umgebrochen).toBe(basis);
    expect(verschoben).not.toBe(basis);
  });

  it("sees the same file behind both path shapes a scanner can report", () => {
    expect(normalizeIdentityPath(".\\src\\a.ts")).toBe("src/a.ts");
    expect(normalizeIdentityPath("./src/a.ts")).toBe("src/a.ts");
  });

  it("keeps a credential verdict across a rotated token, and hashes no secret", () => {
    const identisch = (code: string) =>
      findingFingerprint({
        path: "tests/fx.ts",
        type: "HARDCODED_SECRET",
        ruleId: "github-pat",
        line: 61,
        code,
        provenance: "gitleaks",
      });
    expect(identisch('const pat = "‹hidden›";')).toBe(identisch('const pat = "‹hidden›";'));
    // the input is the masked line — the raw value never reaches the hash
    expect(identisch('const pat = "‹hidden›";')).not.toBe(identisch('const token = "‹hidden›";'));
  });
});

/**
 * The file id is the other half of the same promise. It used to be the walk
 * position, and `fs.readdir` does not sort — so the same folder scanned twice
 * could hand `f-7` to a different file, taking every deep link and every
 * verdict with it.
 */
describe("file ids come from the path", () => {
  it("survives the files arriving in another order", () => {
    const files = [
      makeFile({ path: "src/a.ts", vulnerabilities: [makeIssue({ line: 3 })] }),
      makeFile({ path: "src/b.ts", vulnerabilities: [makeIssue({ line: 9 })] }),
      makeFile({ path: "src/c.ts", vulnerabilities: [makeIssue({ line: 12, type: "DEBUG_LOG" })] }),
    ];
    const ids = (r: AnalysisResult): Map<string, string> => {
      const city = mapResultToCityData(r) as unknown;
      const out = new Map<string, string>();
      const seen = new WeakSet<object>();
      const walk = (n: unknown): void => {
        if (!n || typeof n !== "object" || seen.has(n)) return;
        seen.add(n);
        if (Array.isArray(n)) return n.forEach(walk);
        const o = n as Record<string, unknown>;
        if (typeof o.path === "string" && typeof o.id === "string") out.set(o.path, o.id);
        for (const v of Object.values(o)) walk(v);
      };
      walk(city);
      return out;
    };
    const vorwaerts = ids(makeResult(files));
    const rueckwaerts = ids(makeResult([...files].reverse()));
    expect(vorwaerts.size, "the walker found the files").toBeGreaterThan(2);
    for (const [path, id] of vorwaerts) {
      expect(rueckwaerts.get(path), `${path} changed id with walk order`).toBe(id);
      expect(id, "an id must not be a position").toMatch(/^f-[0-9a-f]{12}$/);
    }
  });

  it("is the same id the source endpoint resolves", async () => {
    const { fileIdForPath } = await import("../src/utils/cityMapper.js");
    expect(fileIdForPath("src/a.ts")).toBe(fileIdForPath("./src/a.ts"));
    expect(fileIdForPath("src\\a.ts")).toBe(fileIdForPath("src/a.ts"));
    expect(fileIdForPath("src/a.ts")).not.toBe(fileIdForPath("src/b.ts"));
  });
});
