/**
 * Scan profiles — the user-facing vocabulary for scan configuration.
 * Mirrors the backend scan-config presets (resolveConfig applies them).
 */

export type ScanProfile =
  "quick" | "standard" | "deep" | "security-only" | "quality-only" | "custom";

export interface ScanProfileMeta {
  id: ScanProfile;
  icon: string;
  label: string;
  /** One-line summary shown under the chip row */
  summary: string;
}

export const SCAN_PROFILES: ScanProfileMeta[] = [
  {
    id: "quick",
    icon: "⚡",
    label: "Quick",
    summary: "critical findings only — fastest scan (~10s)",
  },
  {
    id: "standard",
    icon: "⚖",
    label: "Standard",
    summary: "all scanners — secrets, AST, CVEs, heuristics",
  },
  { id: "deep", icon: "🔬", label: "Deep", summary: "standard + git-history secret scan — slower" },
  {
    id: "security-only",
    icon: "🛡",
    label: "Security",
    summary: "only security findings, no style noise",
  },
  { id: "quality-only", icon: "🧹", label: "Quality", summary: "dead code & hygiene only" },
  { id: "custom", icon: "✏", label: "Custom", summary: "your own configuration (coming soon)" },
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
  name: string;
  /** Plain-language: what does this engine actually look for? */
  what: string;
}

export const ENGINES: EngineMeta[] = [
  {
    id: "heuristics",
    icon: "🔎",
    name: "Code patterns",
    what: "scans every file for risky code patterns (injection, XSS, unsafe storage…)",
  },
  {
    id: "secrets",
    icon: "🔑",
    name: "Secrets",
    what: "finds API keys, passwords and tokens committed in your files",
  },
  {
    id: "ast",
    icon: "🌳",
    name: "Deep AST rules",
    what: "syntax-tree analysis for injection and XSS flows the regexes can't see",
  },
  {
    id: "deps",
    icon: "📦",
    name: "Dependency audit",
    what: "checks npm packages against the known-vulnerability database",
  },
  {
    id: "osv",
    icon: "🌐",
    name: "OSV database",
    what: "cross-checks dependencies against the open-source CVE database",
  },
  {
    id: "ruff",
    icon: "🐍",
    name: "Python lint",
    what: "quality and hygiene checks for Python files",
  },
  {
    id: "secretsHistory",
    icon: "🕰️",
    name: "Git history secrets",
    what: "walks the full commit history — finds keys you deleted long ago",
  },
  {
    id: "duplicates",
    icon: "🧬",
    name: "Copy-paste clones",
    what: "finds duplicated code blocks — yellow lasers connect the clones",
  },
  {
    id: "cycles",
    icon: "♻️",
    name: "Circular imports",
    what: "detects import loops — red rings mark the files that block the system",
  },
  {
    id: "coverage",
    icon: "🛡️",
    name: "Test coverage",
    what: "reads the repo's own lcov report — well-tested files get a blue shield",
  },
  {
    id: "blame",
    icon: "👥",
    name: "Author map",
    what: "colors districts by the developers who own them (git history)",
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
export const PROFILE_SCOPE: Record<ScanProfile, string> = {
  quick: "shows only P0 critical findings — triage, not a full report",
  standard: "shows all findings, P0 to P2 (critical → hygiene)",
  deep: "shows all findings P0 to P2, including historical secrets",
  "security-only": "shows all findings, minus style-noise categories",
  "quality-only": "shows only hygiene findings (dead code, console, style)",
  custom: "shows all findings, P0 to P2",
};

export const PROFILE_DURATION: Record<ScanProfile, string> = {
  quick: "≤ 30s",
  standard: "~40s",
  deep: "1–3 min",
  "security-only": "~40s",
  "quality-only": "~20s",
  custom: "~40s",
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
export function configPayload(profile: ScanProfile): { profile: ScanProfile } {
  return { profile: profile === "custom" ? "standard" : profile };
}
