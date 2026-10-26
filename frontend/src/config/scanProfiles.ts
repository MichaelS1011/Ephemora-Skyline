/**
 * Scan profiles — the user-facing vocabulary for scan configuration.
 * Mirrors the backend scan-config presets (resolveConfig applies them).
 */

import { enabledCategoriesPayload } from "./findingCategories";
import { readStoredJson, readStoredText, type StoredRead } from "../storageRead";
import type { FindingCategory } from "../city/types";
import type { DictKey } from "../i18n";

export type ScanProfile = "quick" | "standard" | "deep" | "custom";

export interface ScanProfileMeta {
  id: ScanProfile;
  icon: string;
  /** Dictionary keys — the chip row is a decision surface and must speak the
   * display language, so these tables carry keys, not prose. */
  label: DictKey;
  /** One-line summary shown under the chip row */
  summary: DictKey;
}

export const SCAN_PROFILES: ScanProfileMeta[] = [
  {
    id: "quick",
    icon: "⚡",
    label: "profile.quick",
    summary: "profile.quickSummary",
  },
  {
    id: "standard",
    icon: "⚖",
    label: "profile.standard",
    summary: "profile.standardSummary",
  },
  { id: "deep", icon: "🔬", label: "profile.deep", summary: "profile.deepSummary" },
];

/**
 * Which scanner engines run per profile — mirrors the backend
 * PROFILE_PRESETS in scan-config.ts 1:1 so the confirm dialog never
 * promises something the scan won't do.
 */
export type EngineId =
  | "heuristics"
  | "secrets"
  | "secretsHistory"
  | "ast"
  | "deps"
  | "osv"
  | "ruff"
  | "duplicates"
  | "cycles"
  | "coverage"
  | "blame";

export interface EngineMeta {
  id: EngineId;
  icon: string;
  name: DictKey;
  /** Plain-language: what does this engine actually look for? */
  what: DictKey;
}

export const ENGINES: EngineMeta[] = [
  {
    id: "heuristics",
    icon: "🔎",
    name: "engine.heuristics",
    what: "engine.heuristicsWhat",
  },
  {
    id: "secrets",
    icon: "🔑",
    name: "engine.secrets",
    what: "engine.secretsWhat",
  },
  {
    id: "ast",
    icon: "🌳",
    name: "engine.ast",
    what: "engine.astWhat",
  },
  {
    id: "deps",
    icon: "📦",
    name: "engine.deps",
    what: "engine.depsWhat",
  },
  {
    id: "osv",
    icon: "🌐",
    name: "engine.osv",
    what: "engine.osvWhat",
  },
  {
    id: "ruff",
    icon: "🐍",
    name: "engine.ruff",
    what: "engine.ruffWhat",
  },
  {
    id: "secretsHistory",
    icon: "🕰️",
    name: "engine.secretsHistory",
    what: "engine.secretsHistoryWhat",
  },
  {
    id: "duplicates",
    icon: "🧬",
    name: "engine.duplicates",
    what: "engine.duplicatesWhat",
  },
  {
    id: "cycles",
    icon: "♻️",
    name: "engine.cycles",
    what: "engine.cyclesWhat",
  },
  {
    id: "coverage",
    icon: "🛡️",
    name: "engine.coverage",
    what: "engine.coverageWhat",
  },
  {
    id: "blame",
    icon: "👥",
    name: "engine.blame",
    what: "engine.blameWhat",
  },
];

export const PROFILE_ENGINES: Record<ScanProfile, EngineId[]> = {
  quick: ["heuristics", "secrets", "deps", "duplicates", "cycles"],
  standard: [
    "heuristics",
    "secrets",
    "ast",
    "deps",
    "osv",
    "ruff",
    "duplicates",
    "cycles",
    "coverage",
    "blame",
  ],
  deep: [
    "heuristics",
    "secrets",
    "ast",
    "deps",
    "osv",
    "ruff",
    "duplicates",
    "cycles",
    "coverage",
    "blame",
    "secretsHistory",
  ],
  custom: [
    "heuristics",
    "secrets",
    "ast",
    "deps",
    "osv",
    "ruff",
    "duplicates",
    "cycles",
    "coverage",
    "blame",
  ],
};

