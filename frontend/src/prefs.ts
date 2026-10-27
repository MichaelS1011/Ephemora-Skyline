/**
 * User preferences — persisted local-first in localStorage. Covers the
 * display language, the low-effects rendering mode and the colorblind-safe
 * threat palette. Defaults stay conservative (English, full effects) — with
 * one exception: on the genuine first run, before anything was ever saved,
 * the machine is asked what it already knows (`prefers-reduced-motion`,
 * `prefers-contrast`) and its answer sets the two switches it matches. The
 * adoption is visible in the Access section and never written to disk on its
 * own; the moment the reader saves anything, their file outranks the system.
 */

export interface Prefs {
  lang: "en" | "de";
  /** Skip bloom post-processing + lower device pixel ratio (weak GPUs). */
  gfxLite: boolean;
  /** Colorblind-safe severity palette + shape-coded beacons. */
  colorblind: boolean;
  /**
   * Passive update check against public GitHub releases (no telemetry).
   *
   * Read by the release-check effect in `components/Landing.tsx` before the
   * page asks the backend for a release, and settable through the store
   * (`setPref`, `toggleUpdateCheck`) from the "••• More" menu row in
   * `components/ActionBar.tsx`.
   *
   * Off by default. An anonymous GET for a release tag gives away no source
   * code — but on a first visit it is the one entry in the network panel before
   * the reader has done anything, and the screen above it promises exactly that
   * nothing does. So the screen asks whether they ever want to be asked, and the
   * one who says yes gets the note.
   */
  updateCheck: boolean;
}

const KEY = "codecity-prefs";
/**
 * Where the unreadable bytes of `KEY` are parked when a read finds them
 * unreadable, so the next `savePrefs` — a click on ANY preference, most
 * likely one the reader makes to undo the damage — cannot eat the file they
 * might still recover. The same door the rule-pack round closed on the
 * network path, closed here on the storage path.
 */
const UNREADABLE_KEY = "codecity-prefs:unreadable";
// The update check is on from the first run (operator decision 2026-10-27): a person who
// installed an older build learns about a new one without hunting for a switch. What it
// costs is one anonymous GET per hour to `api.github.com` for the newest release tag —
// no source, no path, no identifier — it is the first host in the disclosure table, and
// the switch sits in a city's More menu, where turning it off is one click and sticks.
const DEFAULTS: Prefs = { lang: "en", gfxLite: false, colorblind: false, updateCheck: true };

/**
 * What reading the stored preferences can answer (the pattern is
 * `RulePacksRead` in config/rulePacks.ts, which re-declared
 * `VerdictRead` in reviews.ts — this file is a third instance of one class).
 *
 * `read` — the blob parsed and is an object; missing keys inside it are the
 * honest "saved before that decision existed", answered per key by `loadPrefs`.
 * `absent` — no blob at all: genuinely first run, and the only state allowed
 * to look like defaults without a word.
 * `unreadable` — the read threw, the bytes did not parse, or what parsed is
 * not an object: the machine holds preferences and this app cannot say what
 * they are. Answering that with defaults is the lie this type exists to stop.
 */
export type PrefsRead =
  { state: "read"; prefs: Prefs } | { state: "absent" } | { state: "unreadable" };

export function loadPrefsRead(): PrefsRead {
  if (typeof window === "undefined") return { state: "absent" };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage itself refuses to answer (disabled, private mode): the
    // preferences may or may not exist, and nobody here may say which.
    return { state: "unreadable" };
  }
  if (raw === null) return { state: "absent" };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("prefs blob is not an object");
    }
    return {
      state: "read",
      prefs: {
        lang: parsed.lang === "de" ? "de" : "en",
        gfxLite: parsed.gfxLite === true,
        colorblind: parsed.colorblind === true,
        // `!== false`, not `=== true`: the product default moved to "on", so a
        // file saved before the switch existed states nothing about it and gets
        // the default. Only a written `false` is a decision — and a decision this
        // app keeps, which is the whole reason the key is stored at all.
        updateCheck: parsed.updateCheck !== false,
      },
    };
  } catch {
    preserveUnreadable(raw);
    return { state: "unreadable" };
  }
}

/**
 * Keep the first unreadable blob verbatim. The slot is never overwritten by a
 * later corruption: a preserved file the app did not write is not the app's
 * to replace, and quietly trading it for newer junk would recreate the sin
 * with extra steps. Best-effort — if the quarantine write itself fails, the
 * bytes still sit in KEY until a savePrefs or the browser replaces them.
 */
function preserveUnreadable(raw: string): void {
  try {
    if (window.localStorage.getItem(UNREADABLE_KEY) === null) {
      window.localStorage.setItem(UNREADABLE_KEY, raw);
    }
  } catch {
    // Nowhere to preserve them: the note is still owed to the reader anyway.
  }
}

/** The bytes a corrupt read kept, or null when nothing was quarantined. */
export function preservedUnreadablePrefs(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(UNREADABLE_KEY);
  } catch {
    return null;
  }
}

/**
 * What this machine already says about how its screen should behave. Read
 * passively through `matchMedia`, like `city/motion.ts` reads the same signal
 * for animation — no permission, no storage, nothing written.
 */
export interface SystemSignals {
  reducedMotion: boolean;
  moreContrast: boolean;
}

export function readSystemSignals(): SystemSignals {
  const ask = (query: string): boolean => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
      return window.matchMedia(query).matches === true;
    } catch {
      return false;
    }
  };
  return {
    reducedMotion: ask("(prefers-reduced-motion: reduce)"),
    moreContrast: ask("(prefers-contrast: more)"),
  };
}

/** The preferences a system signal can speak for. `lang` and `updateCheck`
 *  are never adopted: one is a choice of words, the other a network request,
 *  and no media query asks either of them. */
export type AdoptedKey = "gfxLite" | "colorblind";

export function adoptionFor(signals: SystemSignals): AdoptedKey[] {
  const taken: AdoptedKey[] = [];
  if (signals.reducedMotion) taken.push("gfxLite");
  if (signals.moreContrast) taken.push("colorblind");
  return taken;
}

/**
 * Which switches the system set on this first run, as keys — the sentence the
 * Access section shows. Empty the moment a file exists (the reader decided,
 * anything) and empty on unreadable bytes: the quarantine rule says defaults
 * are the only honest answer there, and adoption would write words about a
 * setting the app cannot prove it read.
 *
 * Nothing here persists. The adopted values live in memory until the reader's
 * first click saves the whole set — and any click on the Access rows is that
 * click, with the reader's own state in it.
 */
export function systemAdoption(): AdoptedKey[] {
  if (loadPrefsRead().state !== "absent") return [];
  return adoptionFor(readSystemSignals());
}

export function loadPrefs(): Prefs {
  const read = loadPrefsRead();
  if (read.state === "read") return read.prefs;
  if (read.state === "unreadable") return { ...DEFAULTS };
  // Genuinely first run: the system's own request is the kindest default, and
  // `systemAdoption()` says so out loud beside the switches it moved.
  const signals = readSystemSignals();
  return {
    ...DEFAULTS,
    gfxLite: signals.reducedMotion,
    colorblind: signals.moreContrast,
  };
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    // The live key may be overwritten — the reader chose so. The quarantined
    // bytes are not the reader's choice to undo by accident: savePrefs does
    // not touch UNREADABLE_KEY, and the note's "nothing was deleted" stays
    // the fact it was when written.
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled — preferences stay session-only
  }
}
