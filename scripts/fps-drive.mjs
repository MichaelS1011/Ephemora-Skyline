#!/usr/bin/env node
/**
 * fps-drive.mjs — the frame-rate bar, measured against the running instance.
 *
 * The law this repo holds: ≥55 fps median on a built city, headless Chrome
 * with --use-angle=metal (SwiftShader lies: 6.7 instead of 59.9). This drive
 * loads the demo city on the operator's own dev pair (3010/4000), waits for
 * the build to finish, then counts painted frames over a fixed window while
 * the camera idles and drifts.
 *
 * It never binds a port and never starts a server — it refuses to run when
 * 3010 is not answering. Screens are operator aids, never the evidence.
 *
 * Usage
 *   node scripts/fps-drive.mjs [seconds]     default 8; exits 0 when median ≥55
 */
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";

const SECONDS = Number(process.argv[2] ?? 8);
const FRONTEND = process.env.FRONTEND_PORT ?? "3010";
const URL = `http://localhost:${FRONTEND}/?demo=`;
const BAR = 55;

async function main() {
  // Playwright lives in this machine's global install, not in node_modules.
  const require = createRequire(
    process.env.DRIVE_PLAYWRIGHT_ENTRY ??
      resolve(homedir(), ".local/lib/node_modules/playwright/index.js"),
  );
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=metal"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    console.log(`loading ${URL}`);
    await page.goto(URL, { waitUntil: "load", timeout: 30_000 });
    // the demo city is entered through its own button — ?demo= alone only
    // preselects it on the landing page
    await page.getByRole("button", { name: /Explore demo|Demo entdecken/ }).click();
    // the demo builds itself; wait until the dock speaks
    await page.waitForFunction(
      () => document.body.innerText.includes("Triage"),
      null,
      { timeout: 60_000 },
    );
    // let the reveal flight settle before measuring
    await page.waitForTimeout(4_000);
    const result = await page.evaluate(async (seconds) => {
      let frames = 0;
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          frames++;
          if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return { frames, ms: performance.now() - t0 };
    }, SECONDS);
    const fps = (result.frames / result.ms) * 1000;
    const verdict = fps >= BAR ? "PASS" : "FAIL";
    console.log(`${verdict}: ${fps.toFixed(1)} fps over ${SECONDS}s (${result.frames} frames)`);
    process.exitCode = fps >= BAR ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("drive failed:", e.message);
  process.exit(2);
});
