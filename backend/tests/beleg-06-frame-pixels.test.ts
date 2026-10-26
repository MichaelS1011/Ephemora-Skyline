import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import zlib from "zlib";

/**
 * BELEG-02 — the security-mode caption, measured on the two frames it points at.
 *
 * README.md, of `docs/assets/ui-workspace.png` and
 * `docs/assets/ui-security.png`: "Measured between the two frames with no tolerance and no region mask: 1.70 % of
 * the pixels differ, and on those the median colour sum falls from 372 to 271.""
 * CHANGELOG.md:41-43 claims each caption "is checked against the pixels it
 * describes". Both frames are 8-bit RGB PNGs in the repository, so the sentence
 * is decodable here: inflate the image data, undo the per-scanline filter, and
 * count. No tolerance and no region mask is applied, because the caption names
 * neither — a number that needs an undocumented threshold to reproduce is not a
 * measurement.
 */

const REPO = path.resolve(import.meta.dirname, "../..");

interface Raster {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

function decodePng(file: string): Raster {
  const buf = readFileSync(path.join(REPO, file));
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${file} is not a PNG`);
  }

  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  let interlaced = 0;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = off + 8;
    if (type === "IHDR") {
      width = buf.readUInt32BE(data);
      height = buf.readUInt32BE(data + 4);
      depth = buf[data + 8] ?? 0;
      color = buf[data + 9] ?? 0;
      interlaced = buf[data + 12] ?? 0;
    } else if (type === "IDAT") idat.push(buf.subarray(data, data + length));
    else if (type === "IEND") break;
    off = data + length + 4;
  }
  if (depth !== 8) throw new Error(`${file} is not 8-bit (depth ${depth})`);
  if (interlaced !== 0) throw new Error(`${file} is interlaced`);
  if (color !== 2 && color !== 6) throw new Error(`${file} has colour type ${color}`);
  const channels = color === 2 ? 3 : 4;

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++];
    const line = raw.subarray(read, read + stride);
    read += stride;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (out[row + x - channels] ?? 0) : 0;
      const b = y > 0 ? (out[row - stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (out[row - stride + x - channels] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = line[x]!;
          break;
        case 1:
          value = line[x]! + a;
          break;
        case 2:
          value = line[x]! + b;
          break;
        case 3:
          value = line[x]! + ((a + b) >> 1);
          break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          value = line[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`${file}: unknown filter ${filter} on row ${y}`);
      }
      out[row + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

/** R + G + B of one pixel. */
const colourSum = (r: Raster, i: number): number =>
  r.pixels[i]! + r.pixels[i + 1]! + r.pixels[i + 2]!;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

interface Comparison {
  before: Raster;
  after: Raster;
  /** indices of pixels that differ in any channel */
  diff: number[];
  /** how many pixels are byte-identical in all three channels */
  identical: number;
}

let measured: Comparison | undefined;

function compare(): Comparison {
  if (measured) return measured;
  const a = decodePng("docs/assets/ui-workspace.png");
  const b = decodePng("docs/assets/ui-security.png");
  const diff: number[] = [];
  let identical = 0;
  for (let i = 0; i < a.pixels.length; i += a.channels) {
    if (
      a.pixels[i] === b.pixels[i] &&
      a.pixels[i + 1] === b.pixels[i + 1] &&
      a.pixels[i + 2] === b.pixels[i + 2]
    )
      identical += 1;
    else diff.push(i);
  }
  measured = { before: a, after: b, diff, identical };
  return measured;
}

describe("the two frames the caption compares", () => {
  it("are the same picture size, or there is nothing to compare", () => {
    const { before: a, after: b } = compare();
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
    expect(a.width * a.height).toBe(1_600_000);
  });

  it("leave the picture the mode does not touch byte-identical", () => {
    // README.md:123 names what changes between the frames and what stays. A blanket
    // "over 98 % identical" was the old proxy for that and it measured the wrong
    // thing: how much city is on screen decides how many pixels the dimming can
    // reach, so a closer framing failed a claim that had not changed. The regions
    // below are the ones the sentence says stay as they were — sky, grass, the
    // project panel, the header and the dock — and they are checked exactly.
    const { before: a, diff, identical } = compare();
    const stride = a.width * a.channels;
    const inside = (y0: number, y1: number, x0: number, x1: number): number => {
      let hits = 0;
      for (const i of diff) {
        const px = (i % stride) / a.channels;
        const py = Math.floor(i / stride);
        if (py >= y0 && py < y1 && px >= x0 && px < x1) hits += 1;
      }
      return hits;
    };
    const regions: [string, number, number, number, number][] = [
      ["sky", 0, 55, 300, 1300],
      ["grass", 700, 980, 300, 430],
      ["header", 0, 55, 0, 300],
      ["project panel", 130, 780, 20, 290],
      ["the dock", 915, 985, 520, 1080],
    ];
    for (const [name, y0, y1, x0, x1] of regions) {
      expect(inside(y0, y1, x0, x1), `${name} changed between the two frames`).toBe(0);
    }
    // and the pair still has to be the same picture, not a different moment
    expect(identical / (a.width * a.height)).toBeGreaterThan(0.97);
  });
});

describe("the measured numbers in the caption (README.md:123)", () => {
  const sums = (frame: "before" | "after"): number[] => {
    const { before: a, after: b, diff } = compare();
    const r = frame === "before" ? a : b;
    return diff.map((i) => colourSum(r, i));
  };

  /**
   * The caption is tied to the frames, not to a constant in this file: the three
   * numbers are read out of README.md and compared with what the two PNGs say.
   * Edit the sentence without re-measuring and this goes red; change the frames
   * without editing the sentence and it goes red too.
   */
  const caption = (() => {
    const md = readFileSync(path.join(REPO, "README.md"), "utf-8");
    const m = md.match(
      /no tolerance and no region mask: ([\d.]+) % of the pixels differ, and on those the median colour sum falls from (\d+) to (\d+)/,
    );
    if (!m) {
      throw new Error(
        "the security caption no longer names its method and its three numbers in one breath",
      );
    }
    return { percent: m[1], before: Number(m[2]), after: Number(m[3]) };
  })();

  it("says in README exactly what the two frames measure", () => {
    const { before: a, diff } = compare();
    const percent = ((diff.length / (a.width * a.height)) * 100).toFixed(2);
    expect(percent, `README claims ${caption.percent} %, the frames give ${percent} %`).toBe(
      caption.percent,
    );
    expect(median(sums("before")), `README claims ${caption.before} before`).toBe(caption.before);
    expect(median(sums("after")), `README claims ${caption.after} after`).toBe(caption.after);
  });

  it("only ever darkens the buildings it changes", () => {
    const { before: a, after: b, diff } = compare();
    const darker = diff.filter((i) => colourSum(b, i) < colourSum(a, i)).length;
    expect(darker / diff.length).toBeGreaterThan(0.5);
  });
});
