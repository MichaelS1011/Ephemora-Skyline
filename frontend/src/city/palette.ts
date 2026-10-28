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
//    annealing, in a local optimiser script that is not shipped) to maximise
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

/**
 * The same alarms where they are a WORD rather than a dot, a rule or a beacon.
 *
 * Measured on the control glass at its brightest stage — the plaza at
 * `#e6e1d4` behind α 0,75 composites to `#4d4d4d`, and there `P0` reads 2,18:1,
 * the colour-blind vermilion 2,24:1 and the colour-blind blue 1,95:1. A 12 px
 * sentence needs 4,5, so these are the steps that clear it.
 *
 * The binding ground is not the plaza but the horizon haze (`#e0e9e5`, Y 0,798)
 * under the glass's own 5 % sheen, and the mixes below are the smallest step
 * toward white that clears 4,5 there for each tone (58 % / 38 % / 0 and
 * 54 % / 60 % / 25 %). The half-hundredth between the previous table and this one
 * is a model gap, not a taste gap: the case that judges these words composed the
 * tint over the ground and forgot the sheen, while the case that judges every
 * other ink on the shell included it. `frontend/tests/glas-chrome.test.ts` now
 * washes both fields the same way and recomputes all six ratios, so the two
 * cannot disagree again.
 *
 * The signal itself keeps its pure tone: only the ink that spells a word lifts.
 */
const SEVERITY_TEXT_MIX: Record<Severity, number> = { P0: 0.58, P1: 0.38, P2: 0 };
const SEVERITY_TEXT_MIX_CVD: Record<Severity, number> = { P0: 0.54, P1: 0.6, P2: 0.25 };

export function severityTextColor(sev: Severity, colorblind: boolean): string {
  const mix = colorblind ? SEVERITY_TEXT_MIX_CVD[sev] : SEVERITY_TEXT_MIX[sev];
  return mix === 0
    ? severityColor(sev, colorblind)
    : mixTowardWhite(severityColor(sev, colorblind), mix);
}

/** Calm beacon colour for fully reviewed files ("nothing left to do here"). */
export const REVIEWED_BEACON_COLOR = "#29d398";

/**
 * Three signals that are NOT severities and must never be read as such: the
 * wireframe a failing test suite draws around a building, the glow a passing
 * one lays at its base, and the ring a circular import puts at its foot. The
 * two reds carried the same value as `P0` while they lived as literals in
 * `Building.tsx`, which made an alarm-colour guard unable to tell a finding
 * from a red test. They keep their values; they no longer share a name with the
 * severity table. That the fail/pass pair is a red/green pair is a separate
 * open point — it is carried by shape (a wireframe cage against a base slab),
 * not by hue.
 */
export const TEST_FAIL_COLOR = "#ff2e4d";
export const TEST_PASS_COLOR = "#29d398";
export const CYCLE_RING_COLOR = "#ff2e4d";
/** Chosen is gold; alarm red belongs to findings and cycles. */
export const BUILDING_SELECTION = "#e8b23c";

/**
 * The alarm band of the 3D city, as a function of the switch.
 *
 * Until now the switch reached every flat surface and stopped at the city
 * itself: the beacon followed it, the windows, the curb, the landmark beam and
 * the threat table did not. The measured reason they could not simply take the
 * CVD severity tone is a collision, not a taste: the pale of the loudest
 * colour-saver alarm (vermilion `#d55e00` mixed to `#e59a5f`) sits 6.35 ΔE00
 * from the git-erosion band `#ff9a3d`, which is the same defect class the switch
 * exists to remove. The window pair therefore takes `P1`'s blue — worst-case
 * 24.58 ΔE00 against every surface it shares a frame with — while the curb,
 * whose neighbour is a dark blue-grey kerb stone (blue would be 14.60 there),
 * takes the vermilion.
 *
 * The pale is derived, never picked: the shipped pair `#ff4d5e → #ff8f9a`
 * implies a white mix of 0.372, and reusing that factor is what keeps the
 * unswitched branch byte-identical.
 */
const ALARM_PALE_MIX = 0.372;

