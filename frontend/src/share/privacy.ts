/**
 * What a city video is allowed to say about the project it came from.
 *
 * The recording captures the WebGL canvas. Every street sign, name plate,
 * tooltip and panel in the app is DOM (drei `<Html>` and the overlay layer),
 * so it never reaches the file by construction. That is the whole anonymity
 * argument, and it holds only as long as the compositor controls all
 * project-derived ink. `frameTexts` decides that ink, and with the names
 * opt-in off it decides none. The one other piece of ink is the fixed product
 * mark, burned into every exported frame and carrying no project-derived text.
 *
 * Two more rules live here because they are about naming, not about pixels:
 * the download name stays generic until the person explicitly allows names,
 * and the caption numbers come out of the measured payload.
 */

import type { CityData } from "../city/types";

/** One piece of text the compositor is allowed to draw into the picture. */
export interface FrameText {
  text: string;
  slot: "project" | "level";
}

/** How many district names fit in the lower band before it stops being readable. */
const MAX_LEVEL_NAMES = 6;
/** Characters per drawn line, both slots. Longer strings are cut, not wrapped. */
const MAX_TEXT_LEN = 72;

/**
 * The text drawn into the recorded frame.
 *
 * `showNames` is opt-in and defaults to off in the studio. Off means the
 * returned list is empty, and an empty list means the compositor draws no
 * text at all: the video is geometry, colour and height, and names nothing.
 */
export function frameTexts(
  city: CityData | null,
  focusPath: string[],
  showNames: boolean,
): FrameText[] {
  if (!showNames || !city) return [];
  const out: FrameText[] = [];
  const project = clip(sanitizeText(city.repo.name || city.repo.owner));
  if (project) out.push({ text: project, slot: "project" });

  const level =
    focusPath.length > 0
      ? focusPath.map(sanitizeText).join(" / ")
      : city.tree.children
          .slice(0, MAX_LEVEL_NAMES)
          .map((child) => sanitizeText(child.name))
          .filter(Boolean)
          .join("  ·  ") + (city.tree.children.length > MAX_LEVEL_NAMES ? "  …" : "");
  const clipped = clip(level);
  if (clipped) out.push({ text: clipped, slot: "level" });
  return out;
}

/**
 * The name of the file the browser is told to save.
 *
 * A generic name is the default. The project name is used only with the same
 * explicit opt-in that puts names into the picture. Control characters and
 * separators are dropped from the opt-in name.
 */
export function downloadFileName(
  repoName: string,
  takenAt: Date,
  showNames = false,
  extension: "mp4" | "webm" = "webm",
): string {
  const name = showNames ? safeFilePart(repoName) : "city";
  return `ephemora-${name}-${datePart(takenAt)}.${extension}`;
}

/** One filesystem segment: no separators, no control characters, ≤ 48 chars. */
export function safeFilePart(raw: string): string {
  const cleaned = withoutControlChars(raw)
    .replace(/[\\/:\s]/g, "-")
    .replace(/[<>|"?*]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 48) : "city";
}

/**
 * Control characters go before the separator pass, so a `NUL` in the middle of
 * a name cannot leave two segments behind. Written as a loop because the
 * linted regex forms for it are read as an escape attempt.
 */
function withoutControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += char;
  }
  return out;
}

/** `2026-10-08`. Local calendar date, not UTC: the user reads it as today. */
export function datePart(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function sanitizeText(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").trim();
}

function clip(value: string): string {
  if (value.length <= MAX_TEXT_LEN) return value;
  return `${value.slice(0, MAX_TEXT_LEN - 1).trimEnd()}…`;
}

/**
 * Every name the payload knows about this project. Used by the tests and by
 * the studio's own check, so "nothing was revealed" is a comparison against
 * the real list rather than against a feeling.
 */
export function projectNames(city: CityData | null): string[] {
  if (!city) return [];
  const names = new Set<string>();
  const push = (value?: string): void => {
    const v = value?.trim();
    // Single letters and two-letter folder names are too common inside other
    // words to be a signal; the test would report every "a" as a leak.
    if (v && v.length >= 3) names.add(v);
  };
  push(city.repo.name);
  push(city.repo.owner);
  const walkDirs = (dir: CityData["tree"]): void => {
    push(dir.name);
    push(dir.path);
    for (const f of dir.detailFiles) {
      push(f.name);
      push(f.path);
      for (const c of f.clonePartners ?? []) push(c.path);
    }
    for (const f of city.additionalFiles ?? []) {
      push(f.name);
      push(f.path);
    }
    for (const child of dir.children) walkDirs(child);
  };
  walkDirs(city.tree);
  return [...names].sort((a, b) => b.length - a.length);
}

/** True when any known name appears in `text` — the leak predicate under test. */
export function mentionsProjectName(text: string, names: string[]): boolean {
  return names.some((name) => text.includes(name));
}