/** What the findings report shows per profile (severity gate / focus). */
export const PROFILE_SCOPE: Record<ScanProfile, DictKey> = {
  quick: "scope.quick",
  standard: "scope.standard",
  deep: "scope.deep",
  custom: "scope.custom",
};

/**
 * THE single source of the duration sentence — chip line and detail card read
 * it here, no other copy is written anywhere.
 *
 * It no longer carries seconds. The four values that used to sit here
 * ("~2s", "~5s", "~5s", "~2s") were measured on 2026-10-04 by a local probe
 * script that is not in this repository: the shipped claim pointed at an
 * artifact nobody outside this machine can see, and the
 * tree it measured is five days and several scans older. A re-measure needs one
 * scan per profile, which the shared scan budget does not grant. What is still
 * true without a stopwatch is said here: duration is a property of the folder
 * and the engines that ran, and the progress line counts the seconds live.
 */
const STORAGE_KEY = "codecity-scan-profile";

/**
 * The ids the loader honours. "custom" is included on purpose: it is a value
 * this app's own writer produces (`saveProfile` accepts it, the editor is
 * stage 2), so it READS and falls back to standard below — refusing it as
 * `unreadable` would quarantine bytes the app wrote itself and sell a known
 * fallback as a failed read.
 */
const PROFILE_IDS: readonly string[] = ["quick", "standard", "deep", "custom"];

/**
 * The saved profile answers three states, not two (`StoredRead` in
 * storageRead.ts — the pattern the exclude list in this file shipped). The id
 * is stored as bare text, not JSON, so the read goes through `readStoredText`,
 * the class's raw-text door.
 *
 * The old `catch → "standard"` drew a profile that could not be read as THE
 * standard profile: a user who had chosen `deep` was told by the chip row
 * that they had never chosen anything, and the next chip click saved that
 * "never chosen" over the bytes the reader might still recover. The bytes now
 * stay under `codecity-scan-profile:unreadable` first-wins, and the screen
 * says the difference in words where the chips already live (ProfileChips,
 * `profile.storedUnreadable`).
 */
export function loadSavedProfileRead(): StoredRead<ScanProfile> {
  return readStoredText(STORAGE_KEY, (raw) =>
    PROFILE_IDS.includes(raw) ? (raw as ScanProfile) : undefined,
  );
}

/**
 * Persisted profile — survives reloads; "custom" has no editor yet, falls back.
 * The screen-facing default is still standard for a failed read; what changed
 * is that it is no longer the whole answer (see `loadSavedProfileRead`).
 */
export function loadSavedProfile(): ScanProfile {
  const read = loadSavedProfileRead();
  if (read.state === "read" && read.value !== "custom") return read.value;
  return "standard";
}

export function saveProfile(profile: ScanProfile): void {
  try {
    // The same rule `saveExcludes` ships: the live key may be rewritten — the
    // user chose a profile. The quarantined bytes of a failed read are NOT
    // that choice; saveProfile never touches the `:unreadable` slot.
    localStorage.setItem(STORAGE_KEY, profile);
  } catch {
    /* storage unavailable */
  }
}

/** Profiles and category chips must describe the same reporting scope. */
export function categoriesForProfile(
  profile: ScanProfile,
  categories: FindingCategory[],
): FindingCategory[] {
  return categories;
}

/**
 * Payload for POST /api/analyze-local (body.config). The backend
 * resolveConfig() applies the profile preset; "custom" is reserved for the
 * pattern editor (stage 2) and falls back to standard today.
 */
