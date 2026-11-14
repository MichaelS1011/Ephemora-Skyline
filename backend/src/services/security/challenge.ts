import { normalizeIdentityPath } from "./finding-identity.js";

/**
 * The scoring core of the classroom mode ("Unterrichtsmodus").
 *
 * A teacher hands out an exercise folder with planted vulnerabilities and an
 * answer key — `.skyline-uebung.json` — sitting at the project root. The
 * student scans the folder with Skyline; this module answers exactly one
 * question: how many of the planted issues did the scan find?
 *
 * Two rules hold the pedagogy and they are guarded in
 * tests/uebung-scoring.test.ts:
 *
 * 1. A not-found item never carries its path, line or type anywhere near the
 *    client. A verdict holds only `id`, `points`, `categoryHint`, `hint` and
 *    `found` — the answer sheet must not become the worksheet.
 * 2. An item counts once however many findings match it, and findings on the
 *    key file itself do not count at all: the key is uploaded and scanned
 *    like any source file, and whatever the scanners report about it is not
 *    a student discovery.
 *
 * The module is pure — findings in, verdicts out, no I/O. The route that
 * reads the key from the staged copy lives in server/routes/challenge.ts.
 * The path comparison reuses `normalizeIdentityPath` from finding-identity.ts
 * so both sides of the match speak the same path shape.
 */

/** Name of the answer-key file at the exercise root. Pinned by the contract. */
export const EXERCISE_KEY_FILE = ".skyline-uebung.json";

/** The only schema version this build understands. */
export const EXERCISE_KEY_SCHEMA = "ephemora.exercise-key.v1";

/** School track of an exercise, as the teacher's key states it. */
export type ExerciseLevel = "sek1" | "sek2" | "uni";

/** A string the UI shows in both app languages. */
export interface BilingualText {
  en: string;
  de: string;
}

/** One planted issue as the teacher's key describes it. */
export interface ExerciseItem {
  id: string;
  /** Project-relative, normalized (forward slashes, no leading "./"). */
  path: string;
  type: string;
  line: number;
  lineTolerance: number;
  points: number;
  categoryHint: string;
  hint: BilingualText;
}

/** A parsed, validated `.skyline-uebung.json`. */
export interface ExerciseKey {
  schema: typeof EXERCISE_KEY_SCHEMA;
  id: string;
  title: BilingualText;
  level: ExerciseLevel;
  items: ExerciseItem[];
}

/** The finding shape scoring needs — a projection of SecurityIssue. */
export interface ChallengeFinding {
  path: string;
  type: string;
  line: number;
}

/**
 * One item's verdict. Deliberately narrow: everything not listed here must
 * never reach the client for an item that was not found.
 */
export interface ChallengeItemVerdict {
  id: string;
  points: number;
  categoryHint: string;
  hint: BilingualText;
  found: boolean;
}

/** The full scoreboard for one scan against one key. */
export interface ChallengeScore {
  exercise: { id: string; title: BilingualText; level: ExerciseLevel };
  items: ChallengeItemVerdict[];
  foundCount: number;
  totalCount: number;
  pointsEarned: number;
  pointsTotal: number;
  finished: boolean;
}

export type ChallengeKeyErrorCode = "unsupported_schema" | "malformed_key";

/** Named failure of key parsing — the route maps it to a clean 422. */
export class ChallengeKeyError extends Error {
  constructor(
    readonly code: ChallengeKeyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChallengeKeyError";
  }
}

const LEVELS: readonly string[] = ["sek1", "sek2", "uni"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badField(where: string, expected: string): never {
  throw new ChallengeKeyError("malformed_key", `exercise key ${where} must be ${expected}`);
}

function requiredString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") badField(where, "a non-empty string");
  return value;
}

function requiredInt(value: unknown, where: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min)
    badField(where, `an integer >= ${min}`);
  return value;
}

function requiredBilingual(value: unknown, where: string): BilingualText {
  if (!isRecord(value)) badField(where, "an object with non-empty en and de strings");
  return {
    en: requiredString(value["en"], `${where}.en`),
    de: requiredString(value["de"], `${where}.de`),
  };
}

