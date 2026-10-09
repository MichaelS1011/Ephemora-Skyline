/**
 * Output formats for a city video.
 *
 * The rule the geometry has to hold: a recorded frame is never stretched.
 * The shot is re-framed *before* it is rendered (the canvas gets the target
 * aspect, so three.js recomputes the camera aspect and shows more or less
 * scene), and the compositor then copies that frame onto the output canvas at
 * one scale for both axes. `scaleRatio` is the measurement that proves it.
 */

export type FormatId = "16x9" | "1x1" | "9x16";

export interface CaptureFormat {
  id: FormatId;
  /** Width / height. 16:9, 1, 9/16. */
  aspect: number;
  /** Pixels the recorder writes. Named in the UI next to the real file size. */
  width: number;
  height: number;
  /** Frame rate handed to `canvas.captureStream()`. */
  fps: number;
  /** Target bitrate for `MediaRecorder`. A setting, not a measurement. */
  bitsPerSecond: number;
}

export const CAPTURE_FORMATS: Record<FormatId, CaptureFormat> = {
  "16x9": {
    id: "16x9",
    aspect: 16 / 9,
    width: 1280,
    height: 720,
    fps: 30,
    bitsPerSecond: 6_000_000,
  },
  "1x1": {
    id: "1x1",
    aspect: 1,
    width: 960,
    height: 960,
    fps: 30,
    bitsPerSecond: 5_000_000,
  },
  "9x16": {
    id: "9x16",
    aspect: 9 / 16,
    width: 720,
    height: 1280,
    fps: 30,
    bitsPerSecond: 6_000_000,
  },
};

export const FORMAT_ORDER: FormatId[] = ["16x9", "1x1", "9x16"];

/**
 * Codec preference. Asked of the browser one entry at a time, so the string
 * shown in the UI is the one `MediaRecorder` was actually handed, not a guess
 * about what this machine encodes.
 */
export const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(
  candidates: string[] = MIME_CANDIDATES,
  supported: (type: string) => boolean = defaultIsSupported,
): string | null {
  return candidates.find((type) => supported(type)) ?? null;
}

function defaultIsSupported(type: string): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  try {
    return MediaRecorder.isTypeSupported(type);
  } catch {
    return false;
  }
}

/**
 * The box the live canvas is given while a recording runs, so that the shot
 * carries the output aspect instead of being cropped or pulled out of shape
 * afterwards. Centred in the viewport, as large as fits, whole pixels.
 */
export function framingBox(
  aspect: number,
  viewWidth: number,
  viewHeight: number,
): { width: number; height: number; left: number; top: number } {
  const byWidth = { width: viewWidth, height: Math.round(viewWidth / aspect) };
  const fit =
    byWidth.height <= viewHeight
      ? byWidth
      : { width: Math.round(viewHeight * aspect), height: viewHeight };
  return {
    width: fit.width,
    height: fit.height,
    left: Math.round((viewWidth - fit.width) / 2),
    top: Math.round((viewHeight - fit.height) / 2),
  };
}

/**
 * Copy scale from a source box to the output box. Equal x and y means the
 * picture keeps its proportions. Called with the CSS size of the canvas, which
 * is the size the camera was framed against.
 */
export function scaleRatio(
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number,
): { x: number; y: number; skew: number } {
  const x = outWidth / sourceWidth;
  const y = outHeight / sourceHeight;
  return { x, y, skew: Math.abs(x - y) / Math.max(x, y) };
}

/**
 * The centred region of the source that fills the output box without changing
 * proportions. If the source already carries the output aspect nothing is
 * taken off; otherwise the surplus is cut evenly from both sides, never
 * squeezed. This is what makes a stretched frame impossible rather than
 * unlikely: the copy can only ever be uniform.
 */
export function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number,
): { x: number; y: number; width: number; height: number; cropped: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight, cropped: 0 };
  }
  const aspect = outWidth / outHeight;
  let width = sourceWidth;
  let height = sourceWidth / aspect;
  if (height > sourceHeight) {
    height = sourceHeight;
    width = sourceHeight * aspect;
  }
  return {
    x: Math.round((sourceWidth - width) / 2),
    y: Math.round((sourceHeight - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
    cropped: 1 - (width * height) / (sourceWidth * sourceHeight),
  };
}

/** Anything past half a percent of difference would be visible in the frame. */
export const MAX_SKEW = 0.005;
