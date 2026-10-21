/**
 * The recorder.
 *
 * Pipeline, in one line: the app's WebGL canvas → re-framed to the output
 * aspect by giving the canvas box that aspect while the shot runs (three.js
 * recomputes the camera, so nothing is cut out of a wider picture and nothing
 * is pulled into shape afterwards) → copied onto an output canvas of fixed
 * pixel size → `canvas.captureStream()` → `MediaRecorder` → a Blob the browser
 * saves. Everything happens in this tab. No server route is called and no byte
 * is uploaded; the file only leaves the machine when the user attaches it
 * somewhere himself.
 *
 * The output canvas is the only thing in the picture that can carry ink.
 * `compositeFrame` controls project names; `drawCredit` burns in the fixed
 * product mark, which is on every exported frame and cannot be switched off.
 * Both are testable before a file is shared.
 */

import type { FrameText } from "./privacy";
import { fitRect, framingBox, scaleRatio, type CaptureFormat } from "./formats";

/** A box with pixel dimensions: the source canvas, or a stand-in for one. */
export interface SourceBox {
  readonly width: number;
  readonly height: number;
}

/** The parts of `CanvasRenderingContext2D` the compositor touches. */
export interface FrameCanvas {
  fillStyle: string | unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  drawImage(
    source: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  roundRect?(x: number, y: number, w: number, h: number, r: number): void;
  fill(): void;
}

export interface CompositeTelemetry {
  /** Every distinct project string drawn into a frame. Empty is the rule. */
  drawnTexts: Set<string>;
  frames: number;
  /** Copy scale of the last frame. Uniform by construction. */
  scale: { x: number; y: number; skew: number };
  /** Largest share of the source that had to be cut off to keep proportions. */
  cropped: number;
}

const PLATE = "rgba(16,16,14,0.86)";

/** How close the canvas aspect has to come to the shot aspect before encoding. */
const ASPECT_TOLERANCE = 0.01;
/** Longest wait for the renderer to take the new box before recording anyway. */
const FRAMING_TIMEOUT_MS = 1000;
const INK = "#f2efe8";
const EDGE = "rgba(242,239,232,0.22)";
const BRAND_DOT = "#e8503c";

/** The attribution burned into every exported frame. Never project-derived. */
export const CREDIT_LEAD = "by ";
export const CREDIT_NAME = "Ephemora Skyline";
export const CREDIT_TEXT = `${CREDIT_LEAD}${CREDIT_NAME}`;

function frameFont(size: number): string {
  return `600 ${size}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
}

/** Where the mark sits in an output frame, in that frame's pixels. */
export interface CreditBox {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
}

/**
 * The mark's box. Its type scales with the short side, so a portrait shot
 * carries a caption rather than a billboard, and the names band can read how
 * much of the lower edge is already taken.
 */
export function creditLayout(ctx: FrameCanvas, out: SourceBox): CreditBox {
  const short = Math.min(out.width, out.height);
  const size = Math.max(13, Math.round(short * 0.021));
  ctx.font = frameFont(size);
  const pad = Math.round(size * 0.7);
  const dot = Math.round(size * 0.3);
  const width = Math.round(
    ctx.measureText(CREDIT_LEAD).width +
      ctx.measureText(CREDIT_NAME).width +
      pad * 2 +
      dot +
      Math.round(size * 0.4),
  );
  const margin = Math.round(short * 0.028);
  const height = Math.round(size * 2.3);
  return {
    x: out.width - width - margin,
    y: out.height - height - margin,
    width,
    height,
    size,
  };
}

/** Shorten a string until it fits a width, in the font the context now holds. */
function fitToWidth(ctx: FrameCanvas, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ratio = maxWidth / Math.max(1, ctx.measureText(text).width);
  let keep = Math.max(1, Math.floor(text.length * ratio) - 1);
  while (keep > 1 && ctx.measureText(`${text.slice(0, keep)}…`).width > maxWidth) keep -= 1;
  return `${text.slice(0, keep)}…`;
}

/**
 * Draw one frame. Pure: the same inputs give the same calls, so the anonymity
 * test can run it against a recording stand-in for the context and read every
 * string that would have reached the video.
 */
export function compositeFrame(
  ctx: FrameCanvas,
  source: SourceBox,
  out: SourceBox,
  texts: FrameText[],
  telemetry?: CompositeTelemetry,
): void {
  // The centred part of the source that carries the output aspect. Copying that
  // region means the scale can only ever be uniform: a frame is cut, never
  // pulled out of shape, whatever the canvas was sized at this instant.
  const rect = fitRect(source.width, source.height, out.width, out.height);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
  if (telemetry) {
    telemetry.frames += 1;
    telemetry.scale = scaleRatio(rect.width, rect.height, out.width, out.height);
    telemetry.cropped = Math.max(telemetry.cropped, rect.cropped);
  }
  if (texts.length === 0) return;
  const margin = Math.round(out.height * 0.035);
  const mark = creditLayout(ctx, out);
  for (const item of texts) {
    const padX = (size: number): number => Math.round(size * 0.5);
    const boxH = (size: number): number => Math.round(size * 2);
    // The lower edge belongs to the mark from its left edge onward, so the
    // names band gets the room that is left: smaller type first, then a cut
    // name. A plate never runs underneath the mark, and no ink leaves the frame.
    const nominal = Math.round(out.height * (item.slot === "project" ? 0.032 : 0.026));
    const limit =
      item.slot === "project"
        ? out.width - margin
        : mark.x - padX(nominal) - Math.round(nominal * 0.6);
    let size = nominal;
    for (let step = 0; step < 6; step += 1) {
      ctx.font = frameFont(size);
      if (margin + ctx.measureText(item.text).width + padX(size) * 2 <= limit) break;
      if (size <= Math.round(nominal * 0.6)) break;
      size = Math.max(Math.round(nominal * 0.6), Math.round(size * 0.9));
    }
    ctx.font = frameFont(size);
    const text = fitToWidth(ctx, item.text, limit - margin - padX(size) * 2);
    const boxW = Math.min(
      Math.max(1, limit - margin),
      Math.round(ctx.measureText(text).width + padX(size) * 2),
    );
    const x = margin;
    const y = item.slot === "project" ? margin : out.height - margin - boxH(size);
    ctx.fillStyle = PLATE;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH(size), Math.round(boxH(size) / 4));
      ctx.fill();
    } else {
      ctx.fillRect(x, y, boxW, boxH(size));
    }
    ctx.fillStyle = EDGE;
    ctx.fillRect(x, y + boxH(size) - 1, boxW, 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK;
    ctx.fillText(text, x + padX(size), y + boxH(size) / 2);
    telemetry?.drawnTexts.add(text);
  }
}

/**
 * The product mark, in the lower-right corner of an exported frame. Fixed text
 * with no project-derived part, so it cannot undo the anonymity of a city that
 * was recorded without names.
 */
export function drawCredit(ctx: FrameCanvas, out: SourceBox): void {
  const box = creditLayout(ctx, out);
  const size = box.size;
  const pad = Math.round(size * 0.7);
  ctx.fillStyle = "rgba(15, 22, 24, 0.78)";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, Math.round(box.height * 0.2));
    ctx.fill();
  } else ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.font = frameFont(size);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const baseline = Math.round(box.y + box.height / 2);
  ctx.fillStyle = "rgba(245,242,233,0.72)";
  ctx.fillText(CREDIT_LEAD, box.x + pad, baseline);
  const nameX = box.x + pad + ctx.measureText(CREDIT_LEAD).width;
  ctx.fillStyle = "#f5f2e9";
  ctx.fillText(CREDIT_NAME, nameX, baseline);
  ctx.fillStyle = BRAND_DOT;
  const dot = Math.round(size * 0.3);
  ctx.fillRect(
    Math.round(nameX + ctx.measureText(CREDIT_NAME).width + size * 0.4),
    Math.round(baseline - dot / 2),
    dot,
    dot,
  );
}

/** The canvas the app renders into, plus the stream call the recorder needs. */
interface StreamCapable {
  captureStream?(frameRate?: number): MediaStream;
  mozCaptureStream?(frameRate?: number): MediaStream;
}

/** Firefox spelled the same call differently; both are here since 2026. */
function streamOf(target: HTMLCanvasElement): ((frameRate?: number) => MediaStream) | null {
  const capable = target as HTMLCanvasElement & StreamCapable;
  return capable.captureStream ?? capable.mozCaptureStream ?? null;
}

export interface RecorderOptions {
  format: CaptureFormat;
  mimeType: string;
  /** Called for every frame. Returning [] is the anonymous case. */
  frameTexts: () => FrameText[];
  canvas: HTMLCanvasElement;
  /** The element whose box is re-framed; its aspect becomes the shot's. */
  wrapper: HTMLElement;
  /** The box the shot is centred in. Defaults to the window. */
  viewPort?: () => { width: number; height: number };
  /** Called only after the encoder has opened on a correctly framed canvas. */
  onEncoderStarted?: () => void;
}

export interface RecordingMeasurement {
  blob: Blob;
  /** The final composited frame, so the preview shows the city that emerged. */
  posterDataUrl?: string;
  bytes: number;
  durationMs: number;
  frames: number;
  width: number;
  height: number;
  fps: number;
  mimeType: string;
  scale: { x: number; y: number; skew: number };
  /** Project strings drawn into the picture. Empty when names stayed off. */
  drawnTexts: string[];
  /** CSS pixels the canvas was framed at while the shot ran. */
  shotCssSize: { width: number; height: number };
  /** The codec string the encoder reported back, not the one requested. */
  recorderMime: string;
  /** Whether the canvas really took the shot's aspect before the first frame. */
  framed: boolean;
  /** Share of the source that was cut off to keep the picture in proportion. */
  cropped: number;
}

export class RecorderUnavailable extends Error {}

/** One recording. `start` frames the shot and opens the encoder. */
export class CityRecorder {
  private readonly opts: RecorderOptions;
  private readonly output: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly telemetry: CompositeTelemetry;
  private savedStyle: Record<string, string> | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private startedAt = 0;
  private bytesSoFar = 0;
  private shotCssSize = { width: 0, height: 0 };
  private finishing: ((m: RecordingMeasurement) => void) | null = null;
  private waitingForFrame = false;
  private framingSince = 0;
  private framed = false;
  private streamOf: ((frameRate?: number) => MediaStream) | null = null;

  constructor(opts: RecorderOptions) {
    this.opts = opts;
    this.telemetry = {
      drawnTexts: new Set<string>(),
      frames: 0,
      scale: { x: 0, y: 0, skew: 1 },
      cropped: 0,
    };
    this.output = document.createElement("canvas");
    this.output.width = opts.format.width;
    this.output.height = opts.format.height;
    const ctx = this.output.getContext("2d", { alpha: false });
    if (!ctx) throw new RecorderUnavailable("no 2d context");
    this.ctx = ctx;
  }

  /** Bytes written so far — a count of real chunks, not a projection. */
  get recordedBytes(): number {
    return this.bytesSoFar;
  }

  get elapsedMs(): number {
    return this.startedAt === 0 ? 0 : Math.round(window.performance.now() - this.startedAt);
  }

  get frames(): number {
    return this.telemetry.frames;
  }

  /** True while the shot is being framed and the encoder has not opened yet. */
  get framing(): boolean {
    return this.waitingForFrame;
  }

  start(): void {
    if (this.recorder || this.waitingForFrame) throw new RecorderUnavailable("already running");
    const { canvas, format } = this.opts;
    if (typeof MediaRecorder === "undefined") throw new RecorderUnavailable("no mediarecorder");
    const capture = streamOf(this.output);
    if (!capture) throw new RecorderUnavailable("no capture stream");
    this.streamOf = capture;

    this.frameShot(format);
    // The renderer takes the new box one pass later, so the frame that is
    // composited at the moment of the click may still carry the old
    // proportions. The compositor cuts rather than stretches, so nothing can
    // end up out of shape either way — but a shot that begins on the old,
    // wider frame shows less city than the user chose. So the encoder opens
    // once the canvas reports the aspect that was asked for, and at the latest
    // after one second.
    this.waitingForFrame = true;
    this.framingSince = window.performance.now();
    const waitForFrame = (): void => {
      if (!this.waitingForFrame) return;
      const ratio = canvas.width / Math.max(1, canvas.height);
      this.framed = Math.abs(ratio / format.aspect - 1) < ASPECT_TOLERANCE;
      if (this.framed || window.performance.now() - this.framingSince > FRAMING_TIMEOUT_MS) {
        this.openEncoder();
        return;
      }
      this.raf = requestAnimationFrame(waitForFrame);
    };
    this.raf = requestAnimationFrame(waitForFrame);
  }

  /** Open the encoder and start copying frames. Called once the shot is framed. */
  private openEncoder(): void {
    const { canvas, format } = this.opts;
    this.waitingForFrame = false;
    const stream = this.streamOf!.call(this.output, format.fps);
    this.stream = stream;
    const draw = (): void => {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        this.shotCssSize = { width: canvas.clientWidth, height: canvas.clientHeight };
      }
      compositeFrame(
        this.ctx as unknown as FrameCanvas,
        canvas,
        { width: this.output.width, height: this.output.height },
        this.opts.frameTexts(),
        this.telemetry,
      );
      drawCredit(this.ctx as unknown as FrameCanvas, this.output);
      this.raf = requestAnimationFrame(draw);
    };
    const recorder = new MediaRecorder(stream, {
      mimeType: this.opts.mimeType,
      videoBitsPerSecond: format.bitsPerSecond,
    });
    this.chunks = [];
    this.bytesSoFar = 0;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
        this.bytesSoFar += event.data.size;
      }
    };
    recorder.onstop = () => {
      const mime = recorder.mimeType || this.opts.mimeType;
      const blob = new Blob(this.chunks, { type: mime.split(";")[0] });
      let posterDataUrl: string | undefined;
      try {
        posterDataUrl = this.output.toDataURL("image/png");
      } catch {
        // A missing poster must never block the finished recording.
      }
      const measurement: RecordingMeasurement = {
        blob,
        posterDataUrl,
        bytes: blob.size,
        durationMs: Math.max(0, Math.round(window.performance.now() - this.startedAt)),
        frames: this.telemetry.frames,
        width: this.output.width,
        height: this.output.height,
        fps: format.fps,
        mimeType: this.opts.mimeType,
        scale: this.telemetry.scale,
        drawnTexts: [...this.telemetry.drawnTexts],
        shotCssSize: this.shotCssSize,
        recorderMime: mime,
        framed: this.framed,
        cropped: this.telemetry.cropped,
      };
      this.teardown();
      const done = this.finishing;
      this.finishing = null;
      done?.(measurement);
    };
    recorder.onerror = () => {
      this.teardown();
    };
    this.recorder = recorder;
    this.startedAt = window.performance.now();
    this.raf = requestAnimationFrame(draw);
    recorder.start(1000);
    this.opts.onEncoderStarted?.();
  }

  /** Close the encoder and resolve with the file plus what was measured. */
  stop(): Promise<RecordingMeasurement> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new RecorderUnavailable("not running"));
    return new Promise<RecordingMeasurement>((resolve) => {
      this.finishing = resolve;
      if (recorder.state !== "inactive") recorder.stop();
      else {
        const measurement = this.measurement(recorder.mimeType || this.opts.mimeType);
        this.teardown();
        this.finishing = null;
        resolve(measurement);
      }
    });
  }

  /** Give the screen back. Safe to call more than once. */
  dispose(): void {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch {
        // The browser may already have closed the encoder; teardown still owns
        // the tracks and the temporary canvas framing.
      }
    }
    this.teardown();
  }

  private measurement(mime: string): RecordingMeasurement {
    return {
      blob: new Blob(this.chunks, { type: mime.split(";")[0] }),
      bytes: 0,
      durationMs: this.elapsedMs,
      frames: this.telemetry.frames,
      width: this.output.width,
      height: this.output.height,
      fps: this.opts.format.fps,
      mimeType: this.opts.mimeType,
      scale: this.telemetry.scale,
      drawnTexts: [...this.telemetry.drawnTexts],
      shotCssSize: this.shotCssSize,
      recorderMime: mime,
      framed: this.framed,
      cropped: this.telemetry.cropped,
    };
  }

  private frameShot(format: CaptureFormat): void {
    const view = this.opts.viewPort?.() ?? {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const box = framingBox(format.aspect, view.width, view.height);
    const el = this.opts.wrapper;
    this.savedStyle = {
      position: el.style.position,
      left: el.style.left,
      top: el.style.top,
      width: el.style.width,
      height: el.style.height,
      margin: el.style.margin,
    };
    // `!important` because the app's own panel rules resize the canvas box with
    // `!important` as well, and a stylesheet of one lane cannot out-specify
    // every rule another lane may still write.
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("left", `${box.left}px`, "important");
    el.style.setProperty("top", `${box.top}px`, "important");
    el.style.setProperty("width", `${box.width}px`, "important");
    el.style.setProperty("height", `${box.height}px`, "important");
    el.style.setProperty("margin", "0", "important");
    this.shotCssSize = { width: box.width, height: box.height };
  }

  private restoreShot(): void {
    const el = this.opts.wrapper;
    for (const prop of ["position", "left", "top", "width", "height", "margin"]) {
      el.style.removeProperty(prop);
    }
    const saved = this.savedStyle;
    if (!saved) return;
    for (const [prop, value] of Object.entries(saved)) {
      if (value) el.style.setProperty(prop, value);
    }
    this.savedStyle = null;
  }

  private teardown(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stream) {
      for (const track of this.stream.getVideoTracks()) track.stop();
      this.stream = null;
    }
    this.recorder = null;
    this.restoreShot();
  }
}

/** Find the app's render canvas and the box that holds it. */
export function findScene(
  root: Document = document,
): { canvas: HTMLCanvasElement; wrapper: HTMLElement } | null {
  const canvas = root.querySelector<HTMLCanvasElement>(".city-canvas canvas");
  if (!canvas) return null;
  const wrapper =
    canvas.closest<HTMLElement>(".city-canvas") ??
    (canvas.parentElement as HTMLElement | null) ??
    undefined;
  if (!wrapper) return null;
  return { canvas, wrapper };
}