function mixTowardWhite(hex: string, t: number): string {
  const chan = (i: number): string => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + t * (255 - v))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${chan(1)}${chan(3)}${chan(5)}`;
}

export interface AlarmWindowTones {
  lit: string;
  pale: string;
}

export function alarmWindowColors(colorblind: boolean): AlarmWindowTones {
  const lit = colorblind ? SEVERITY_CVD_COLOR.P1 : ENV.windowAlarm;
  return { lit, pale: mixTowardWhite(lit, ALARM_PALE_MIX) };
}

/** The kerb stones of a plot that holds a critical finding. */
export function curbAlarmColor(colorblind: boolean): string {
  return colorblind ? SEVERITY_CVD_COLOR.P0 : ENV.windowAlarm;
}

/** The lighthouse column over the city's loudest file. */
export function landmarkBeamColor(colorblind: boolean): string {
  return colorblind ? SEVERITY_CVD_COLOR.P0 : ENV.windowAlarm;
}

export function threatColor(level: ThreatLevel, colorblind: boolean): string {
  switch (level) {
    case "critical":
      return severityColor("P0", colorblind);
    case "high":
      return severityColor("P1", colorblind);
    case "medium":
      return severityColor("P2", colorblind);
    default:
      // `low` is the reviewed calm green and `safe` a legibility-pinned floor
      // tone; neither is a severity, so neither moves with the switch.
      return THREAT_COLOR[level];
  }
}

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

/**
 * The complexity ramp as a CSS gradient, for the one legend row that shows it.
 * It lives here because the row has to move with `complexityColor`: the shipped
 * key painted the normal-vision ramp in both branches, which is a caption
 * describing a picture the switch had already replaced.
 */
export function heatLegendGradient(colorblind: boolean): string {
  if (colorblind) {
    return `linear-gradient(90deg, ${OKABE_BLUE}, ${OKABE_AMBER}, ${OKABE_VERMILION_DARK})`;
  }
  return `linear-gradient(90deg, #3dd6c4, ${SEVERITY_COLOR.P2}, #ff2ea6)`;
}

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
 * This section used to carry `DUSK_LIFT` + `liftHexForDusk`, an additive HSL
 * lift that kept the calm heat tiles off a dusk ground. Nothing in the render
 * path ever called it: HeatCells paints `threatColor(...)` and
 * `UNCHECKED_COLOR` directly, so the lift was a number the guard test read and
 * the picture never saw. Measured on the daylight band the world carries now,
 * the unlifted tiles clear the floor on their own — `safe` 6.44:1 and
 * `unchecked` 3.91:1 against `ENV.ground`, floor 2.5:1 — so the lift was
 * deleted together with the ground it was tuned for. Re-tune the band toward
 * dusk and the guard in `tests/hudLegibility.test.ts` is what tells you.
 */

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

/**
 * Residents are a scale reference, never a second security or language key.
 * Mineral jackets and matte ceramic faces stay calm beside data colours.
 *
 * Every value here is set against the size a resident is actually seen at, and
 * that size has TWO scales, not one. The district camera looks down at
 * `WORLD_OVERVIEW_ELEVATION` = 0.68 rad, so a vertical world unit lands on
 * 0.7776 of a screen unit and a horizontal one on the whole of it: a resident
 * measured 20 px tall on the plate is 14.82 px per local unit UP and 19.05 px
 * per local unit ACROSS, and at 30 px it is 22.22 up / 28.58 across. The band
 * 20–30 px is what the operator's two independent measurements (a motion diff
 * and a static luminance profile) put the running app at, and every number in
 * this file is checked against BOTH ends — see `ephe-readability.test.ts`.
 * Selecting a resident does NOT bring the camera closer (`called` only stops
 * the walker and turns it), so there is no close-up state in which a finer
 * value edge would ever be visible. The floors below are stated in contrast
 * ratio and enforced in `ephe-readability.test.ts`:
 * - 1.4:1 minimum for an edge INSIDE the figure (coat hem, boot line) — the
 *   narrowest band that still survives as a step on a 2.9 px wide limb at the
 *   small end of the band, after tone mapping, fog and 8-bit quantisation;
 * - 1.7:1 for the arm, which has to separate from the coat it hangs in front
 *   of AND stay inside the figure's own silhouette;
 * - 9:1 for the head mass, which is 4.2 px tall and 4.9 px wide at the small
 *   end of the band, floats on sky, plaza or facade, and gets no outline to
 *   help it. It used to be 7:1, and 7:1 was chosen without doing the arithmetic
 *   on the road: the plaza (0.705) and the asphalt (0.138) are 4.007 ratio
 *   points apart, so for ANY head tone darker than the asphalt the plaza edge
 *   is exactly 4.007× the asphalt edge. 7:1 on the plaza therefore *forced*
 *   1.75:1 over the road, and darkening the hair raises both edges at once —
 *   there was never a trade to make. The tones below sit at ≥10.9:1 / ≥2.73:1.
 * The block two before this one had the arm at exactly 1.000:1 (the sleeve wore
 * the jacket's own hex) and the head at 1.004-1.056:1 against fog, plaza and
 * plot — a figure with an invisible arm and an invisible skull.
 */
