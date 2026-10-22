import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "fs";
import path from "path";

/**
 * BELEG-02 — the numbers the demo clip is sold with.
 *
 * README.md:18 states the clip's seconds, frame size, rate and weight in one
 * sentence and adds "No sound, no cuts, no sped-up frames". CHANGELOG.md
 * repeats them. The data is the bytes of docs/assets/demo-city.mp4: an ISO
 * base-media file states its own track list, timescale, sample count and
 * display size, so every one of those numbers can be read back off the artifact
 * the README points at — and the sentence is read off README.md, so the two
 * cannot drift apart in silence.
 */

const FILE = path.resolve(import.meta.dirname, "../../docs/assets/demo-city.mp4");
const bytes = readFileSync(FILE);

/** What README.md:20 promises about this file. */
const claimed = (() => {
  const md = readFileSync(path.resolve(import.meta.dirname, "../../README.md"), "utf-8");
  const m = md.match(
    /The clip plays ([\d.]+) s at (\d+) × (\d+) and ([\d.]+) fps, ([\d,]+) KB, one video stream and no audio track/,
  );
  if (!m) {
    throw new Error(
      "the clip sentence no longer names its seconds, its frame size, its rate and its weight in one breath",
    );
  }
  return {
    seconds: Number(m[1]),
    width: Number(m[2]),
    height: Number(m[3]),
    fps: Number(m[4]),
    kb: Number(m[5]!.replace(/,/g, "")),
  };
})();

interface Box {
  type: string;
  /** payload start, after the 8- or 16-byte header */
  at: number;
  size: number;
  depth: number;
}

const CONTAINERS = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "edts",
  "udta",
  "meta",
  "ilst",
]);

function boxes(): Box[] {
  const out: Box[] = [];
  const walk = (start: number, end: number, depth: number): void => {
    let off = start;
    while (off + 8 <= end) {
      let size = bytes.readUInt32BE(off);
      const type = bytes.toString("latin1", off + 4, off + 8);
      let header = 8;
      if (size === 1) {
        size = Number(bytes.readBigUInt64BE(off + 8));
        header = 16;
      } else if (size === 0) size = end - off;
      if (size < 8 || off + size > end) {
        throw new Error(`truncated box ${type} at ${off} (size ${size}, room ${end - off})`);
      }
      out.push({ type, at: off + header, size, depth });
      if (CONTAINERS.has(type)) walk(off + header, off + size, depth + 1);
      off += size;
    }
  };
  walk(0, bytes.length, 0);
  return out;
}

const found = boxes();
const one = (type: string): Box => {
  const box = found.find((b) => b.type === type);
  if (!box) throw new Error(`no ${type} box in the clip`);
  return box;
};
const u32 = (at: number): number => bytes.readUInt32BE(at);
const u16 = (at: number): number => bytes.readUInt16BE(at);

/** Handler fourcc of each track ('vide', 'soun', …). */
const handlers = (): string[] =>
  found.filter((b) => b.type === "hdlr").map((b) => bytes.toString("latin1", b.at + 8, b.at + 12));

/** Display size from tkhd (version 0: matrix ends at payload +76). */
const trackSize = (): { width: number; height: number } => {
  const tk = one("tkhd");
  const version = bytes[tk.at];
  if (version !== 0) throw new Error(`tkhd version ${version} not handled here`);
  return { width: u32(tk.at + 76) / 65536, height: u32(tk.at + 80) / 65536 };
};

/** Media duration from mdhd (timescale, duration). */
const media = (): { timescale: number; duration: number } => {
  const md = one("mdhd");
  return { timescale: u32(md.at + 12), duration: u32(md.at + 16) };
};

/** Sample count and the frame deltas, from stts. */
const samples = (): { count: number; deltas: number[] } => {
  const st = one("stts");
  const entries = u32(st.at + 4);
  let count = 0;
  const deltas: number[] = [];
  for (let i = 0; i < entries; i++) {
    const run = u32(st.at + 8 + i * 8);
    const delta = u32(st.at + 12 + i * 8);
    count += run;
    for (let k = 0; k < Math.min(run, 2); k++) deltas.push(delta);
  }
  return { count, deltas };
};

/**
 * The frame count of a GIF, from its own block walk: every image descriptor
 * counts, its local colour table and its sub-blocks are stepped over. A byte
 * search for the Graphic Control marker is not a count — `21 F9` also occurs
 * inside compressed pixel data, where it measured 114 frames in a 70-frame file.
 */
