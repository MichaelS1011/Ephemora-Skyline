/**
 * City palette — a daylight architectural model.
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

// ── Far-view heat-cell legibility (#30) ────────────────────────────────────

/**
 * The far-zoom heat grid is unlit and sits directly on ENV.ground, so it is
 * coupled to the environment band: raise the ground and the calm tiles sink
 * into it. Measured before any lift, the whole grid sat at a relative luminance
 * of ~0.035 (p50) and the `safe` cell cleared the ground by only 1.76:1 — the
 * city read as one dark mass.
 *
 * The number below is therefore not a style choice. hudLegibility.test.ts
 * asserts ≥2.5:1 for the lifted `safe` tile against whatever ENV.ground currently
 * is, and it failed at 2.37:1 when the band was lifted to dusk, which is why
 * DUSK_LIFT moved 0.16 → 0.22. Change the ground and this constant has to be
 * re-measured with it.
 *
 * `liftHexForDusk` raises every tile's HSL lightness by a CONSTANT offset.
 * Constant (not a floor) is deliberate: a flat floor would collapse `safe`
 * onto `unchecked`, destroying the semantic pair the product depends on. An
 * additive shift preserves the lightness gap between neighbouring heat levels
 * exactly, and because it is monotonic it can never reorder the ramp — P0 stays
 * hotter than P1, `unchecked` stays lighter than `safe`.
 */
export const DUSK_LIFT = 0.22;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, tIn: number): number => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Pure sRGB-space lightness lift — see the DUSK_LIFT block comment. */
export function liftHexForDusk(hex: string, offset = DUSK_LIFT): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(0.82, l + offset));
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

// Daylight environment: slate roads, pale plots and cool atmospheric haze.

export const ENV = {
  skyTop: "#dcecf5",
  // Fog sits ABOVE every surface it hides, or distance flattens into black
  // instead of lifting into haze.
  fog: "#dcecf5",
  ground: "#b7c9d2",
  plot: "#d5e0e4",
  plotEdge: "#91a5b1",
  road: "#718591",
  curb: "#b6c7cc",
  crosswalk: "#f2f6f6",
  laneDash: "#e6d9ac",
  streetlight: "#ffd9a0",
  windowWarm: "#ffc470",
  windowCool: "#e8d8b0",
  windowAlarm: "#ff4d5e",
  connection: "#e8b23c",
  selection: "#e8503c",
} as const;
