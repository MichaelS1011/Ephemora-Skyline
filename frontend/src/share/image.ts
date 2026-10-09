/** A local still from the same framed WebGL city used by the video recorder. */
import type { CityData } from "../city/types";
import {
  compositeFrame,
  drawCredit,
  findScene,
  type CompositeTelemetry,
  type FrameCanvas,
} from "./capture";
import { CAPTURE_FORMATS, framingBox, type FormatId } from "./formats";
import { datePart, frameTexts, safeFilePart } from "./privacy";

export interface CityImage {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  cropped: number;
  drawnTexts: string[];
}

const STYLE_PROPS = ["position", "left", "top", "width", "height", "margin"] as const;

/** Frame the renderer, then let its ResizeObserver draw at the new aspect. */
async function withFramedCanvas<T>(
  wrapper: HTMLElement,
  canvas: HTMLCanvasElement,
  aspect: number,
  draw: () => Promise<T>,
): Promise<T> {
  const saved = STYLE_PROPS.map(
    (prop) =>
      [
        prop,
        wrapper.style.getPropertyValue(prop),
        wrapper.style.getPropertyPriority(prop),
      ] as const,
  );
  const box = framingBox(aspect, window.innerWidth, window.innerHeight);
  try {
    for (const [prop, value] of [
      ["position", "absolute"],
      ["left", `${box.left}px`],
      ["top", `${box.top}px`],
      ["width", `${box.width}px`],
      ["height", `${box.height}px`],
      ["margin", "0"],
    ] as const)
      wrapper.style.setProperty(prop, value, "important");
    await new Promise<void>((resolve) => {
      const begun = window.performance.now();
      const check = (): void => {
        const actual = canvas.width / Math.max(1, canvas.height);
        if (Math.abs(actual / aspect - 1) < 0.01 || window.performance.now() - begun > 1000) {
          requestAnimationFrame(() => resolve());
        } else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    return await draw();
  } finally {
    for (const [prop, value, priority] of saved) {
      if (value) wrapper.style.setProperty(prop, value, priority);
      else wrapper.style.removeProperty(prop);
    }
  }
}

export async function captureCityImage(
  city: CityData,
  focusPath: string[],
  format: FormatId,
  showNames: boolean,
  includeCredit: boolean,
): Promise<CityImage> {
  const scene = findScene();
  if (!scene) throw new Error("no canvas");
  const preset = CAPTURE_FORMATS[format];
  return withFramedCanvas(scene.wrapper, scene.canvas, preset.aspect, async () => {
    const output = document.createElement("canvas");
    output.width = preset.width;
    output.height = preset.height;
    const context = output.getContext("2d", { alpha: false });
    if (!context) throw new Error("no 2d context");
    const telemetry: CompositeTelemetry = {
      drawnTexts: new Set(),
      frames: 0,
      scale: { x: 0, y: 0, skew: 1 },
      cropped: 0,
    };
    compositeFrame(
      context as unknown as FrameCanvas,
      scene.canvas,
      output,
      frameTexts(city, focusPath, showNames),
      telemetry,
    );
    if (includeCredit) drawCredit(context as unknown as FrameCanvas, output);
    const blob = await new Promise<Blob>((resolve, reject) => {
      output.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("empty image"))),
        "image/png",
      );
    });
    const name = showNames ? safeFilePart(city.repo.name) : "city";
    return {
      blob,
      fileName: `ephemora-${name}-${datePart(new Date())}.png`,
      width: output.width,
      height: output.height,
      cropped: telemetry.cropped,
      drawnTexts: [...telemetry.drawnTexts],
    };
  });
}
