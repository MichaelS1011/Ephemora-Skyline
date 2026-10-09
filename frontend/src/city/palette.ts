/**
 * City palette — a code floor plan lit once, at the end of the day.
 *
 * Encoding rules (meaning never carried by colour alone):
 * - Facade colour encodes the file's LANGUAGE (colorblind-safe hues).
 * - Security findings are ALARMS: rooftop beacons + red window pulse +
 *   landmark shape, independent of the facade colour.
 */

import type { Severity, ThreatLevel } from "./types";

// ── Language → facade colour ───────────────────────────────────────────────
//
// This block is a measurement, not a mood. The shipped set it replaces had a
// smallest pairwise CIEDE2000 of **1.29** (Markdown `#8fa3b8` against JSON
// `#93a7bd`) and **1.09** under simulated protanopia — two file kinds drawn in
// what is on screen one colour. That is the number behind "Fassadenfarben
// unterscheiden sich im Screenshot kaum".
//
// Construction, in the order the decisions were taken:
//
// 1. The ten languages a reader actually scans first (TypeScript, JavaScript,
//    Python, Go, Rust, Java, Ruby, C#, HTML, CSS) keep their conventional hue:
//    blue, gold, green, cyan, orange, brown, red, orchid, salmon, indigo.
// 2. Every tone — these ten and the fourteen behind them — has to stand off the
//    city floor it is drawn on, so a minimum distance of 12 ΔE00 to the whole
//    environment band (ground, plot, kerb, asphalt, crossing, haze, zenith) is
//    a hard floor. This is what stopped an earlier run from solving the
//    separation with pale washes that vanished on `ENV.ground`.
// 3. Inside those two constraints, L\* and C\*ab were searched (simulated
//    annealing, `.qoder-scratch/devteam/WELT-BILD/palette-opt.mjs`) to maximise
//    the SMALLEST distance over all 276 pairs, and the smallest distance was
//    required under simulated protanopia and deuteranopia too — the same
//    message has to survive the colorblind branch, so the palette is safe by
//    construction instead of by the Okabe-Ito claim in a comment.
//
// Measured outcome of the set below: **8.89** ΔE00 minimum in normal vision,
// **8.77** protanope, **8.28** deuteranope, **13.4** to the environment band
// (tightest: CSS against the asphalt).
// `tests/worldPicture.test.ts` pins those floors.

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#468eff",
  JavaScript: "#efba54",
  Python: "#00906a",
  Rust: "#c06a0f",
  Go: "#87d9dc",
  Java: "#763b1d",
  Ruby: "#c0433c",
  CSharp: "#df8dd4",
  Cpp: "#007983",
  HTML: "#d4958c",
  CSS: "#45619f",
  SCSS: "#863e49",
  // Document, data and configuration kinds: no strong convention exists for
  // these, so they took the free ground in the search rather than a family
  // look-alike. Markdown and JSON — the pair that used to be 1.29 apart —
  // are now 25 apart.
  Markdown: "#855400",
  JSON: "#c19a00",
  YAML: "#4b7dba",
  Config: "#00555e",
  Shell: "#5db6ac",
  SQL: "#b89460",
  Terraform: "#74c0ff",
  PHP: "#4b2cbf",
  Kotlin: "#9f0063",
  Swift: "#ecb89a",
  // .env joins the scan as its own kind, and it is the kind worth finding:
  // it carries the loudest tone the search had left.
  Env: "#0655f0",
  Other: "#2695a4",
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
  /** Looked, found nothing. Its value is set from two sides at once: it has to
   *  stand off the light plaza floor (`hudLegibility.test.ts`, ≥2.5:1) AND off
   *  the dark haze it now floats on in the far view. `#3b4a63` cleared the
   *  floor by 4.94 and the haze by 1.75 — a dusk atmosphere had made the
   *  calmest level of the heat grid the one thing in the frame you could not
   *  see. This is the lightest tone that keeps both, and it stays clearly
   *  cooler than `UNCHECKED_COLOR` at the same luminance. */
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

/** Mineral roof coating: language hue stays visible, with a small, stable
 * material variation per file. This variation carries no analysis meaning. */