const gifFrames = (gif: Buffer): number => {
  const table = (packed: number): number => (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
  let i = 13 + table(gif[10]!);
  let frames = 0;
  while (i < gif.length) {
    const label = gif[i]!;
    if (label === 0x3b) break;
    if (label === 0x2c) {
      frames += 1;
      i += 10 + table(gif[i + 9]!) + 1;
    } else if (label === 0x21) {
      i += 2;
    } else {
      i += 1;
      continue;
    }
    while (gif[i] !== 0) i += gif[i]! + 1;
    i += 1;
  }
  return frames;
};

describe("the clip's stated shape (README.md:20)", () => {
  it("is the frame size README names", () => {
    expect(trackSize()).toEqual({ width: claimed.width, height: claimed.height });
  });

  it("runs as long as README says, and the two headers agree", () => {
    const { timescale, duration } = media();
    // README rounds to one decimal, so the file may differ by up to half of it
    expect(duration / timescale).toBeCloseTo(claimed.seconds, 1);
    // the movie header agrees with the media header — nothing was cut off the end
    const mv = one("mvhd");
    expect(u32(mv.at + 16) / u32(mv.at + 12)).toBeCloseTo(claimed.seconds, 1);
  });

  it("weighs what README says", () => {
    const size = statSync(FILE).size;
    expect(Math.round(size / 1024)).toBe(claimed.kb);
    expect(size).toBe(bytes.length);
  });
});

describe("one visit, filmed as it happens (README.md:20, CHANGELOG.md)", () => {
  it("carries exactly one track, and it is a video track", () => {
    expect(found.filter((b) => b.type === "trak")).toHaveLength(1);
    expect(handlers()).toEqual(["vide"]);
  });

  it("has no audio track to mute", () => {
    expect(handlers()).not.toContain("soun");
    expect(found.map((b) => b.type)).not.toContain("smhd");
    expect(found.map((b) => b.type)).toContain("vmhd");
  });

  it("plays the rate README names, at a steady rate", () => {
    const { timescale, duration } = media();
    const { count, deltas } = samples();
    expect(count / (duration / timescale)).toBeCloseTo(claimed.fps, 6);
    // one run-length in the delta table, one constant delta: no re-timed frames
    expect(new Set(deltas).size).toBe(1);
    expect(timescale / deltas[0]!).toBeCloseTo(claimed.fps, 6);
  });

  it("applies no speed change to the picture", () => {
    // mvhd plays at 1.0; an edit list is where a fast-forward would live, and its
    // media_rate is a 16.16 fixed-point number at payload +16 of the first entry.
    expect(u32(one("mvhd").at + 20) / 65536).toBe(1);
    const elst = found.find((b) => b.type === "elst");
    if (elst) expect(u32(elst.at + 16) / 65536).toBe(1);
  });

  it("holds the whole picture in one media box", () => {
    expect(found.filter((b) => b.type === "mdat")).toHaveLength(1);
  });

  it("opens on a loop that runs where a video cannot (README.md:18)", () => {
    const md = readFileSync(path.resolve(import.meta.dirname, "../../README.md"), "utf-8");
    const m = md.match(
      /(\d+) seconds of that build, (\d+) frames at (\d+) × (\d+) and ([\d.]+) fps, ([\d,]+) KB/,
    );
    if (!m) {
      throw new Error(
        "the loop sentence no longer names its seconds, its frames, its shape, its rate and its weight in one breath",
      );
    }
    const seconds = Number(m[1]);
    const frames = Number(m[2]);
    const width = Number(m[3]);
    const height = Number(m[4]);
    const fps = Number(m[5]);
    const kb = Number(m[6]!.replace(/,/g, ""));
    const gif = readFileSync(
      path.resolve(import.meta.dirname, "../../docs/assets/demo-city-loop.gif"),
    );
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(gif.readUInt16LE(6)).toBe(width);
    expect(gif.readUInt16LE(8)).toBe(height);
    // the loop is cut from this clip, so it may be smaller, not mis-shaped
    const clip = trackSize();
    expect(width / height).toBeCloseTo(clip.width / clip.height, 10);
    expect(gifFrames(gif)).toBe(frames);
    expect(frames / fps).toBeCloseTo(seconds, 6);
    expect(Math.round(gif.length / 1024)).toBe(kb);
    // Measured on the rendered README: GitHub's renderer drops a <video> element
    // for a relative src, for github.com/.../raw and for raw.githubusercontent
    // alike, and strips autoplay, loop and playsinline from the ones it keeps.
    // An animated <img> is the only picture that runs there by itself.
    expect(md).not.toMatch(/<video/);
  });
});
