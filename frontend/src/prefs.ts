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
   * (`Landing.tsx:177`), and settable through the store (`setPref`,
   * `toggleUpdateCheck`). The menu row that shows it is ordered at Lane
   * STADT-UI (`requests/staat.md` §1.1).
   */
  updateCheck: boolean;
}

const KEY = "codecity-prefs";
const DEFAULTS: Prefs = { lang: "en", gfxLite: false, colorblind: false, updateCheck: true };

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
      updateCheck: parsed.updateCheck !== false,
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
