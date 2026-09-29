/**
 * City palette — SimCity@Dusk.
 *
 * Encoding rules (meaning never carried by colour alone):
 * - Facade colour encodes the file's LANGUAGE (colorblind-safe hues).
 * - Security findings are ALARMS: rooftop beacons + red window pulse +
 *   landmark shape, independent of the facade colour.
 */

import type { Severity, ThreatLevel } from "./types";

// ── Language → facade colour ───────────────────────────────────────────────

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#5b9bff",
  JavaScript: "#f0b23e",
  Python: "#4fc98a",
  Rust: "#f4793b",
  Go: "#3dd6c4",
  Java: "#d98d4a",
  Ruby: "#e35d6a",
  CSharp: "#a78bfa",
  Cpp: "#8fb3d9",
  HTML: "#ff8a65",
  CSS: "#b48eeb",
  SCSS: "#cf6a9c",
  Markdown: "#8fa3b8",
  JSON: "#93a7bd",
  YAML: "#7fc4b0",
  Config: "#9aa7b8",
  Shell: "#89c98f",
  Other: "#7f8ea3",
};

export function languageColor(language: string | undefined): string {
  if (!language) return LANGUAGE_COLORS.Other!;
  return LANGUAGE_COLORS[language] ?? LANGUAGE_COLORS.Other!;
}

/** Top languages by code lines, for legend + facade variety. */
export function topLanguages(
  languages: Record<string, number>,
  n = 5,
): Array<{ name: string; lines: number }> {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, lines]) => ({ name, lines }));
}

// ── Alarm accents (findings) ───────────────────────────────────────────────

export const SEVERITY_COLOR: Record<Severity, string> = {
  P0: "#ff2e4d",
  P1: "#ff7a1a",
  P2: "#ffd23f",
};

export const THREAT_COLOR: Record<ThreatLevel, string> = {
  critical: SEVERITY_COLOR.P0,
  high: SEVERITY_COLOR.P1,
  medium: SEVERITY_COLOR.P2,
  low: "#29d398",
  safe: "#3b4a63",
};

export function threatRank(level: ThreatLevel): number {
  return { critical: 4, high: 3, medium: 2, low: 1, safe: 0 }[level];
}

// ── Heatmap channels (far-zoom LOD cells) ──────────────────────────────────

/** Two-stop gradient evaluation in sRGB hex space (good enough for heat). */
function gradient(t: number, from: string, to: string): string {
  const p = Math.max(0, Math.min(1, t));
  const pa = parseInt(from.slice(1)!, 16);
  const pb = parseInt(to.slice(1)!, 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * p);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * p);
  const b = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * p);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Complexity gradient: cool cyan (simple) → amber → hot magenta */
export function complexityColor(t: number): string {
  if (t < 0.5) return gradient(t * 2, "#3dd6c4", "#ffd23f");
  return gradient((t - 0.5) * 2, "#ffd23f", "#ff2ea6");
}

/** Churn gradient: calm green (stable) → hot orange (eroding). */
export function churnColor(score: number): string {
  return gradient(score, "#29d398", "#ff7a1a");
}

// ── Author territory colors (git blame districts) ─────────────────────────

const AUTHOR_PALETTE = [
  "#ff6b9d",
  "#4de3ff",
  "#ffd23f",
  "#7cffb2",
  "#c792ea",
  "#ff9a3d",
  "#82aaff",
  "#59f0d8",
  "#f07178",
  "#c3e88d",
];

/** Deterministic, pleasing color per developer name. */
export function authorColor(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  return AUTHOR_PALETTE[h % AUTHOR_PALETTE.length]!;
}

// ── Environment (corporate dusk: charcoal world, vermilion glow) ──────────

export const ENV = {
  skyTop: "#141412",
  skyHorizon: "#2a2823",
  fog: "#1b1b18",
  ground: "#161614",
  plot: "#222220",
  plotEdge: "#4a463e",
  road: "#161614",
  laneDash: "#d9b45c",
  streetlight: "#ffd9a0",
  windowWarm: "#ffc470",
  windowCool: "#e8d8b0",
  windowAlarm: "#ff4d5e",
  wallDark: "#1c1c1a",
  connection: "#e8b23c",
  selection: "#e8503c",
} as const;
