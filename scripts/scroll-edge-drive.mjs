#!/usr/bin/env node
/**
 * scroll-edge-drive.mjs — the scroll edge of the world, measured optically.
 *
 * The shell softens the picture where it passes under a bar (Apple's scroll
 * edge effect: „blurring and reducing the opacity of background content"). Two
 * bands do that in `.city-canvas`, and a band that does not paint is invisible
 * in exactly the way that fools a screenshot review: it looks like a city with
 * no detail near the edges, because the detail is simply not softened. This
 * drive found the defect it now guards — the pseudo-elements needed a `z-index`
 * to come up above the WebGL canvas, and without one a red test rectangle painted
 * on the band never reached the screen.
 *
 * Method, so the number does not depend on the camera: a synthetic plate of
 * 64 px stripes is mounted above the canvas and below the bands. Inside a
 * band's own box the stripes must lose their edges; a control zone between the
 * two bands must lose nothing. Same frame, band on and off — the difference is
 * the band's, and nothing else can produce it.
 *
 * Usage
 *   node scripts/scroll-edge-drive.mjs            exits 0 when both bands bite
 * Env
 *   FRONTEND_PORT (default 3010), DRIVE_PLAYWRIGHT_ENTRY
 */
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import zlib from "node:zlib";

const FRONTEND = process.env.FRONTEND_PORT ?? "3010";
const URL = `http://localhost:${FRONTEND}/?demo=`;
const LAMBDA = 64;
/** Set from the first measured run: what the bands actually remove, with room
 *  for a machine that is busier than the one that wrote this line. */
const MIN_CUT_PCT = Number(process.env.MIN_CUT_PCT ?? 25);
const MAX_CONTROL_PCT = Number(process.env.MAX_CONTROL_PCT ?? 3);

const require = createRequire(
  process.env.DRIVE_PLAYWRIGHT_ENTRY ??
    resolve(homedir(), ".local/lib/node_modules/playwright/index.js"),
);

/** Minimal PNG reader (8-bit, non-interlaced, RGB/RGBA) — no dependency. */
function decodePng(buf) {
  let off = 8;
  let w = 0;
  let h = 0;
  let color = 0;
  let depth = 0;
  let interlaced = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const d = off + 8;
    if (type === "IHDR") {
      w = buf.readUInt32BE(d);
      h = buf.readUInt32BE(d + 4);
      depth = buf[d + 8];
      color = buf[d + 9];
      interlaced = buf[d + 12];
    } else if (type === "IDAT") idat.push(buf.subarray(d, d + len));
    else if (type === "IEND") break;
    off = d + len + 4;
  }
  if (depth !== 8 || interlaced !== 0 || (color !== 2 && color !== 6)) {
    throw new Error(`unexpected png (depth ${depth}, colour ${color}, interlaced ${interlaced})`);
  }
  const ch = color === 2 ? 3 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let read = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[read++];
    const line = raw.subarray(read, read + stride);
    read += stride;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0;
      const b = y > 0 ? out[row - stride + x] : 0;
      const c = x >= ch && y > 0 ? out[row - stride + x - ch] : 0;
      let v;
      if (f === 0) v = line[x];
      else if (f === 1) v = line[x] + a;
      else if (f === 2) v = line[x] + b;
      else if (f === 3) v = line[x] + ((a + b) >> 1);
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`png filter ${f}`);
      out[row + x] = v & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

const level = (img, x, y) => {
  const i = (y * img.w + x) * img.ch;
  return 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2];
};

/** Mean |L(x+1) − L(x)| over a box: how much horizontal edge survived. */
function edgeEnergy(img, box) {
  let s = 0;
  let n = 0;
  const x1 = Math.min(img.w - 1, Math.floor(box.x + box.width));
  for (let y = Math.floor(box.y); y < Math.floor(box.y + box.height); y++) {
    for (let x = Math.max(1, Math.floor(box.x)); x < x1; x++) {
      s += Math.abs(level(img, x + 1, y) - level(img, x, y));
      n++;
    }
  }
  if (!n) throw new Error(`empty box ${JSON.stringify(box)}`);
  return s / n;
}