export function configPayload(
  profile: ScanProfile,
  categories: FindingCategory[] = [],
  rulePacks: string[] = [],
  excludePaths: string[] = [],
): {
  profile: ScanProfile;
  enabledCategories?: FindingCategory[];
  rulePacks?: string[];
  excludePaths?: string[];
} {
  const enabledCategories = enabledCategoriesPayload(categoriesForProfile(profile, categories));
  const excludes = normalizeExcludes(excludePaths);
  return {
    profile: profile === "custom" ? "standard" : profile,
    ...(enabledCategories.length > 0 ? { enabledCategories } : {}),
    ...(rulePacks.length > 0 ? { rulePacks } : {}),
    ...(excludes.length > 0 ? { excludePaths: excludes } : {}),
  };
}

// ── Exclude folders ────────────────────────────────────────────────────────
/**
 * The way out of a folder that is bigger than the upload cap. Without it the
 * 3000-file limit is a wall: 31 s of reading, then "aborted", with nothing the
 * user can do except pick a smaller folder. Exclusions work on both sides — the
 * browser's reader never opens them, the server never stages them — and every
 * file they remove is counted, so the number never quietly becomes smaller.
 */
export const MAX_EXCLUDE_PATHS = 50;
const MAX_EXCLUDE_LEN = 120;
const EXCLUDE_KEY = "codecity-scan-excludes";

/** Split the free-text field into path needles: "generated, fixtures/build". */
export function parseExcludes(raw: string): string[] {
  return normalizeExcludes(raw.split(/[,;\n]/));
}

/** Trim, de-noise, dedupe and cap a list of needles. */
export function normalizeExcludes(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of list) {
    const needle = String(entry ?? "")
      .trim()
      .replace(/^\.?\//, "")
      .replace(/\/+$/, "");
    // A blank needle matches every path (`"x".includes("")` is true), and a
    // parent segment has no business in an exclude list. Inner slashes stay
    // useful: "fixtures/build" is a real thing to exclude.
    if (needle.length === 0 || needle.includes("..")) continue;
    if (needle.length > MAX_EXCLUDE_LEN) continue;
    if (!out.includes(needle)) out.push(needle);
    if (out.length >= MAX_EXCLUDE_PATHS) break;
  }
  return out;
}

/**
 * The walker rule, identical to the server's: a needle is a substring of the
 * project-relative path. Empty needles are dropped rather than honoured.
 */
export function isExcludedPath(relativePath: string, needles: readonly string[]): boolean {
  return needles.some((needle) => needle.length > 0 && relativePath.includes(needle));
}

export function loadExcludes(): string[] {
  const read = loadExcludesRead();
  return read.state === "read" ? read.value : [];
}

/**
 * The exclude list answers three states, not two (`StoredRead` in
 * storageRead.ts — the pattern prefs.ts shipped). Answering the old `catch →
 * []` made a corrupt file identical to "no excludes", and every scan path
 * that reads this (`useLocalAnalysis`, `upload.ts`, `live/session.ts`) then
 * widened the scan radius — while the next `saveExcludes` from the field
 * wrote that widening over the bytes the reader might still recover. That
 * was the data-loss door; the bytes now stay under
 * `codecity-scan-excludes:unreadable` no matter what the field saves next.
 */
export function loadExcludesRead(): StoredRead<string[]> {
  return readStoredJson(EXCLUDE_KEY, (parsed) =>
    Array.isArray(parsed) ? normalizeExcludes(parsed.map(String)) : undefined,
  );
}

export function saveExcludes(list: readonly string[]): void {
  try {
    // The live key may be rewritten — the reader chose so in the field. The
    // quarantined bytes of a failed read are NOT that choice: saveExcludes
    // never touches the `:unreadable` slot (see loadExcludesRead).
    localStorage.setItem(EXCLUDE_KEY, JSON.stringify(normalizeExcludes(list)));
  } catch {
    /* storage unavailable */
  }
}
