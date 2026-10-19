/**
 * The glass reads what is behind it.
 *
 * Apple's Materials page (updated 9 September 2025) prescribes the behaviour in
 * two sentences: the *regular* variant "blurs and adjusts the luminosity of
 * background content to maintain legibility", and the dimming layer is asked for
 * only "if the underlying content is bright". A fixed tint does the opposite of
 * both: it films over the dark towers, where nothing needs covering, and the
 * bright plaza is the only place that actually forces the density.
 *
 * Measured, over the grounds this city paints (the floor `glas-chrome.test.ts`
 * holds to 4,5:1 for the inks on the glass):
 *
 *   plaza #e6e1d4  Y 0,754 → neutral ink needs α 0,59, the quiet second ink 0,67
 *   nebel #e0e9e5  Y 0,798 → α 0,60 / 0,68
 *   feldweg        Y 0,456 → α 0,47 / 0,58
 *   asphalt        Y 0,049 → α 0,00
 *   fassade        Y 0,033 → α 0,00
 *
 * So the ramp below is not a taste curve: its top rung is the brightest ground's
 * measured floor, its bottom rung is where the picture behind the panel is dark
 * enough that the ink needs no help at all. `tests/glas-chrome.test.ts` walks
 * the same table against the real grounds and fails any rung that lets an ink
 * fall under AA.
 */

/** Relative luminance of an 8-bit sRGB triplet (WCAG 1.4.1 definition). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The measured ladder: for the luminance of the picture behind a panel, the
 * stage that keeps every ink on the shell at 4,5:1. Read it as pairs — the rungs
 * are interpolated linearly between them.
 *
 * Each row is the binding ink over a ground the city actually paints, plus a
 * margin of one hundredth: `--meta` (#98948a, the header's caption ink) is the
 * quietest thing that sits on this glass, and it is what the ladder follows.
 * The bright end is today's fixed value; the dark end is where the feature
 * lives — over a shadowed facade seven tenths of the picture passes through.
 *
 *   Y      ground behind the panel                     α
 *   0,000  a dark facade, the monolith mass           0,30
 *   0,020                                          0,36
 *   0,040                                          0,50
 *   0,060                                          0,62
 *   0,100                                          0,74
 *   0,140  asphalt (ENV.road #5c6a74)               0,79
 *   0,200                                          0,83
 *   0,300  kerb stone (ENV.curb #93a2a9)            0,87
 *   0,456  the field path (ENV.crosswalk #aab6bb)   0,90
 *   0,600                                          0,92
 *   0,800  the plaza #e6e1d4, the sky #e0e9e5       0,92
 */
export const GLASS_ALPHA_MIN = 0.3;
export const GLASS_ALPHA_MAX = 0.92;

const RAMP: ReadonlyArray<readonly [number, number]> = [
  [0, 0.3],
  [0.02, 0.36],
  [0.04, 0.5],
  [0.06, 0.62],
  [0.1, 0.74],
  [0.14, 0.79],
  [0.2, 0.83],
  [0.3, 0.87],
  [0.456, 0.9],
  [0.6, 0.92],
  [0.8, 0.92],
];

/**
 * The stage a panel takes for a backdrop of relative luminance `Y`.
 *
 * Monotone by construction, and clamped to the two ends of the ladder: the
 * floor is where the glass is genuinely clear, the ceiling is today's value, so
 * a panel over the plaza in daylight looks exactly as it did before this file
 * existed. `tests/glas-chrome.test.ts` walks the ladder against the real grounds
 * and fails any rung that lets a listed ink fall under AA.
 */
export function glassAlphaFor(Y: number): number {
  if (!Number.isFinite(Y)) return GLASS_ALPHA_MAX;
  if (Y <= RAMP[0]![0]) return RAMP[0]![1];
  const last = RAMP[RAMP.length - 1]!;
  if (Y >= last[0]) return last[1];
  for (let i = 1; i < RAMP.length; i++) {
    const [y1, a1] = RAMP[i]!;
    if (Y > y1) continue;
    const [y0, a0] = RAMP[i - 1]!;
    const t = (Y - y0) / (y1 - y0);
    return Math.round((a0 + t * (a1 - a0)) * 100) / 100;
  }
  return last[1];
}

/** How far the stage may move before the panel is re-painted. A glass that
 *  breathes with every frame is the disturbance the whole feature must avoid. */
const HYSTERESIS = 0.04;
/** The panel is decided on a 12 × 8 sample of its own rectangle, not on pixels. */
const GRID_W = 12;
const GRID_H = 8;
/** Two panels' width per second, at most: a camera flight moves the answer, a
 *  held frame does not. */
const MIN_INTERVAL_MS = 450;

export interface GlassSurface {
  el: HTMLElement;
  /** The canvas the picture comes from, or null when there is none (the world
   *  is not mounted, a test surface, the scene boundary is showing). */
  source: HTMLCanvasElement | null;
}

/** The downscale target, made on first use: the ramp above is pure arithmetic
 *  and `tests/glas-chrome.test.ts` reads it in a node environment without a
 *  document, so nothing here may touch the DOM at import time. */
let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;

function sampler(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (scratch === undefined) {
    if (typeof document === "undefined") scratch = null;
    else {
      const canvas = document.createElement("canvas");
      canvas.width = GRID_W;
      canvas.height = GRID_H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      scratch = ctx ? { canvas, ctx } : null;
    }
  }
  return scratch;
}

/** The mean luminance of the picture inside a rectangle, from the drawing
 *  buffer. `preserveDrawingBuffer: true` is what makes this a copy and not a
 *  re-render; the downscale to 12 × 8 is the whole cost. */
export function backdropLuminance(
  source: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): number | null {
  const held = sampler();
  if (!held || rect.width < 4 || rect.height < 4) return null;
  const { canvas: target, ctx } = held;
  const sx = (rect.x / viewport.width) * source.width;
  const sy = (1 - (rect.y + rect.height) / viewport.height) * source.height;
  const sw = (rect.width / viewport.width) * source.width;
  const sh = (rect.height / viewport.height) * source.height;
  if (!(sw > 0 && sh > 0) || sx < -sw || sy < -sh) return null;
  try {
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, GRID_W, GRID_H);
    void target;
    const data = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!);
      n += 1;
    }
    return n > 0 ? sum / n : null;
  } catch {
    // A tainted or lost buffer is not a reason to change the look: the caller
    // keeps the last stage, and the default stays the safe end of the ramp.
    return null;
  }
}

/**
 * Drive one panel's stage from what it currently covers.
 *
 * Returns true when the panel moved. The hysteresis is the point: without it a
 * slow camera drift walks the alpha through every hundredth and the chrome
 * shimmers, which is exactly the "stört" the feature exists to remove.
 */
export function applyGlassStage(
  el: HTMLElement,
  next: number,
  seen: WeakMap<HTMLElement, number>,
): boolean {
  const last = seen.get(el);
  if (last !== undefined && Math.abs(last - next) < HYSTERESIS) return false;
  seen.set(el, next);
  el.style.setProperty("--glass-chrome-bg", `rgba(14, 16, 21, ${next.toFixed(2)})`);
  return true;
}

export { HYSTERESIS, MIN_INTERVAL_MS, RAMP };
