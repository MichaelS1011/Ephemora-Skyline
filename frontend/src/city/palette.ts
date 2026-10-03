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
  // Script, query and infra files join the scan — hues chosen for the free
  // bands of this palette (olive, orchid, steel, indigo, brick), because the
  // blue/green/amber band was already taken by the languages above.
  SQL: "#b6c94f",
  Terraform: "#bd5fc9",
  PHP: "#5fb0c9",
  Kotlin: "#6f7ce0",
  Swift: "#e0655f",
  // .env joins the scan as its own kind — sand, so it reads as configuration
  // and not as another source language.
  Env: "#c2a391",
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

/** Okabe-Ito severity alarms — distinguishable under deuteranopia/protanopia. */
export const SEVERITY_CVD_COLOR: Record<Severity, string> = {
  P0: "#d55e00", // vermilion
  P1: "#0072b2", // blue
  P2: "#e69f00", // amber
};

/** Severity alarm colour, CVD-safe variant switchable per user preference. */
export function severityColor(sev: Severity, colorblind: boolean): string {
  return colorblind ? SEVERITY_CVD_COLOR[sev] : SEVERITY_COLOR[sev];
}

/** Calm beacon colour for fully reviewed files ("nothing left to do here"). */
export const REVIEWED_BEACON_COLOR = "#29d398";

export const THREAT_COLOR: Record<ThreatLevel, string> = {
  critical: SEVERITY_COLOR.P0,
  high: SEVERITY_COLOR.P1,
  medium: SEVERITY_COLOR.P2,
  low: "#29d398",
  safe: "#3b4a63",
};

/**
 * The colour of a file nothing looked at. Distinct from `safe`, which means
 * "looked, found nothing": measured on the Quick profile, 169 of 173 buildings
 * would otherwise wear that calm blue on the strength of a regex pass.
 */
export const UNCHECKED_COLOR = "#6b6a63";

export function threatRank(level: ThreatLevel): number {
  return { critical: 4, high: 3, medium: 2, low: 1, safe: 0 }[level];
}

// ── Heatmap channels (far-zoom LOD cells) ──────────────────────────────────

/** Okabe-Ito anchors for the CVD-safe heat ramps (no red/green adjacency). */
const OKABE_BLUE = "#0072b2";
const OKABE_AMBER = "#e69f00";
const OKABE_VERMILION = "#d55e00";
/** Darkened vermilion — the "hot" end of the CVD complexity ramp. */
const OKABE_VERMILION_DARK = "#753300";

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

/**
 * Complexity gradient: cool cyan (simple) → amber → hot magenta.
 * CVD variant: blue → amber → dark vermilion (no red/green neighbours).
 */
export function complexityColor(t: number, colorblind = false): string {
  if (colorblind) {
    if (t < 0.5) return gradient(t * 2, OKABE_BLUE, OKABE_AMBER);
    return gradient((t - 0.5) * 2, OKABE_AMBER, OKABE_VERMILION_DARK);
  }
  if (t < 0.5) return gradient(t * 2, "#3dd6c4", "#ffd23f");
  return gradient((t - 0.5) * 2, "#ffd23f", "#ff2ea6");
}

/**
 * Churn gradient: calm green (stable) → hot orange (eroding).
 * CVD variant: blue (stable) → vermilion (eroding).
 */
export function churnColor(score: number, colorblind = false): string {
  return colorblind
    ? gradient(score, OKABE_BLUE, OKABE_VERMILION)
    : gradient(score, "#29d398", "#ff7a1a");
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
  skyTop: "#1f1e1b",
  skyHorizon: "#3a372f",
  // Fog sits ABOVE every surface it hides, or distance flattens into black
  // instead of lifting into haze.
  fog: "#3a382f",
  ground: "#24231e",
  plot: "#2d2c26",
  plotEdge: "#5c574c",
  road: "#1e1d1a",
  curb: "#4a4840",
  crosswalk: "#9d9889",
  laneDash: "#e2c069",
  streetlight: "#ffd9a0",
  windowWarm: "#ffc470",
  windowCool: "#e8d8b0",
  windowAlarm: "#ff4d5e",
  // Facades catch the sky: a building darker than the ground it stands on
  // reads as a cut-out instead of a volume.
  wallDark: "#35342e",
  connection: "#e8b23c",
  selection: "#e8503c",
} as const;
