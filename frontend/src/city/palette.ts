/**
 * City palette — SimCity@Dusk.
 *
 * Encoding rules (meaning never carried by colour alone):
 * - Facade colour encodes the file's LANGUAGE (colorblind-safe hues).
 * - Security findings are ALARMS: rooftop beacons + red window pulse +
 *   landmark shape, independent of the facade colour.
 */

import type { Severity, ThreatLevel } from './types';

// ── Language → facade colour ───────────────────────────────────────────────

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#5b9bff',
  JavaScript: '#f0b23e',
  Python: '#4fc98a',
  Rust: '#f4793b',
  Go: '#3dd6c4',
  Java: '#d98d4a',
  Ruby: '#e35d6a',
  CSharp: '#a78bfa',
  Cpp: '#8fb3d9',
  HTML: '#ff8a65',
  CSS: '#b48eeb',
  SCSS: '#cf6a9c',
  Markdown: '#8fa3b8',
  JSON: '#93a7bd',
  YAML: '#7fc4b0',
  Config: '#9aa7b8',
  Shell: '#89c98f',
  Other: '#7f8ea3',
};

export function languageColor(language: string | undefined): string {
  if (!language) return LANGUAGE_COLORS.Other!;
  return LANGUAGE_COLORS[language] ?? LANGUAGE_COLORS.Other!;
}

/** Top languages by code lines, for legend + facade variety. */
export function topLanguages(languages: Record<string, number>, n = 5): Array<{ name: string; lines: number }> {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, lines]) => ({ name, lines }));
}

// ── Alarm accents (findings) ───────────────────────────────────────────────

export const SEVERITY_COLOR: Record<Severity, string> = {
  P0: '#ff2e4d',
  P1: '#ff7a1a',
  P2: '#ffd23f',
};

export const THREAT_COLOR: Record<ThreatLevel, string> = {
  critical: SEVERITY_COLOR.P0,
  high: SEVERITY_COLOR.P1,
  medium: SEVERITY_COLOR.P2,
  low: '#29d398',
  safe: '#3b4a63',
};

export function threatRank(level: ThreatLevel): number {
  return { critical: 4, high: 3, medium: 2, low: 1, safe: 0 }[level];
}

// ── Environment (dusk) ─────────────────────────────────────────────────────

export const ENV = {
  skyTop: '#0b1026',
  skyHorizon: '#1d2b4a',
  fog: '#141b30',
  ground: '#12161f',
  plot: '#1d2536',
  plotEdge: '#33405c',
  road: '#12161f',
  laneDash: '#d9b45c',
  streetlight: '#ffd9a0',
  windowWarm: '#ffc470',
  windowCool: '#9fd8ff',
  windowAlarm: '#ff4d5e',
  wallDark: '#161b26',
  connection: '#39c7ff',
  selection: '#4de3ff',
} as const;
