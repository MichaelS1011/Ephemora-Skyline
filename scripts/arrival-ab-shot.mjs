#!/usr/bin/env node
/**
 * arrival-ab-shot.mjs — the arrival screen, framed and counted.
 *
 * One state, two frames: the demo city at 1440×900, the completion card pinned
 * so it is on screen in both. The script is the same for both runs — it takes
 * the port and the output name — so the difference in the pictures can only
 * come from the code each port serves.
 *
 * It prints the census with the frame, because the frame alone argues and the
 * numbers settle it: how many chrome regions stand, how many words they carry,
 * and how much of the window they cover.
 *
 *   node scripts/arrival-ab-shot.mjs --port 3010 --out /tmp/arrival-after.png
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(
  process.env.DRIVE_PLAYWRIGHT_ENTRY ?? join(homedir(), ".local/lib/node_modules/playwright/index.js"),
);
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const PORT = Number(arg("port", 3010));
const OUT = arg("out", `/tmp/arrival-${PORT}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The regions the arrival budget counts, by the class each component writes. */
const REGION = {
  header: ".workspace-header",
  legend: ".city-legend",
  modes: ".workspace-modes",
  search: ".search-control",
  fileCard: ".panel-info",
  findingsList: "#findings-panel",
  announcement: ".start-summary",
  tour: ".security-tour",
  dock: ".action-dock",
  projectCard: ".panel-context-card",
  minimap: ".city-minimap",
  primer: ".city-coach",
  heat: ".workspace-heatmap",
  shortcuts: ".workspace-shortcuts",
  crumbs: ".workspace-breadcrumbs",
  shareNudge: ".share-hint",
};

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
await page.goto(`http://localhost:${PORT}/?demo=`, { waitUntil: "load" });
// `?demo=` only preselects the demo on the landing; the city is entered
// through its own button, the same door fps-drive uses
await page.getByRole("button", { name: /Explore demo|Demo entdecken/ }).click();
// the dock speaks once the city stands; the reveal flight is then let settle,
// so both frames are the same moment after the same build
await page.waitForFunction(() => document.body.innerText.includes("Triage"), null, {
  timeout: 90_000,
});
await page.waitForSelector(".start-summary", { timeout: 30000 });
const pin = await page.$(".start-summary-pin");
if (pin) await pin.click();
await sleep(2500);

const census = await page.evaluate((region) => {
  const paint = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  const cells = {};
  for (const [name, sel] of Object.entries(region)) {
    const r = paint(sel);
    if (r) cells[name] = Math.round(r.width * r.height);
  }
  const standing = Object.keys(cells);
  const words = (document.body.innerText ?? "").split(/\s+/).filter(Boolean).length;
  const windowArea = window.innerWidth * window.innerHeight;
  const chromeArea = Object.values(cells).reduce((a, b) => a + b, 0);
  return {
    standing,
    count: standing.length,
    words,
    chromeSharePct: Math.round((chromeArea / windowArea) * 1000) / 10,
    cells,
  };
}, REGION);

mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, animations: "disabled" });
await browser.close();

console.log(
  JSON.stringify(
    { port: PORT, out: OUT, ...census, pageErrors: errors },
    (k, v) => (k === "cells" ? undefined : v),
    1,
  ),
);