async function main() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    console.log(`loading ${URL}`);
    await page.goto(URL, { waitUntil: "load", timeout: 30_000 });
    await page.getByRole("button", { name: /Explore demo|Demo entdecken/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Triage"), null, {
      timeout: 90_000,
    });
    await page.waitForTimeout(6_000);

    // The plate: above the canvas, below the bands (they are at z-index 1).
    await page.evaluate((p) => {
      const el = document.createElement("div");
      el.id = "edge-plate";
      el.style.cssText = `position:fixed;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(90deg,#fff 0 ${p / 2}px,#000 ${p / 2}px ${p}px)`;
      document.body.append(el);
    }, LAMBDA);
    await page.waitForTimeout(400);

    const rects = await page.evaluate(() => {
      const h = document.querySelector(".workspace-header")?.getBoundingClientRect();
      const d = document.querySelector(".action-dock-row")?.getBoundingClientRect();
      const c = document.querySelector(".city-canvas");
      const b = c ? getComputedStyle(c, "::before") : null;
      const a = c ? getComputedStyle(c, "::after") : null;
      return {
        headerBottom: Math.round(h?.bottom ?? 64),
        dockTop: Math.round(d?.top ?? 900),
        bandBefore: { z: b?.zIndex, h: b?.height, bf: b?.backdropFilter },
        bandAfter: { z: a?.zIndex, h: a?.height, bf: a?.backdropFilter },
      };
    });
    console.log(
      `bands: before z=${rects.bandBefore.z} h=${rects.bandBefore.h} · after z=${rects.bandAfter.z} h=${rects.bandAfter.h}`,
    );
    const zones = {
      underHeader: { x: 200, y: rects.headerBottom + 8, width: 1000, height: 70 },
      aboveDock: { x: 200, y: rects.dockTop - 78, width: 1000, height: 70 },
      between: { x: 200, y: 400, width: 1000, height: 70 },
    };
    const setBand = (on) =>
      page.evaluate(
        (css) => {
          let el = document.getElementById("edge-drive-toggle");
          if (!el) {
            el = document.createElement("style");
            el.id = "edge-drive-toggle";
            document.head.append(el);
          }
          el.textContent = css;
        },
        on
          ? ""
          : ".city-canvas::before,.city-canvas::after{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}",
      );

    const shoot = async () => decodePng(await page.screenshot());
    await setBand(true);
    const on1 = await shoot();
    const on2 = await shoot();
    await setBand(false);
    const off = await shoot();
    await setBand(true);

    // The plate is DOM, so a moving camera cannot change these pixels; anything
    // that moves anyway means the drive is not looking at a settled screen.
    const moving = (() => {
      let s = 0;
      let n = 0;
      for (let y = 100; y < 800; y += 7)
        for (let x = 100; x < 1340; x += 7) {
          s += Math.abs(level(on1, x, y) - level(on2, x, y));
          n++;
        }
      return s / n;
    })();

    const rows = [];
    for (const [name, box] of Object.entries(zones)) {
      const on = (edgeEnergy(on1, box) + edgeEnergy(on2, box)) / 2;
      const none = edgeEnergy(off, box);
      rows.push({
        zone: name,
        edgeOn: +on.toFixed(3),
        edgeOff: +none.toFixed(3),
        cutPct: +(((none - on) / none) * 100).toFixed(1),
      });
    }
    const by = Object.fromEntries(rows.map((r) => [r.zone, r]));
    console.table(rows);
    const fails = [];
    if (moving > 1) fails.push(`the screen was still moving (mean |Δ| ${moving.toFixed(2)})`);
    if (by.between.cutPct > MAX_CONTROL_PCT || by.between.cutPct < -MAX_CONTROL_PCT)
      fails.push(
        `the control zone changed too (${by.between.cutPct} %) — something outside the bands moved`,
      );
    for (const zone of ["underHeader", "aboveDock"]) {
      const r = by[zone];
      if (!Number.isFinite(r.cutPct)) fails.push(`${zone}: no edges to measure`);
      else if (r.cutPct < MIN_CUT_PCT)
        fails.push(
          `${zone}: the band removed ${r.cutPct} % of a ${LAMBDA} px edge — the bar is ${MIN_CUT_PCT} % and it must bite (z-index? height? mask?)`,
        );
    }
    if (fails.length) {
      console.error(`FAIL\n  ${fails.join("\n  ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `OK — both bands remove ≥ ${MIN_CUT_PCT} % of a ${LAMBDA} px edge where the reader sees them, and nothing (${by.between.cutPct} %) in between`,
    );
  } finally {
    await browser.close();
  }
}
await main();
