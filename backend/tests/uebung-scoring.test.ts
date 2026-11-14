import { describe, expect, it } from "vitest";
import {
  ChallengeKeyError,
  EXERCISE_KEY_FILE,
  EXERCISE_KEY_SCHEMA,
  parseExerciseKey,
  scoreChallenge,
  type ChallengeFinding,
  type ExerciseKey,
} from "../src/services/security/challenge.js";

/**
 * The classroom scoreboard, judged on the two rules the pedagogy rests on:
 * a not-found item leaks nothing, and a match is a match — once, tolerant to
 * the line window, and never from the key file itself. Key parsing is judged
 * as a contract: named errors, never a crash, nothing the schema does not
 * define survives.
 */

function finding(path: string, type: string, line: number): ChallengeFinding {
  return { path, type, line };
}

function key(overrides: Partial<ExerciseKey> = {}): ExerciseKey {
  return {
    schema: EXERCISE_KEY_SCHEMA,
    id: "webshop-basics",
    title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
    level: "sek1",
    items: [
      {
        id: "sql-concat",
        path: "src/db.js",
        type: "SQL_INJECTION",
        line: 12,
        lineTolerance: 6,
        points: 10,
        categoryHint: "injection",
        hint: { en: "Look how the query is built.", de: "Schau, wie die Query gebaut wird." },
      },
      {
        id: "hardcoded-key",
        path: "src/config.js",
        type: "HARDCODED_SECRET",
        line: 4,
        lineTolerance: 0,
        points: 5,
        categoryHint: "secrets",
        hint: { en: "Where does the API key come from?", de: "Woher kommt der API-Key?" },
      },
    ],
    ...overrides,
  };
}

describe("scoreChallenge — matching contract", () => {
  it("marks an item found on an exact path+type+line match", () => {
    const score = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 12)], key());
    expect(score.items[0]).toEqual({
      id: "sql-concat",
      points: 10,
      categoryHint: "injection",
      hint: { en: "Look how the query is built.", de: "Schau, wie die Query gebaut wird." },
      found: true,
    });
    expect(score.foundCount).toBe(1);
    expect(score.pointsEarned).toBe(10);
  });

  it("treats the line tolerance as inclusive on both edges", () => {
    const atLowEdge = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 6)], key());
    const atHighEdge = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 18)], key());
    expect(atLowEdge.items[0]!.found).toBe(true);
    expect(atHighEdge.items[0]!.found).toBe(true);
  });

  it("misses by one line past the tolerance", () => {
    const below = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 5)], key());
    const above = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 19)], key());
    expect(below.items[0]!.found).toBe(false);
    expect(above.items[0]!.found).toBe(false);
  });

  it("requires path AND type to agree — right line, wrong type is a miss", () => {
    const wrongType = scoreChallenge([finding("src/db.js", "COMMAND_INJECTION", 12)], key());
    const wrongPath = scoreChallenge([finding("src/other.js", "SQL_INJECTION", 12)], key());
    expect(wrongType.items[0]!.found).toBe(false);
    expect(wrongPath.items[0]!.found).toBe(false);
  });

  it("counts several findings matching one item as one", () => {
    const score = scoreChallenge(
      [
        finding("src/db.js", "SQL_INJECTION", 10),
        finding("src/db.js", "SQL_INJECTION", 12),
        finding("src/db.js", "SQL_INJECTION", 14),
      ],
      key(),
    );
    expect(score.foundCount).toBe(1);
    expect(score.pointsEarned).toBe(10);
  });

  it("matches the same path shape as finding-identity (backslashes, leading ./)", () => {
    const score = scoreChallenge(
      [
        finding(".\\src\\db.js", "SQL_INJECTION", 12),
        finding("./src/config.js", "HARDCODED_SECRET", 4),
      ],
      key(),
    );
    expect(score.foundCount).toBe(2);
    expect(score.finished).toBe(true);
  });

  it("never counts findings on the key file itself", () => {
    // The key is uploaded and scanned like any source file — its own findings
    // are not student discoveries, even when they mimic an item.
    const lookalike = finding(EXERCISE_KEY_FILE, "SQL_INJECTION", 12);
    const score = scoreChallenge([lookalike], key());
    expect(score.foundCount).toBe(0);
    expect(score.pointsEarned).toBe(0);
    expect(score.finished).toBe(false);
  });

  it("derives finished from the verdicts, not from a stored flag", () => {
    const none = scoreChallenge([], key());
    const some = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 12)], key());
    const all = scoreChallenge(
      [finding("src/db.js", "SQL_INJECTION", 12), finding("src/config.js", "HARDCODED_SECRET", 4)],
      key(),
    );
    expect(none.finished).toBe(false);
    expect(some.finished).toBe(false);
    expect(all.finished).toBe(true);
  });

  it("sums points over the key, not the findings", () => {
    const score = scoreChallenge([finding("src/config.js", "HARDCODED_SECRET", 4)], key());
    expect(score.pointsTotal).toBe(15);
    expect(score.pointsEarned).toBe(5);
    expect(score.totalCount).toBe(2);
  });
});

