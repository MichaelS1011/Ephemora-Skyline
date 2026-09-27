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
