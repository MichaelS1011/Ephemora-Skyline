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
 * Measured, over the grounds this city paints: each number is the lowest stage
 * at which that ink still reaches 4,5:1 on the frosted field (the tint, then the
 * 5 % sheen, then the ink — the same composite `glas-chrome.test.ts` builds).
 *
 *   ground            Y       primary  gold   alarm word P0   binding
 *   plaza #e6e1d4     0,754     0,59   0,64        0,745         P0
 *   fog   #e0e9e5     0,798     0,60   0,65        0,750         P0
 *   ground#d1e0bd     0,705     0,56   0,61        0,735         P0
 *   feldweg #aab6bb   0,456     0,47   0,54        0,675         P0
 *   kerb  #93a2a9     0,349     0,40   0,48        0,625         P0
 *   asphalt #5c6a74   0,138     0,02   0,15        0,390         P0
 *   facade  #17171a   0,009     0,00   0,00        0,000       floor
 *
 * The alarm word binds everywhere but on the dark end, so the ramp below is that
 * column plus two hundredths of margin, clamped to the ceiling the token carries
 * (0,75 — the word's own need on the horizon haze). The shell's old quiet grey
 * (#98948a) would have asked 0,907 on the plaza; that ink is not on a bar any
 * more, which is what let the middle of the curve come down at all.
 * `tests/glas-chrome.test.ts` walks the same table against the real grounds and
 * fails any rung that lets an ink fall under AA.
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
 * The measured ladder: for the luminance of the picture behind a control bar,
 * the stage that keeps every ink on that bar at 4,5:1. Read it as pairs — the rungs
 * are interpolated linearly between them.
 *
 * The ceiling is not a taste value. At 0,75 the quietest word on a bar (the
 * header caption on the control ladder, `--meta: #c6c2b9`) and the brightest one
 * (the dock's gold count, `--accent-gold: #ffd98a`) both keep 4,5:1 over the
 * lightest ground the city paints — the plaza at Y 0,754 — and `tests/glas-chrome
 * .test.ts` walks every rung against every ground and fails any pair below that.
 * The floor is where the feature lives: over a shadowed facade two thirds of the
 * picture passes through. Reading surfaces are not on this ramp —
 * `--material-read-bg` is a fixed, thick plate, because that is where the
 * 245-word card lives.
 *
 *   Y      ground behind the panel                        α
 *   0,000  a dark facade — the monolith #17171a is 0,009 0,30
 *   0,020                                                0,33
 *   0,040                                                0,36
 *   0,060                                                0,39
 *   0,100                                                0,42
 *   0,138  asphalt #5c6a74                               0,45
 *   0,200                                                0,52
 *   0,267  plaza rim #7d909b                             0,59
 *   0,349  kerb #93a2a9                                  0,645
 *   0,406  lane dash #b0ab97                             0,675
 *   0,456  field path #aab6bb                            0,695
 *   0,600                                                0,72
 *   0,754  plaza #e6e1d4 — the ceiling from here up      0,75
 *   0,800  horizon haze #e0e9e5 (0,798), sky zenith      0,75
 */
export const GLASS_ALPHA_MIN = 0.3;
export const GLASS_ALPHA_MAX = 0.75;

const RAMP: ReadonlyArray<readonly [number, number]> = [
  [0, 0.3],
  [0.02, 0.33],
  [0.04, 0.36],
  [0.06, 0.39],
  [0.1, 0.42],
  [0.138, 0.45],
  [0.2, 0.52],
  [0.267, 0.59],
  [0.349, 0.645],
  [0.406, 0.675],
  [0.456, 0.695],
  [0.6, 0.72],
  [0.754, 0.75],
  [0.8, 0.75],
];

/**
 * The stage a panel takes for a backdrop of relative luminance `Y`.
 *
 * Monotone by construction, and clamped to the two ends of the ladder: the floor
 * is where the glass is genuinely clear, the ceiling is the value the fixed sheet
 * carries, so a panel over the plaza in daylight looks the way the token says and
 * only the darker grounds make it clearer. `tests/glas-chrome.test.ts` walks the
 * ladder against the real grounds and fails any rung that lets a listed ink fall
 * under AA.
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
  el.style.setProperty("--glass-control-bg", `rgba(14, 16, 21, ${next.toFixed(2)})`);
  return true;
}

export { HYSTERESIS, MIN_INTERVAL_MS, RAMP };
