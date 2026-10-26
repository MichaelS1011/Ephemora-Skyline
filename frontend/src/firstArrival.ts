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
 */

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

/** A stored value is a stage only if it names one of the three. */
function stageOf(value: string | null): ArrivalStage {
  return value === "welcome" || value === "intro" || value === "done" ? value : "welcome";
}

/**
 * The beat to open on.
 *
 * Nothing stored means the greeting, and so does a value this code does not
 * recognise: an unreadable or hand-edited key must not strand a reader on a
 * screen that does not exist. Storage that throws is read the same way, because
 * the sequence is a door, never a gate — the worst this can do is greet twice.
 */
export function readArrivalStage(): ArrivalStage {
  if (typeof window === "undefined") return "welcome";
  try {
    return stageOf(window.localStorage.getItem(STAGE_KEY));
  } catch {
    return "welcome";
  }
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
