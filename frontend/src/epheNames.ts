import { bucketKeyFor } from "./reviews";
import { readStoredJson, type StoredRead } from "./storageRead";

/**
 * Names the reader gave to residents, persisted local-first — the same shape
 * `frontend/src/reviews.ts` uses for verdicts: one localStorage bucket per
 * project, no account, nothing sent anywhere.
 *
 * Two rules make the storage honest rather than merely convenient:
 *
 * - **Only a plot-address is durable.** `plot:<file id>#<seat>` is derived from
 *   a path, so the same folder re-scanned gives the same address and the name
 *   finds its resident again. `street:<n>` is a crowd number of one level;
 *   storing it would wake a stranger under the right name tomorrow, so those
 *   names stay in the session and the card says so.
 * - **A name that did not reach storage is reported as not reaching storage.**
 *   The write returns whether it worked, because a field whose hint promises
 *   "this project" while the quota silently swallowed the value is the exact
 *   defect the verdict store already had to fix.
 */

const PREFIX = "codecity-ephe-names:";

/** What the card's field accepts, and what the reader keeps. */
export const NAME_MAX = 24;

/**
 * The one shape a name takes — measured, not assumed. Before this rule a name
 * could carry `U+0000`, a zero-width space, a newline in its middle and a bidi
 * override at its end (all four measured in `tests/ephe-names.test.ts`), and
 * `slice(0, 24)` counted UTF-16 code units, so it cut an emoji family in half
 * and left a joiner holding nothing.
 *
 * What goes: every control character, every format character, any lone
 * surrogate, and every run of whitespace longer than one space — an interior
 * newline must not break the line the name is drawn on, and it has to leave a
 * space behind rather than weld two words together. The one exception is the
 * zero-width joiner between two picture characters, which is what holds a
 * family emoji together; the branch that applies it carries the reason.
 *
 * The limit counts characters, not code units, so the field, the store and the
 * next reload all keep the same word.
 *
 * Not dead code, the whitespace part: a text input sanitises its own value and
 * drops `\n` and `\r` before any script sees them (measured in the vitrine's
 * field), so the case this rule catches is the one the field never shows —
 * a value that arrives from storage, from another surface, or from a future
 * paste path.
 */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;

export function normaliseName(value: string | null): string {
  if (!value) return "";
  // Whitespace first, so an interior newline leaves a space behind rather than
  // welding two words together. `White_Space`, not JavaScript's `\s`: the latter
  // still counts U+FEFF as whitespace, which would turn a byte order mark into a
  // space instead of the nothing it is.
  const cps = [...value.replace(/\p{White_Space}+/gu, " ").trim()];
  const kept: string[] = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i] ?? "";
    if (c === "\u200d") {
      // The joiner survives only between two picture characters — that is what
      // holds a family emoji together. Between letters it is invisible and does
      // nothing, so keeping it there would let "ab" and "a\u200db" be two names
      // that look identical, which is the defect this rule exists to remove.
      if (PICTOGRAPHIC.test(cps[i - 1] ?? "") && PICTOGRAPHIC.test(cps[i + 1] ?? "")) kept.push(c);
      continue;
    }
    if (INVISIBLE.test(c)) continue;
    kept.push(c);
  }
  while (kept.length > NAME_MAX) kept.pop();
  // A cut can strand a joiner without its partner; it is not a name's last word.
  while (kept.at(-1) === "\u200d") kept.pop();
  return kept.join("");
}

/** Names per project. A resident is a curiosity, not a workflow: nobody needs
 *  two hundred of them, and an uncapped map is an unbounded write. */
export const NAMES_CAP = 200;

interface CityBucket {
  repo: { owner: string; name: string };
  tree?: { children?: Array<{ name?: string }> };
}

/** Whether a name for this address can outlive the session. */
export function isDurableAddress(key: string): boolean {
  return key.startsWith("plot:");
}

/**
 * The shape rule every reader of a names bucket applies — the writer's own
 * rules, applied on the way in (durable address, string value, normalised
 * non-empty name). Honouring is not refusing: entries the current rules drop
 * keep the read a `read`; bytes that parse into a shape no bucket has are
 * `undefined`, which `readStoredJson` answers `unreadable` and parks verbatim.
 */
export function honouredNames(parsed: unknown): Record<string, string> | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isDurableAddress(key)) continue;
    if (typeof value !== "string") continue;
    // The writer's own rule, applied on the way in. The old filter measured
    // `value.length <= NAME_MAX` in code units, so a name the writer was happy
    // to keep — 24 characters of emoji — was silently dropped by the reader.
    const name = normaliseName(value);
    if (name) clean[key] = name;
  }
  return clean;
}

/**
 * Read a project's names as three states — the one mechanism of
 * `storageRead.ts`, per project bucket (each bucket keeps its own
 * `<key>:unreadable` slot, because the names of one project are not another
 * project's to preserve).
 *
 * The old answer to unreadable bytes was `{}` — "you never named anyone" —
 * and the next `saveEpheName` wrote that emptiness over the reader's own
 * names with no word. That is the class failure: the difference between
 * never-named and unreadable must be answerable, and the bytes survive the
 * next save verbatim. Dropping entries the current rules would not write
 * stays a `read` — honouring is not refusing.
 */
export function loadEpheNamesRead(
  city: CityBucket | null | undefined,
): StoredRead<Record<string, string>> {
  if (!city) return { state: "absent" };
  const bucket = bucketKeyFor(city);
  if (!bucket) return { state: "absent" };
  return readStoredJson<Record<string, string>>(PREFIX + bucket, honouredNames);
}

/** Read a project's names, dropping anything the current rules would not write. */
export function loadEpheNames(city: CityBucket | null | undefined): Record<string, string> {
  const stored = loadEpheNamesRead(city);
  return stored.state === "read" ? stored.value : {};
}

/**
 * Write one name — or remove it when the field is emptied. Returns whether
 * storage took the change; `false` means the map on screen is a session copy.
 */
export function saveEpheName(
  city: CityBucket | null | undefined,
  key: string,
  name: string | null,
): boolean {
  if (!city || !isDurableAddress(key)) return true; // nothing durable to lose
  const bucket = bucketKeyFor(city);
  if (!bucket || typeof window === "undefined") return false;
  const stored = loadEpheNames(city);
  const trimmed = normaliseName(name);
  if (trimmed) stored[key] = trimmed;
  else delete stored[key];
  // Insertion order is the reader's own; beyond the cap the oldest name goes.
  const keys = Object.keys(stored);
  for (const old of keys.slice(0, Math.max(0, keys.length - NAMES_CAP))) delete stored[old];
  try {
    window.localStorage.setItem(PREFIX + bucket, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}
