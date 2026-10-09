// The shot must keep its proportions. These are the geometry guards for the
// three formats: the framed box carries the format's aspect, the copy is one
// scale for both axes, and the recorder is handed the codec it asked for
// rather than an assumption about the machine.
import { describe, it, expect, vi } from "vitest";
import {
  CAPTURE_FORMATS,
  FORMAT_ORDER,
  MAX_SKEW,
  fitRect,
  framingBox,
  pickMimeType,
  scaleRatio,
} from "../src/share/formats";
import { compositeFrame, type FrameCanvas } from "../src/share/capture";

const VIEW = { width: 1600, height: 1000 };

describe("framing", () => {
  it.each(FORMAT_ORDER)("keeps the %s proportions inside a 1600x1000 window", (id) => {
    const format = CAPTURE_FORMATS[id];
    const box = framingBox(format.aspect, VIEW.width, VIEW.height);
    expect(box.width).toBeLessThanOrEqual(VIEW.width);
    expect(box.height).toBeLessThanOrEqual(VIEW.height);
    expect(box.width / box.height).toBeCloseTo(format.aspect, 2);
    expect(box.left).toBe(Math.round((VIEW.width - box.width) / 2));
    expect(box.top).toBe(Math.round((VIEW.height - box.height) / 2));
  });

  it("gives the portrait shot its full height and trades width for it", () => {
    const box = framingBox(CAPTURE_FORMATS["9x16"].aspect, VIEW.width, VIEW.height);
    expect(box.height).toBe(VIEW.height);
    expect(box.width).toBeLessThan(box.height);
  });

  it("copies at one scale once the shot is framed, so nothing is stretched", () => {
    for (const id of FORMAT_ORDER) {
      const format = CAPTURE_FORMATS[id];
      const box = framingBox(format.aspect, VIEW.width, VIEW.height);
      const dpr = 2;
      const scale = scaleRatio(box.width * dpr, box.height * dpr, format.width, format.height);
      expect(scale.skew).toBeLessThan(MAX_SKEW);
      // Whole-pixel framing rounds the box, so the two axes differ by tenths
      // of a percent at worst. Half a percent is where a stretch would show.
      expect(Math.abs(scale.x - scale.y)).toBeLessThan(0.005);
    }
  });

  it("catches the stretch when the shot was never re-framed", () => {
    // The picture the app renders at 16:10, copied into a square output: 6 %
    // off on one axis, which is exactly the case the guard exists for.
    const scale = scaleRatio(1600, 1000, 960, 960);
    expect(scale.skew).toBeGreaterThan(MAX_SKEW);
  });
});

describe("the codec handed to MediaRecorder", () => {
  it("takes the first profile this browser answers to", () => {
    const supported = (type: string): boolean => type === "video/webm;codecs=vp8";
    expect(pickMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8"], supported)).toBe(
      "video/webm;codecs=vp8",
    );
  });

  it("says null when nothing is supported, which is what disables recording", () => {
    expect(pickMimeType(["video/webm;codecs=vp9"], () => false)).toBeNull();
  });

  it("never invents a codec the browser did not accept", () => {
    expect(pickMimeType(["video/mp4"], () => false)).toBeNull();
  });
});

