/**
 * Scan profiles — the user-facing vocabulary for scan configuration.
 * Mirrors the backend scan-config presets (resolveConfig applies them).
 */

import { enabledCategoriesPayload } from "./findingCategories";
import type { FindingCategory } from "../city/types";
import type { DictKey } from "../i18n";

export type ScanProfile =
  "quick" | "standard" | "deep" | "security-only" | "quality-only" | "custom";

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
  {
    id: "security-only",
    icon: "🛡",
    label: "profile.security",
    summary: "profile.securitySummary",
  },
  {
    id: "quality-only",
    icon: "🧹",
    label: "profile.quality",
    summary: "profile.qualitySummary",
  },
  {
    id: "custom",
    icon: "✏",
    label: "profile.custom",
    summary: "profile.customSummary",
  },
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
  "security-only": [
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
  "quality-only": ["heuristics", "ruff", "duplicates", "cycles"],
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
  "security-only": "scope.securityOnly",
  "quality-only": "scope.qualityOnly",
  custom: "scope.custom",
};

/**
 * THE single source of time promises — chip description line and the detail
 * card both read this, no other copy is written anywhere. Values are measured,
 * not guessed: .qoder-scratch/profile-diff.mjs drove every profile through the
 * real HTTP route (POST /api/analyze-local → poll /api/status → /api/result)
 * against this repo (1290 collected files, backend :4000, 2026-10-04):
 * quick 1.7s, standard 4.7s, security-only 4.7s, quality-only 1.7s, deep 4.7s
 * (deep adds the git-history walk but finished in the same poll interval).
 * Poll granularity is 1.5s, so each value is rounded up to the next second.
 */
export const PROFILE_DURATION: Record<ScanProfile, string> = {
  quick: "~2s",
  standard: "~5s",
  deep: "~5s",
  "security-only": "~5s",
  "quality-only": "~2s",
  // custom falls back to the standard preset today (see configPayload)
  custom: "~5s",
};

const STORAGE_KEY = "codecity-scan-profile";

/** Persisted profile — survives reloads; "custom" has no editor yet, falls back */
export function loadSavedProfile(): ScanProfile {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ScanProfile | null;
    if (saved && SCAN_PROFILES.some((p) => p.id === saved) && saved !== "custom") return saved;
  } catch {
    /* storage unavailable */
  }
  return "standard";
}

export function saveProfile(profile: ScanProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, profile);
  } catch {
    /* storage unavailable */
  }
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
  const enabledCategories = enabledCategoriesPayload(categories);
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
  try {
    const raw = localStorage.getItem(EXCLUDE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeExcludes(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

export function saveExcludes(list: readonly string[]): void {
  try {
    localStorage.setItem(EXCLUDE_KEY, JSON.stringify(normalizeExcludes(list)));
  } catch {
    /* storage unavailable */
  }
}