describe("scoreChallenge — no-leak contract", () => {
  it("carries no path, line or type on any verdict, found or not", () => {
    const score = scoreChallenge([finding("src/db.js", "SQL_INJECTION", 12)], key());
    for (const item of score.items) {
      expect(Object.keys(item).sort()).toEqual(["categoryHint", "found", "hint", "id", "points"]);
    }
    expect(JSON.stringify(score)).not.toContain("src/db.js");
    expect(JSON.stringify(score)).not.toContain("src/config.js");
    expect(JSON.stringify(score)).not.toContain("SQL_INJECTION");
  });

  it("keeps exercise metadata and counts alongside the items", () => {
    const score = scoreChallenge([], key());
    expect(score.exercise).toEqual({
      id: "webshop-basics",
      title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
      level: "sek1",
    });
    expect(Object.keys(score).sort()).toEqual([
      "exercise",
      "finished",
      "foundCount",
      "items",
      "pointsEarned",
      "pointsTotal",
      "totalCount",
    ]);
  });
});

describe("parseExerciseKey — the key file is a contract, not a suggestion", () => {
  const valid = {
    schema: EXERCISE_KEY_SCHEMA,
    id: "webshop-basics",
    title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
    level: "sek1",
    items: [
      {
        id: "sql-concat",
        path: "./src/db.js",
        type: "SQL_INJECTION",
        line: 12,
        lineTolerance: 6,
        points: 10,
        categoryHint: "injection",
        hint: { en: "Look how the query is built.", de: "Schau, wie die Query gebaut wird." },
      },
    ],
  };

  it("accepts a well-formed key and normalizes item paths", () => {
    const parsed = parseExerciseKey(valid);
    expect(parsed.items[0]!.path).toBe("src/db.js");
    expect(parsed.schema).toBe(EXERCISE_KEY_SCHEMA);
  });

  it("names an unknown schema version instead of guessing", () => {
    const error = (() => {
      try {
        parseExerciseKey({ ...valid, schema: "ephemora.exercise-key.v2" });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ChallengeKeyError);
    expect((error as ChallengeKeyError).code).toBe("unsupported_schema");
    expect((error as ChallengeKeyError).message).toContain("ephemora.exercise-key.v2");
  });

  const rejects: Array<[string, unknown]> = [
    ["null", null],
    ["a number", 42],
    ["an array", []],
    ["a missing id", { ...valid, id: "" }],
    ["a missing title", { ...valid, title: { en: "x" } }],
    ["an unknown level", { ...valid, level: "gymnasium" }],
    ["an empty items array", { ...valid, items: [] }],
    ["items that is not an array", { ...valid, items: "sql-concat" }],
    ["an item without a line", { ...valid, items: [{ ...valid.items[0], line: "12" }] }],
    ["a negative line", { ...valid, items: [{ ...valid.items[0], line: 0 }] }],
    ["a negative tolerance", { ...valid, items: [{ ...valid.items[0], lineTolerance: -1 }] }],
    ["a negative points value", { ...valid, items: [{ ...valid.items[0], points: -5 }] }],
    ["an absolute item path", { ...valid, items: [{ ...valid.items[0], path: "/etc/passwd" }] }],
    ["an escaping item path", { ...valid, items: [{ ...valid.items[0], path: "../secret.js" }] }],
    ["a missing hint language", { ...valid, items: [{ ...valid.items[0], hint: { en: "x" } }] }],
    ["a duplicate item id", { ...valid, items: [valid.items[0], valid.items[0]] }],
  ];
  it.each(rejects)("rejects %s with a named malformed_key error", (_name, raw) => {
    expect(() => parseExerciseKey(raw)).toThrowError(ChallengeKeyError);
    try {
      parseExerciseKey(raw);
    } catch (e) {
      expect((e as ChallengeKeyError).code).toBe("malformed_key");
    }
  });

  it("drops fields the contract does not define", () => {
    const parsed = parseExerciseKey({
      ...valid,
      solution: "src/db.js line 12",
      items: [{ ...valid.items[0], answer: "just concatenate" }],
    });
    expect(parsed).not.toHaveProperty("solution");
    expect(Object.keys(parsed.items[0]!).sort()).toEqual([
      "categoryHint",
      "hint",
      "id",
      "line",
      "lineTolerance",
      "path",
      "points",
      "type",
    ]);
  });
});