describe("compositing one frame", () => {
  const ctx = (): { canvas: FrameCanvas; plates: number[][] } => {
    const plates: number[][] = [];
    const canvas = {
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      drawImage: vi.fn(),
      fillRect: vi.fn((): void => {}),
      fillText: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 7 }),
      beginPath: vi.fn(),
      roundRect: (x: number, y: number, w: number, h: number): void => {
        plates.push([x, y, w, h]);
      },
      fill: vi.fn(),
    } as unknown as FrameCanvas & {
      roundRect: (x: number, y: number, w: number, h: number) => void;
    };
    return { canvas, plates };
  };

  it("copies the source over the whole output box", () => {
    const { canvas } = ctx();
    compositeFrame(canvas, { width: 1280, height: 720 }, { width: 1280, height: 720 }, []);
    expect(canvas.drawImage).toHaveBeenCalledWith(
      { width: 1280, height: 720 },
      0,
      0,
      1280,
      720,
      0,
      0,
      1280,
      720,
    );
  });

  it("puts the project name at the top and the level names at the bottom", () => {
    const { canvas, plates } = ctx();
    compositeFrame(canvas, { width: 1280, height: 720 }, { width: 1280, height: 720 }, [
      { text: "solarlayout", slot: "project" },
      { text: "grid · tariffs", slot: "level" },
    ]);
    expect(plates).toHaveLength(2);
    const [top, bottom] = [box(plates, 0), box(plates, 1)];
    expect(top.y).toBeLessThan(bottom.y);
    for (const plate of [top, bottom]) {
      expect(plate.x).toBeGreaterThanOrEqual(0);
      expect(plate.y).toBeGreaterThanOrEqual(0);
      expect(plate.x + plate.w).toBeLessThanOrEqual(1280);
      expect(plate.y + plate.h).toBeLessThanOrEqual(720);
    }
  });

  it("shrinks a long name list to the frame instead of running over it", () => {
    const { canvas, plates } = ctx();
    compositeFrame(canvas, { width: 720, height: 1280 }, { width: 720, height: 1280 }, [
      { text: "einer".repeat(40), slot: "level" },
    ]);
    expect(box(plates, 0).w).toBeLessThanOrEqual(720);
  });
});

describe("fitting a frame without stretching it", () => {
  it("cuts nothing when the source already carries the output aspect", () => {
    const rect = fitRect(2560, 1440, 1280, 720);
    expect(rect).toMatchObject({ x: 0, y: 0, width: 2560, height: 1440, cropped: 0 });
  });

  it("takes the surplus off the axis that has it, evenly on both sides", () => {
    // 1605×1250 is 1.28, narrower than 16:9, so height goes and width stays.
    const tall = fitRect(1605, 1250, 1280, 720);
    expect(tall.x).toBe(0);
    expect(tall.width).toBe(1605);
    expect(tall.y).toBe(Math.round((1250 - tall.height) / 2));
    expect(tall.y).toBeGreaterThan(0);
    // 1600×1000 into a square output is too wide, so the sides go, evenly.
    const square = fitRect(1600, 1000, 960, 960);
    expect(square.y).toBe(0);
    expect(square.height).toBe(1000);
    expect(square.x).toBe(300);
    // A 9:16 window into 16:9 loses most of its height and nothing of its width.
    const portrait = fitRect(562, 1000, 1280, 720);
    expect(portrait.x).toBe(0);
    expect(portrait.width).toBe(562);
    expect(portrait.y * 2 + portrait.height).toBeCloseTo(1000, 0);
    for (const rect of [tall, square, portrait]) {
      expect(rect.cropped).toBeGreaterThan(0);
      expect(rect.cropped).toBeLessThan(0.7);
    }
  });

  it("keeps the copy uniform for any source aspect, which is what makes a stretched frame impossible", () => {
    for (const [w, h] of [
      [1605, 1250],
      [300, 150],
      [562, 1000],
      [1600, 1000],
      [2247, 1750],
      [1284, 1000],
      [100, 400],
    ] as Array<[number, number]>) {
      for (const id of FORMAT_ORDER) {
        const format = CAPTURE_FORMATS[id];
        const rect = fitRect(w, h, format.width, format.height);
        const scale = scaleRatio(rect.width, rect.height, format.width, format.height);
        // Whole-pixel rounding on a small source is the only slack allowed.
        expect(scale.skew).toBeLessThan(Math.max(MAX_SKEW, 2 / Math.min(rect.width, rect.height)));
      }
    }
  });
});

/** One recorded plate, with the index checks the assertions should not repeat. */
function box(plates: number[][], index: number): { x: number; y: number; w: number; h: number } {
  const plate = plates[index];
  if (!plate) throw new Error(`no plate at ${index}`);
  return { x: plate[0]!, y: plate[1]!, w: plate[2]!, h: plate[3]! };
}