function requiredRelativePath(value: unknown, where: string): string {
  const raw = requiredString(value, where);
  const normalized = normalizeIdentityPath(raw);
  if (normalized === "" || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized))
    badField(where, "a project-relative path");
  if (normalized.split("/").includes("..")) badField(where, "a path without '..' segments");
  return normalized;
}

/**
 * Validate a parsed key file. Throws `ChallengeKeyError` with a named code
 * for anything the contract does not allow — unknown schema versions are
 * reported as such, everything else as malformed. Never crashes, and the
 * returned object is a normalized copy: fields the contract does not define
 * do not survive the parse.
 */
export function parseExerciseKey(raw: unknown): ExerciseKey {
  if (!isRecord(raw)) badField("root", "a JSON object");
  if (raw["schema"] !== EXERCISE_KEY_SCHEMA) {
    const shown = typeof raw["schema"] === "string" ? `"${raw["schema"]}"` : String(raw["schema"]);
    throw new ChallengeKeyError(
      "unsupported_schema",
      `unsupported exercise key schema ${shown}, expected "${EXERCISE_KEY_SCHEMA}"`,
    );
  }

  const id = requiredString(raw["id"], "id");
  const title = requiredBilingual(raw["title"], "title");
  const level = raw["level"];
  if (typeof level !== "string" || !LEVELS.includes(level))
    badField("level", `one of ${LEVELS.join(", ")}`);

  if (!Array.isArray(raw["items"]) || raw["items"].length === 0)
    badField("items", "a non-empty array");

  const seen = new Set<string>();
  const items: ExerciseItem[] = [];
  raw["items"].forEach((candidate, index) => {
    const where = `items[${index}]`;
    if (!isRecord(candidate)) badField(where, "an object");
    const itemId = requiredString(candidate["id"], `${where}.id`);
    if (seen.has(itemId))
      throw new ChallengeKeyError(
        "malformed_key",
        `exercise key ${where}.id "${itemId}" is a duplicate`,
      );
    seen.add(itemId);
    items.push({
      id: itemId,
      path: requiredRelativePath(candidate["path"], `${where}.path`),
      type: requiredString(candidate["type"], `${where}.type`),
      line: requiredInt(candidate["line"], `${where}.line`, 1),
      lineTolerance: requiredInt(candidate["lineTolerance"], `${where}.lineTolerance`, 0),
      points: requiredInt(candidate["points"], `${where}.points`, 0),
      categoryHint: requiredString(candidate["categoryHint"], `${where}.categoryHint`),
      hint: requiredBilingual(candidate["hint"], `${where}.hint`),
    });
  });

  return { schema: EXERCISE_KEY_SCHEMA, id, title, level: level as ExerciseLevel, items };
}

/**
 * Grade a scan against a key. `findings` is the flat projection of the
 * result's vulnerabilities; findings on the key file itself are dropped
 * (see the module header). `finished` is derived, never stored: the run is
 * finished when every item is found.
 */
export function scoreChallenge(
  findings: readonly ChallengeFinding[],
  key: ExerciseKey,
): ChallengeScore {
  const usable = findings
    .map((finding) => ({ ...finding, path: normalizeIdentityPath(finding.path) }))
    .filter((finding) => finding.path !== EXERCISE_KEY_FILE);

  let foundCount = 0;
  let pointsEarned = 0;
  let pointsTotal = 0;
  const items: ChallengeItemVerdict[] = key.items.map((item) => {
    pointsTotal += item.points;
    const found = usable.some(
      (finding) =>
        finding.path === item.path &&
        finding.type === item.type &&
        Math.abs(finding.line - item.line) <= item.lineTolerance,
    );
    if (found) {
      foundCount += 1;
      pointsEarned += item.points;
    }
    return {
      id: item.id,
      points: item.points,
      categoryHint: item.categoryHint,
      hint: item.hint,
      found,
    };
  });

  return {
    exercise: { id: key.id, title: key.title, level: key.level },
    items,
    foundCount,
    totalCount: key.items.length,
    pointsEarned,
    pointsTotal,
    finished: foundCount === key.items.length,
  };
}
