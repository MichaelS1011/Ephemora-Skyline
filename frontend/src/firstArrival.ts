/**
 * What this browser knows about arriving: whether a city has ever stood open
 * here (§03.02), and how far the guided introduction got (§03.08).
 *
 * The first arrival gets a quiet greeting; every later one is dropped back into
 * the work. That difference turns on one fact — whether ANY city has ever stood
 * open here — and nothing on screen carried it. `hasCityVisit` answers per city,
 * so a second project still read as a first-time visit, and the recent list can
 * hold nothing at all while a person has used the app for a week.
 *
 * So the answer is one stamp, written once at the single place a city arrives
 * (`useStore.setCityData`) and never written again. It is not deleted by clearing
 * history and not reset by a folder changing: it says only "this machine has
 * opened Skyline's city at least once." A reader who wants the greeting back asks
 * for it themselves (§03.11); this flag never decides that silently.
 *
 * Neither key carries a project name and no path — a boolean and one word out of
 * three, nothing a synced browser profile could read as a folder someone scanned.
 *
 * §03.08 adds the second arrival fact: how far the guided sequence got. It lives
 * beside the stamp because it is the same kind of statement — a fact about this
 * browser's own history, holding one word out of three and no project data.
 *
 * §19.05 puts the beat's read on the shared honest reader (`storageRead.ts`):
 * absent, read, and unreadable-kept are three different answers, and only the
 * first may look like the greeting without a word. The quarantine slot is
 * `codecity-arrival-stage:v1:unreadable` — one short word or a hand-edit, no
 * project path, same privacy promise as the key itself.
 */

import { readStoredText, type StoredRead } from "./storageRead";

const KEY = "codecity-first-arrival:v1";
const STAGE_KEY = "codecity-arrival-stage:v1";

/**
 * Whether this browser has shown a city before.
 *
 * Read once when the store is built, so the very first paint already knows
 * whether to greet or to get out of the way. Storage that throws is read as
 * "seen" — an app that cannot remember must not greet every visitor as brand
 * new on every reload.
 */
export function hasArrivedBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Stamp the first city as arrived.
 *
 * Idempotent: once set the stamp is not rewritten, so the timestamp-free value
 * never changes and a later visit cannot be mistaken for the first. Called from
 * the same line that records the visit, which is the only path a city takes onto
 * the screen.
 */
export function markArrived(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY) === "1") return;
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage refused the stamp: the next launch asks again rather than assume.
  }
}

/**
 * §03.08 — where the guided sequence stands.
 *
 * The beats are the two the sequence actually has (§03.03 greeting, §03.05
 * introduction) plus the state of being through with them. `done` is a real
 * value, not the absence of one: a reader who skipped or finished must not be
 * greeted again after a reload, and that promise has to survive the tab.
 */
export type ArrivalStage = "welcome" | "intro" | "done";

/**
 * §19.05 — the honest three-state read of the beat.
 *
 * `readArrivalStage` answers ONE question ("which beat to open on") and may
 * collapse a failed read into the greeting — a door, never a gate. This
 * reader answers a different question ("what does the storage actually
 * say"), where collapsing is the lie `storageRead.ts` was written against:
 * bytes that exist and cannot be honoured are `unreadable`, they are parked
 * in the quarantine slot, and the caller can still choose the greeting.
 */
export function readArrivalStageRead(): StoredRead<ArrivalStage> {
  return readStoredText(STAGE_KEY, (raw) =>
    raw === "welcome" || raw === "intro" || raw === "done" ? raw : undefined,
  );
}

/**
 * The beat to open on.
 *
 * Nothing stored means the greeting, and so does a value this code does not
 * recognise: an unreadable or hand-edited key must not strand a reader on a
 * screen that does not exist. Storage that throws is read the same way, because
 * the sequence is a door, never a gate — the worst this can do is greet twice.
 * (The refused bytes are kept first, §19.05: a fallback may not trade them.)
 */
export function readArrivalStage(): ArrivalStage {
  return stageOfArrival(readArrivalStageRead());
}

/** The fallback rule itself: only a READ value is a beat; absent and
 *  unreadable both open on the greeting. */
function stageOfArrival(read: StoredRead<ArrivalStage>): ArrivalStage {
  return read.state === "read" ? read.value : "welcome";
}

/**
 * §19.05 — the whole beat decision, as a machine.
 *
 * Two facts stand behind the greeting surface: whether this machine has
 * ever shown a city (`firstRun`, the stamp — read at store creation, where
 * a throwing storage fails CLOSED toward "arrived") and what the record
 * says about the beat. The stamp outranks the record — Landing's rule,
 * written down here so it is one decision with a case, not an inline
 * ternary inside a `useState` initializer. Reduced motion never enters
 * this function on purpose: it short-circuits the BUILD (useStore's
 * `skipBuild`), not the greeting — pinned as a case, not restated as code.
 */
export function arrivalBeat(lage: {
  firstRun: boolean;
  stage: StoredRead<ArrivalStage>;
}): ArrivalStage {
  if (!lage.firstRun) return "done";
  return stageOfArrival(lage.stage);
}

/**
 * Record the beat the reader reached.
 *
 * The store mirrors the screen, backwards moves included — a record that only
 * moved forward would resume the reader on a beat they had just left. A write
 * that changes nothing is skipped, and a refused write is swallowed: the visit
 * continues in memory, and the next launch greets again rather than claiming a
 * progress it never got.
 */
export function rememberArrivalStage(stage: ArrivalStage): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STAGE_KEY) === stage) return;
    window.localStorage.setItem(STAGE_KEY, stage);
  } catch {
    // Nothing remembered: the sequence still plays, only without a memory.
  }
}
