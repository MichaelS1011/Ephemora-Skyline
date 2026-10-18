#!/usr/bin/env node
/**
 * `node scripts/model-card-shot.mjs` — films the finding card asking a real model.
 *
 * The gate for this feature is a test in a jsdom panel; that proves the click
 * sends the right three fields, not that a person can see the answer. So this
 * script starts the built app and the built backend on their own ports, scans a
 * fixture folder the way the operator does, opens one card, presses the button,
 * and writes two frames: the card before the question and the card holding the
 * model's sentence. A run without `EPHEMORA_LLM_URL` is a run without a door,
 * and the script prints the third frame for that case so the absence is on film
 * too.
 *
 *   EPHEMORA_LLM_URL=http://127.0.0.1:8100/v1 EPHEMORA_LLM_MODEL=<name> \
 *     node scripts/model-card-shot.mjs
 *
 * Headless, `--use-angle=metal` (SwiftShader measures 6,7 fps and would say
 * nothing about the real render), output in /tmp — these frames are proof, not
 * repository content.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";

const chromium = (await import(
  process.env.DRIVE_PLAYWRIGHT_ENTRY ?? join(homedir(), ".local/lib/node_modules/playwright/index.js")
)).default.chromium;

const ROOT = resolve(import.meta.dirname, "..");
const OUT = process.env.EPHEMORA_SHOT_DIR ?? "/tmp/model-card";
const API_PORT = process.env.EPHEMORA_SHOT_PORT ?? "4314";
const BASE = `http://127.0.0.1:${API_PORT}`;
const FIXTURE = join(tmpdir(), `model-card-fixture-${process.pid}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (what, test, timeout = 60000, every = 250) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await test()) return;
    await sleep(every);
  }
  throw new Error(`timeout waiting for ${what}`);
};

mkdirSync(OUT, { recursive: true });
mkdirSync(FIXTURE, { recursive: true });
writeFileSync(
  join(FIXTURE, "queries.py"),
  [
    "import sqlite3",
    "",
    "",
    "def lookup(user_id):",
    '    db = sqlite3.connect("app.db")',
    '    return db.execute("SELECT * FROM users WHERE id=" + user_id)',
    "",
  ].join("\n"),
);
writeFileSync(
  join(FIXTURE, "settings.js"),
  'const API_KEY = "sk-live-ABCDEFGHIJKLMNOP1234";\nexport default API_KEY;\n',
);

const backend = spawn(process.execPath, ["backend/dist/server/index.js"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: API_PORT,
    HOST: "127.0.0.1",
    EPHEMORA_WEB_DIR: join(ROOT, "frontend/dist"),
  },
  stdio: ["ignore", "ignore", "inherit"],
});

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
let report;
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  const health = await (await fetch(`${BASE}/api/health`)).json();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  const chooser = { seen: false };
  page.on("filechooser", async (c) => {
    chooser.seen = true;
    await c.setFiles([FIXTURE]);
  });

  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await waitFor(
    "the entry screen",
    () => page.$$eval("button", (bs) => bs.some((b) => b.textContent?.includes("Choose project folder"))),
    90000,
  );
  await page.getByRole("button", { name: /Choose project folder/ }).click();
  await waitFor("the folder was requested", async () => chooser.seen, 30000, 200);
  await waitFor("the city stands", () => page.$(".workspace-modes"), 240000);
  await waitFor("the completion card", () => page.$(".start-summary"), 60000, 300);
  const pin = await page.$(".start-summary-pin");
  if (pin) await pin.click();
  await sleep(400);

  // Open one finding's card the way a reader does: the dock's Triage button
  // focuses the heaviest finding, and a focused row expands itself and scrolls
  // into view — the same path the keyboard user takes.
  await page.waitForSelector(".action-dock", { timeout: 30000 });
  const triage = await page.evaluateHandle(() => {
    const dock = document.querySelector(".action-dock");
    return [...(dock?.querySelectorAll("button") ?? [])].find((b) =>
      /Triage/i.test(b.innerText ?? ""),
    );
  });
  const triageEl = triage.asElement();
  if (triageEl) await triageEl.click();
  await waitFor(
    "a finding row with its details open",
    () => page.$("[data-ask-model], button[aria-expanded]"),
    30000,
  );
  await sleep(600);
  await page.screenshot({ path: join(OUT, "1-card-closed.png"), animations: "disabled" });

  const ask = await page.$('button:has-text("on this machine")');
  if (!ask) {
    report = { configured: health.localModel, button: false };
    await page.screenshot({ path: join(OUT, "2-no-button.png"), animations: "disabled" });
  } else {
    const label = await ask.textContent();
    const before = Date.now();
    await ask.click();
    await waitFor(
      "the model's sentence",
      () => page.$('[data-ask-model-text]'),
      Number(process.env.EPHEMORA_SHOT_TIMEOUT_MS ?? 60000),
    );
    const ms = Date.now() - before;
    const answer = await page.$eval('[data-ask-model-text]', (el) => el.textContent ?? "");
    const attribution = await page.evaluate(() => {
      const box = document.querySelector("[data-ask-model]");
      return box ? (box.textContent ?? "").replace(/\s+/g, " ") : "";
    });
    await page.screenshot({ path: join(OUT, "2-card-answered.png"), animations: "disabled" });
    report = {
      configured: health.localModel,
      button: label?.trim(),
      ms,
      answerChars: answer.length,
      answer: answer.slice(0, 400),
      saysWhatTraveled: /not the file/i.test(attribution),
      leakedCode: /sk-live-ABCDEFGHIJKLMNOP1234/.test(answer),
    };
  }
} finally {
  await browser.close();
  backend.kill("SIGTERM");
  rmSync(FIXTURE, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 1));
console.log(`frames in ${OUT}`);