export const EPHE_PALETTE = {
  jackets: ["#426976", "#51786d", "#626e8b", "#82775f", "#527980", "#716e86", "#3f6971", "#796d60"],
  /**
   * Index-aligned with `jackets`: the same mineral, 42% of the way to the pale
   * shell. This is the arm. It is the only mass on the figure that overlaps
   * another mass (it hangs in front of the coat), so it is the only one whose
   * edge cannot be rescued by silhouette — it has to be carried by value.
   * 1.79-2.09:1 against its own jacket (the pairing the renderer uses), 1.53:1
   * worst case across any mix, 1.78-2.08:1 against the plaza behind it, and
   * ≥4.3:1 against the boots, so a swinging arm never merges with the leg it
   * passes. The column itself is 2.86 px wide at the small end of the size band
   * and 4.29 px at the large end.
   */
  sleeves: ["#859d9f", "#8ea59a", "#98a0ab", "#aaa592", "#8ea6a5", "#a0a0a8", "#839d9c", "#a59f92"],
  /**
   * Trousers sit between the boots and the darkest jacket in relative
   * luminance (0.068…0.070 against 0.034 and 0.124), so the leg reads as its own
   * mass: darker than the coat above it, lighter than the boot under it. The
   * gaps are the point — at the small end of the size band the hem is a 6.2 px
   * coat meeting a 10.4 px leg column, and the old 1.17:1 worst-case step was
   * small enough that the coat ran into the legs and the figure lost its waist.
   * Now ≥1.44:1 at the hem and ≥1.40:1 at the boot — AND, since the coat is a
   * flared lathe and the hips are pulled in, a 0.91 px ledge in the silhouette
   * at the same line, so the waist no longer depends on the value step alone.
   */
  trousers: ["#404b57", "#514a41", "#3f4d43"],
  /** Skin: the face band and the hands, the figure's two light accents. */
  shells: ["#e9e4d9", "#dce6dd", "#e3e8ed", "#e8dfd5"],
  /**
   * Hair, not a visor. The skull is the dark mass and the skin band is the
   * light face inside it — the inverse of what this palette used to do, chosen
   * because the world is high-key: a pale head measured 1.004:1 against the
   * fog, 1.009:1 against a plot and 1.056:1 against the plaza, i.e. it had no
   * edge with anything except asphalt (4.2:1).
   *
   * Round 1 stopped here and called the asphalt a cost. It was the wrong
   * conclusion: these four tones sit at L 0.0149…0.0191, which is ≥10.9:1
   * against plaza, plot and fog, ≥11.5:1 against the skin they carry, 5.8:1
   * against the kerb stone the crowd actually walks on, 7.3:1 against the zebra
   * it crosses on, and 2.73:1 against bare asphalt. That last number is the
   * point of the block: the head now holds the 2.5:1 this project demands of
   * every other edge in the world, on the one surface where it previously sat
   * under it at 2.36:1 — and the four tones are no less distinct from each
   * other than the old family was (pairwise ΔE00 2.2…7.6 against 1.6…7.1).
   * The head and the cap share this family, so the figure's identity mass is
   * one value everywhere it is seen.
   */
  hair: ["#16242c", "#1a2733", "#122329", "#1d2634"],
  /** Ink, because the face it sits on is now the light one. 0.61 px across on a
   *  20 px resident and 0.91 px on a 30 px one — below the pixel floor, kept
   *  only so the face does not go blank if a camera ever does come close. */
  eyes: "#20262e",
  boots: "#26363d",
  helmet: "#c7b888",
  /** The contact patch a figure puts on the ground. Neutral, no hue to key. */
  contact: "#1c2126",
  /** The one gold selection mark; UI, never a finding grade. */
  selection: "#e8b23c",
} as const;

/** Everything one resident is dressed with. */
export interface EpheOutfit {
  readonly coat: string;
  readonly sleeve: string;
  readonly trouser: string;
  readonly skin: string;
  readonly hair: string;
  readonly boot: string;
  readonly eye: string;
  readonly ground: string;
}

/**
 * MASTER-2027 §04.05 — a whole outfit taken by ONE index.
 *
 * This is the crowd's own pairing (`Pedestrians.tsx:1217-1239`): coat and sleeve
 * come from the same column because the sleeve is the one mass that overlaps
 * another mass, and the other families wrap around their own length. Keeping the
 * rule in the palette instead of in a second renderer is the point — a variant
 * that a vitrine could dress a resident in, but the city could never walk, would
 * be the second architecture §22 forbids.
 *
 * Free mixing was measured and rejected (`kontraste.json`: worst arm against
 * "its" coat 1,53:1, below the 1,78:1 the same arm holds against the ground it
 * stands on). So an index, not eight pickers.
 */
