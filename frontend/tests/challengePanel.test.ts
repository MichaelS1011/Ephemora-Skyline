import { describe, expect, it } from "vitest";
import {
  challengeFetchUrl,
  challengeProgressPercent,
  parseChallengeResponse,
  shouldFetchChallenge,
  type ChallengeView,
} from "../src/findings/challengePanel";

/**
 * The reading door for the classroom scoreboard.
 *
 * The scoring itself is judged in `backend/tests/uebung-scoring.test.ts`;
 * what lives here is the client's half: accept exactly the documented shape
 * or say nothing, keep the progress bar an honest percent, and ask once per
 * scan. The rendering half is `tests/challenge-ui.test.tsx`.
 */

function board(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exercise: {
      id: "webshop-basics",
      title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
      level: "sek1",
    },
    items: [
      {
        id: "sql-concat",
        points: 10,
        categoryHint: "injection",
        hint: { en: "Where does the query get built?", de: "Wo wird die Query gebaut?" },
        found: true,
      },
      {
        id: "hardcoded-key",
        points: 5,
        categoryHint: "secrets",
        hint: { en: "What ships in plain text?", de: "Was steht im Klartext dabei?" },
        found: false,
      },
    ],
    foundCount: 1,
    totalCount: 2,
    pointsEarned: 10,
    pointsTotal: 15,
    finished: false,
    ...overrides,
  };
}

/** A view parsed from the default board, for the derivation tests. */
function view(overrides: Partial<ChallengeView> = {}): ChallengeView {
  const parsed = parseChallengeResponse(board());
  if (parsed === null) throw new Error("the default board must parse");
  return { ...parsed, ...overrides };
}

describe("parseChallengeResponse", () => {
  it("passes a valid scoreboard through unchanged", () => {
    expect(parseChallengeResponse(board())).toEqual({
      exercise: {
        id: "webshop-basics",
        title: { en: "Webshop basics", de: "Webshop-Grundlagen" },
        level: "sek1",
      },
      items: [
        {
          id: "sql-concat",
          points: 10,
          categoryHint: "injection",
          hint: { en: "Where does the query get built?", de: "Wo wird die Query gebaut?" },
          found: true,
        },
        {
          id: "hardcoded-key",
          points: 5,
          categoryHint: "secrets",
          hint: { en: "What ships in plain text?", de: "Was steht im Klartext dabei?" },
          found: false,
        },
      ],
      foundCount: 1,
      totalCount: 2,
      pointsEarned: 10,
      pointsTotal: 15,
      finished: false,
    });
  });

  it("keeps fields it does not speak, so a newer server still reads", () => {
    const withExtra = board({
      exercise: {
        id: "webshop-basics",
        title: { en: "T", de: "T" },
        level: "sek1",
        sponsor: "nobody",
      },
    });
    withExtra["futureFlag"] = true;
    const parsed = parseChallengeResponse(withExtra);
    expect(parsed).not.toBeNull();
    expect(parsed?.exercise.id).toBe("webshop-basics");
  });

  const rejects: ReadonlyArray<[string, () => Record<string, unknown> | unknown]> = [
    ["null", () => null],
    ["a string", () => "scoreboard"],
    ["an array", () => []],
    ["an exercise that is not an object", () => board({ exercise: "webshop" })],
    [
      "an exercise id that is empty",
      () => board({ exercise: { id: "", title: { en: "a", de: "b" }, level: "sek1" } }),
    ],
    [
      "a title missing German",
      () => board({ exercise: { id: "x", title: { en: "a" }, level: "sek1" } }),
    ],
    [
      "a title with an empty string",
      () => board({ exercise: { id: "x", title: { en: "a", de: "" }, level: "sek1" } }),
    ],
    ["a missing level", () => board({ exercise: { id: "x", title: { en: "a", de: "b" } } })],
    ["items that are not an array", () => board({ items: {} })],
    [
      "an item without a hint",
      () => board({ items: [{ id: "a", points: 1, categoryHint: "x", found: true }] }),
    ],
    [
      "an item whose hint is not bilingual",
      () =>
        board({
          items: [{ id: "a", points: 1, categoryHint: "x", hint: { en: "a" }, found: true }],
        }),
    ],
    [
      "an item whose found is not a boolean",
      () =>
        board({
          items: [
            { id: "a", points: 1, categoryHint: "x", hint: { en: "a", de: "b" }, found: "yes" },
          ],
        }),
    ],
    [
      "an item with negative points",
      () =>
        board({
          items: [
            { id: "a", points: -1, categoryHint: "x", hint: { en: "a", de: "b" }, found: true },
          ],
        }),
    ],
    [
      "an item with a fractional points value",
      () =>
        board({
          items: [
            { id: "a", points: 1.5, categoryHint: "x", hint: { en: "a", de: "b" }, found: true },
          ],
        }),
    ],
    ["a missing foundCount", () => board({ foundCount: undefined })],
    ["a negative totalCount", () => board({ totalCount: -2 })],
    ["a fractional pointsEarned", () => board({ pointsEarned: 3.5 })],
    ["a missing finished", () => board({ finished: undefined })],
    ["a finished that is a number", () => board({ finished: 0 })],
  ];

  it.each(rejects)("rejects %s instead of half-printing it", (_name, make) => {
    expect(parseChallengeResponse(make())).toBeNull();
  });
});

describe("challengeProgressPercent", () => {
  it("reads points, not item counts, and rounds", () => {
    // 10 of 15 points is 67 % — even though it is also 1 of 2 items, which
    // would have said 50.
    expect(challengeProgressPercent(view())).toBe(67);
  });

  it("says zero, not division by zero, when the key offers no points", () => {
    expect(challengeProgressPercent(view({ pointsTotal: 0, pointsEarned: 0 }))).toBe(0);
  });

  it("never oversells past the whole bar", () => {
    expect(challengeProgressPercent(view({ pointsEarned: 20 }))).toBe(100);
  });

  it("is full when everything is found", () => {
    expect(challengeProgressPercent(view({ pointsEarned: 15 }))).toBe(100);
  });
});

describe("shouldFetchChallenge", () => {
  it("asks once for a loaded scan and never again for the same id", () => {
    expect(shouldFetchChallenge("scan-1", null)).toBe(true);
    expect(shouldFetchChallenge("scan-1", "scan-1")).toBe(false);
  });

  it("asks again when a new scan replaces the old one", () => {
    expect(shouldFetchChallenge("scan-2", "scan-1")).toBe(true);
  });

  it("asks nobody for no scan", () => {
    expect(shouldFetchChallenge(null, null)).toBe(false);
    expect(shouldFetchChallenge(null, "scan-1")).toBe(false);
  });
});

describe("challengeFetchUrl", () => {
  it("builds the documented route and encodes the id", () => {
    expect(challengeFetchUrl("scan-1")).toBe("/api/result/scan-1/challenge");
    expect(challengeFetchUrl("a b/c")).toBe("/api/result/a%20b%2Fc/challenge");
  });
});