export function languageRoofColor(language: string | undefined, seed: number): string {
  const mineral = gradient(0.3, languageColor(language), "#a8b4b1");
  return gradient(0.07 + (Math.abs(seed) % 5) * 0.015, mineral, "#46525d");
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

/** Residents are a scale reference, never a second security or language key.
 *  Mineral jackets and matte ceramic faces stay calm beside data colours. */
export const EPHE_PALETTE = {
  jackets: ["#426976", "#51786d", "#626e8b", "#82775f", "#527980", "#716e86", "#3f6971", "#796d60"],
  shells: ["#e9e4d9", "#dce6dd", "#e3e8ed", "#e8dfd5"],
  visor: "#253c47",
  eyes: "#eff8f6",
  boots: "#344850",
  helmet: "#c7b888",
} as const;

// One coherent day, and the one place it is not allowed to go.
//
// The shipped world was high-key: haze 0.818 relative luminance, ground 0.565,
// crossing 0.914, zenith 0.555. The band the city stands on and the sky above it
// were 8.2 ΔE00 apart, the ground rendered at 211,220,224 against an albedo of
// 183,201,210, and the brightest object in the frame was a zebra crossing. A
// light city on a light floor under a light sky is one value with a few
// outlines, and no facade colour could win against that.
//
// What changed: the asphalt went 29.4 ΔE00 BELOW the plaza floor, so the street
// network reads as the ground's negative instead of as a third facade family;
// the markings gave up most of their loudness (crossing 0.914 → 0.456, and
// 26.4 ΔE00 from the asphalt it is painted on instead of 31.6); the sky got a
// real gradient (zenith 0.278 against the horizon's 0.707, where the shipped
// pair was 0.555 against 0.818); `sunDirection` came down to 25° elevation so a
// plot's two visible facades land on different sides of one light.
//
// What did not change, and why. The atmosphere was first moved to late
// afternoon — haze to 0.065, forty-five ΔE00 under the floor — and the frame
// gained exactly the depth the brief asked for. It also deleted a metric. The
// far-zoom heat grid is drawn UNLIT on this floor, and its two calmest levels
// (`THREAT_COLOR.safe`, `UNCHECKED_COLOR`) are darker than any dusk haze:
// measured in pixels, `safe` fell to 1.64:1 against the ground under it and
// `unchecked` to 2.07:1, where `hudLegibility.test.ts` asks for 2.5:1. Re-tuning
// the tiles does not rescue it either — lifting `safe` to clear a dark haze
// collapses its lightness ordering against `unchecked`, and that pair is the
// product's "looked, found nothing" against "nobody looked". Light floor and
// dark distance cannot both hold the grid.
//
// So the haze stays lighter than every calm heat level — `worldPicture.test.ts`
// pins that relationship. The current daylight pass brightens the ground and
// horizon while keeping the measured contrast between roads, heat cells and
// architecture.
//
// `skyTop === fog` still holds, and `GROUND_STOPS.rise` is still `fog`: the
// ground plane dissolves into the horizon at the far end of its ramp, so the
// rim of the quad is not an edge.

export const ENV = {
  skyTop: "#e0e9e5",
  // The horizon and the far ground are the SAME value on purpose: the plane
  // dissolves into it, so the sky has to arrive there exactly.
  //
  // Lighter than every calm heat level; the contrast floor is measured in
  // `worldPicture.test.ts` and `hudLegibility.test.ts`.
  fog: "#e0e9e5",
  /** Zenith stop of the sky dome — cooler and a full value below the haze. */
  skyZenith: "#6b93c0",
  /** The key light's own family, pooled into the sky around its azimuth. */
  skySun: "#e8d2b4",
  /** Where the sun is. The key light is placed from this, the sky glows to it. */
  sunDirection: [70, 34, 30],
  // Pale sage land and limestone plots separate living ground from built code.
  // Neither is a language or risk channel; the colour-distance guards cover both.
  ground: "#d1e0bd",
  plot: "#e6e1d4",
  plotEdge: "#7d909b",
  road: "#5c6a74",
  curb: "#93a2a9",
  crosswalk: "#aab6bb",
  laneDash: "#b0ab97",
  streetlight: "#ffd9a0",
  windowWarm: "#ffc470",
  windowCool: "#d9cfae",
  windowAlarm: "#ff4d5e",
  connection: "#e8b23c",
  selection: "#e8503c",
} as const;