export function epheOutfit(index: number): EpheOutfit {
  const p = EPHE_PALETTE;
  return {
    coat: p.jackets[index % p.jackets.length]!,
    sleeve: p.sleeves[index % p.sleeves.length]!,
    trouser: p.trousers[index % p.trousers.length]!,
    skin: p.shells[index % p.shells.length]!,
    hair: p.hair[index % p.hair.length]!,
    boot: p.boots,
    eye: p.eyes,
    ground: p.contact,
  };
}

/**
 * The palette indices offered as variants. 0 is the shipped first family, so a
 * reader who never touches the switch sees exactly the figure the crowd draws.
 *
 * Distance decides, not contrast: all eight columns hold every band the palette
 * documents, so the only thing that separates a variant from a nuance is how far
 * the jackets sit from each other in CIEDE2000 — measured pairwise, because two
 * chips that are one jacket to each other are one chip too many.
 *
 * The arithmetic is `tests/colourMath.ts` (the guard's own, and the more precise
 * of the two: the §04.05 probe carries a rounded Lab matrix and differs by up to
 * 0,10 in the last digit). The offered three sit 12,86 (0↔1) · 20,58 (1↔7) ·
 * 21,20 (0↔7) apart. Excluded: 6 (2,94 to 0) and 4 (6,64) are the same jacket in
 * another light, 3 is 6,21 from 7 and 2 is 6,48 from 5 — pairs that would put two
 * nearly identical chips side by side. A fourth chip IS reachable (1↔2 is 21,93,
 * 0↔2 is 14,17), but both remaining candidates sit on a band foot: index 2 and
 * index 5 put trouser against boot at exactly the documented 1,40, and index 3
 * sits on the arm's 1,79. §04.05 chose 7 over 3 for that reason and §04.06 keeps
 * the rule, so the row stays three wide.
 */
export const EPHE_VARIANTS = [0, 1, 7] as const;

/**
 * The mark of §04.07, and "none" is one of its three states: the brief asks for
 * an *optional* Erkennungszeichen, not a uniform. Two shapes only — a dot and a
 * diamond — because the figure stays "klein, geometrisch, low-poly-treu" and a
 * third shape would be a costume.
 *
 * Declared here rather than in the vitrine because the storage module
 * (`epheLook.ts`) has to validate a stored mark, and a storage module that
 * imports a WebGL component cannot be tested without one.
 */
export const EPHE_MARKS = ["none", "dot", "diamond"] as const;
export type EpheMark = (typeof EPHE_MARKS)[number];

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
  /**
   * The static import tube borrows the two direction colours the legend
   * already teaches — cyan arrives, violet leaves — because the hue band a
   * third colour would have to sit in (25°–50°) is already held by the
   * severity beacons and the clone laser. Measured in `worldPicture.test.ts`.
   */
  importIn: "#37e6ff",
  importOut: "#b06bff",
  /**
   * Neither core clears the daylight frame on its own: violet reaches 1.03:1
   * against the zenith, cyan 1.03:1 against the sun glow. The casing is what
   * makes the arc visible — it holds ≥ 3.1:1 against every surface in ENV.
   */
  arcCasing: "#141a24",
  selection: "#e8503c",
} as const;

/**
 * The airshow's own coat — the aircraft and the banner it tows. Both values are
 * already in ENV, so no new colour enters the world: the hull and the cloth's
 * plate are the arc casing (14,1:1 against the haze, 5,45:1 against the zenith),
 * and the copy is the plot ink on that plate (13,37:1). The plate is not
 * decoration: the same ink reaches only 1,05:1 against the haze, so a banner
 * without its dark ground is a sentence written on weather.
 */
export const AIRSHOW_LIVERY = {
  hull: ENV.arcCasing,
  plate: ENV.arcCasing,
  ink: ENV.plot,
  /** The airframe's three tints, all of them tokens the street already paints:
   *  kerb and lane dash for the body and wings, the plot ink for the glass. A
   *  near-black hull alone read as a silhouette against the sky (measured on the
   *  recorded flight frames), and a second colour had to come from somewhere
   *  that was not a new hex. */
  body: ENV.curb,
  wing: ENV.laneDash,
  glass: ENV.plot,
} as const;
