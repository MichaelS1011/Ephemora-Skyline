/**
 * User preferences — persisted local-first in localStorage. Covers the
 * display language, the low-effects rendering mode and the colorblind-safe
 * threat palette. Defaults stay conservative (English, full effects).
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
   * Read by the landing page before it asks the backend for a release
   * (`Landing.tsx:562`), and settable through the store (`setPref`,
   * `toggleUpdateCheck`). The menu row that shows it is ordered at Lane
   * STADT-UI (`requests/staat.md` §1.1).
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
const DEFAULTS: Prefs = { lang: "en", gfxLite: false, colorblind: false, updateCheck: false };

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: parsed.lang === "de" ? "de" : "en",
      gfxLite: parsed.gfxLite === true,
      colorblind: parsed.colorblind === true,
      // `=== true`, not `!== false`: a file saved before this decision has no
      // `updateCheck` key, and reading its absence as "on" would switch the
      // lookup back for every reader who already has saved preferences.
      updateCheck: parsed.updateCheck === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled — preferences stay session-only
  }
}
