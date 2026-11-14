/**
 * The classroom scoreboard, read honestly.
 *
 * `GET /api/result/<id>/challenge` answers in words the student may see — the
 * scoring itself ran server-side in `backend/src/services/security/challenge.ts`
 * — but a browser trusts no response. This module is the reading door: it
 * accepts exactly the documented shape or answers `null`, so the panel renders
 * nothing rather than half a scoreboard with undefined in it. A not-found item
 * carries only points, categoryHint and the bilingual hint — the backend never
 * sends its path, line or type, and nothing here invents one.
 *
 * Tested in `tests/challengePanel.test.ts` against these functions, not
 * against a rendered copy of them; the rendering contract itself is
 * `tests/challenge-ui.test.tsx`.
 */

export interface BilingualText {
  en: string;
  de: string;
}

/** One graded exercise item — the whole of what the client is told about it. */
export interface ChallengeItemView {
  id: string;
  points: number;
  categoryHint: string;
  hint: BilingualText;
  found: boolean;
}

export interface ChallengeView {
  exercise: { id: string; title: BilingualText; level: string };
  items: ChallengeItemView[];
  foundCount: number;
  totalCount: number;
  pointsEarned: number;
  pointsTotal: number;
  finished: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredBilingual(value: unknown): BilingualText | null {
  if (!isRecord(value)) return null;
  const en = requiredString(value["en"]);
  const de = requiredString(value["de"]);
  return en !== null && de !== null ? { en, de } : null;
}

function requiredCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function itemView(raw: unknown): ChallengeItemView | null {
  if (!isRecord(raw)) return null;
  const id = requiredString(raw["id"]);
  const points = requiredCount(raw["points"]);
  const categoryHint = requiredString(raw["categoryHint"]);
  const hint = requiredBilingual(raw["hint"]);
  const found = raw["found"];
  if (id === null || points === null || categoryHint === null || hint === null) return null;
  if (typeof found !== "boolean") return null;
  return { id, points, categoryHint, hint, found };
}

/**
 * The documented scoreboard, or null. Any field out of line — a missing hint,
 * a non-boolean `found`, a negative count — means this is not a scoreboard
 * this panel may speak from, and the panel stays silent.
 */
export function parseChallengeResponse(json: unknown): ChallengeView | null {
  if (!isRecord(json)) return null;
  const exercise = json["exercise"];
  if (!isRecord(exercise)) return null;
  const id = requiredString(exercise["id"]);
  const title = requiredBilingual(exercise["title"]);
  const level = requiredString(exercise["level"]);
  if (id === null || title === null || level === null) return null;

  if (!Array.isArray(json["items"])) return null;
  const items = json["items"].map(itemView);
  if (items.some((item) => item === null)) return null;

  const foundCount = requiredCount(json["foundCount"]);
  const totalCount = requiredCount(json["totalCount"]);
  const pointsEarned = requiredCount(json["pointsEarned"]);
  const pointsTotal = requiredCount(json["pointsTotal"]);
  if (foundCount === null || totalCount === null || pointsEarned === null || pointsTotal === null)
    return null;
  if (typeof json["finished"] !== "boolean") return null;

  return {
    exercise: { id, title, level },
    items: items as ChallengeItemView[],
    foundCount,
    totalCount,
    pointsEarned,
    pointsTotal,
    finished: json["finished"],
  };
}

/**
 * Progress as a whole percent of the points on offer. A key with no points
 * scores zero, not a division by zero, and the number never oversells: it is
 * clamped to 0–100 whatever the counts claim.
 */
export function challengeProgressPercent(view: ChallengeView): number {
  if (view.pointsTotal <= 0) return 0;
  const percent = Math.round((view.pointsEarned / view.pointsTotal) * 100);
  return Math.min(100, Math.max(0, percent));
}

/** One challenge request per stored scan — until a new scan replaces it. */
export function shouldFetchChallenge(
  analysisId: string | null,
  fetchedFor: string | null,
): boolean {
  return analysisId !== null && analysisId !== fetchedFor;
}

/** The documented route, built the way every other result call builds it. */
export function challengeFetchUrl(analysisId: string): string {
  return `/api/result/${encodeURIComponent(analysisId)}/challenge`;
}
