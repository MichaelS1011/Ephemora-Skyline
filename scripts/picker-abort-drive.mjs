#!/usr/bin/env node
/**
 * picker-abort-drive.mjs — the Erstnutzerin's "stummer Klick" as a repeatable
 * check.
 *
 * One command answers, with an exit code, the question the fix rests on: in a
 * browser whose `showDirectoryPicker` EXISTS but aborts immediately with
 * AbortError (no dialog was ever open), does the app stay silent — or does it
 * say what happened and offer the visible way out?
 *
 * Built after the first drive (`scripts/first-drive.mjs`) and the persistence
 * drive (`scripts/persistenz-drive.mjs`), on the same discipline: its own
 * ports, its own browser profile, nothing injected into the page except the
 * broken picker the Erstnutzerin's browser shipped — the capability must
 * EXIST, because the defect is its immediate AbortError, not its absence. Every
 * claim is read off the page's own text. The folder for the alternative dialog
 * is handed over by the chooser the page itself opened. A request counter
 * watches the whole run: nothing may leave the machine.
 *
 * Claims:
 *   1. the picker existed and aborted immediately        (the browser's condition)
 *   2. the page did not stay silent: the notice appeared (the fix's sentence)
 *   3. the notice arrived fast (< 2 s after the click)   (the Erstnutzerin's 14 s)
 *   4. the alternative control was visible and enabled   (the way out, offered)
 *   5. the alternative dialog worked, a city stood       (the way out, usable)
 *   6. no request left the machine
 *
 * Usage
 *   node scripts/picker-abort-drive.mjs            drive it: exits 0 when every claim holds
 *
 * Ports belong to this run, and it refuses to start on a busy one:
 *   ABORT_BACKEND_PORT    4114   backend of the driven instance
 *   ABORT_FRONTEND_PORT   3014   dev server, strict
 *   ABORT_CDP_PORT        9546   own browser, own profile
 * 4000/3010/3011/3012/4110/4112/9542-9545 are the operator's and other lanes'.
 * This script never binds, signals or closes anything there.
 */

import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
// Same scratch discipline as the first drive: never inside a git-ignored tree,
// because semgrep would then read nothing and the city would still claim the
// scan ran. Measured there, copied here.
const SCRATCH = process.env.ABORT_SCRATCH ?? path.join(tmpdir(), "skyline-picker-abort-drive");
const TARGET = process.env.ABORT_TARGET ?? path.join(SCRATCH, "a-projekt");
const OUT = path.join(SCRATCH, "out");
const PROFILE = path.join(SCRATCH, "profile");
const CAPTURE = path.join(OUT, "capture.json");

const BACKEND_PORT = Number(process.env.ABORT_BACKEND_PORT ?? 4114);
const FRONTEND_PORT = Number(process.env.ABORT_FRONTEND_PORT ?? 3014);
const CDP_PORT = Number(process.env.ABORT_CDP_PORT ?? 9546);
const ORIGIN = `http://localhost:${FRONTEND_PORT}`;
const APP = `${ORIGIN}/`;
const CDP = `http://127.0.0.1:${CDP_PORT}`;

const CHROME_BIN =
  process.env.DRIVE_CHROME_BIN ??
  path.join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

/** The sentence the fix must show — quoted, not looked up, so a wording drift
 *  in the dictionary fails this drive instead of silently re-targeting it. */
const NOTICE_EN =
  "The folder dialog never opened — this browser refused it. You can use the alternative folder dialog.";
const ALTERNATIVE_BUTTON_EN = "Open alternative folder dialog";
const PRIMARY_BUTTON_EN = "Choose project folder";

/* ─────────────────────────── the folder being driven ───────────────────────
   One regex finding, so the alternative dialog's run ends in a real city. */

const FIXTURE = {
  "package.json": `${JSON.stringify({ name: "picker-abort-projekt", private: true }, null, 2)}\n`,
  // line 2: SQL built by concatenation → SQL_INJECTION
  "src/api/routes.ts": `export function lookup(req: { params: { name: string } }): string {
  const where = "SELECT id FROM accounts WHERE name = '" + req.params.name + "'";
  return where;
}
`,
  "README.md": `# picker-abort drive target

Fixture for scripts/picker-abort-drive.mjs. Delete it; the run makes it again.
`,
};

function writeFixture() {
  rmSync(TARGET, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(FIXTURE)) {
    const abs = path.join(TARGET, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/* ─────────────────────────────────── plumbing ─────────────────────────────── */

function listening(port) {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((l) => l.trim().split(/\s+/).slice(0, 2).join(" pid "));
  } catch {
    return [];
  }
}

async function fetchJson(url, ms = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(what, fn, timeoutMs, stepMs = 200) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${timeoutMs} ms`);
    await sleep(stepMs);
  }
}

function own(command, args, opts, logName) {
  const child = spawn(command, args, { detached: true, stdio: ["ignore", "pipe", "pipe"], ...opts });
  const chunks = [];
  child.stdout.on("data", (b) => chunks.push(b));
  child.stderr.on("data", (b) => chunks.push(b));
  return {
    child,
    pid: child.pid,
    name: logName,
    dump() {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${logName}.log`), chunks.join(""));
    },
  };
}

function stop(entry) {
  if (!entry?.pid) return;
  try {
    process.kill(-entry.pid, "SIGTERM");
    log(`  stopped ${entry.name} (its own process group, pid ${entry.pid})`);
  } catch {
    log(`  ${entry.name} (pid ${entry.pid}) was already gone`);
  }
  entry.dump();
}

const text = (s) => String(s).replace(/\s+/g, " ").trim();

function log(msg) {
  console.log(msg);
}

/* ─────────────────────────────────── the boots ────────────────────────────── */

function bootBackend() {
  return own(
    "npx",
    ["tsx", "src/server/index.ts"],
    {
      cwd: path.join(ROOT, "backend"),
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        HOST: "127.0.0.1",
        FRONTEND_ORIGIN: ORIGIN,
        CODECITY_UPLOAD_DIR: path.join(SCRATCH, "staged"),
        CODECITY_VERDICTS_FILE: path.join(SCRATCH, "verdicts.json"),
      },
    },
    "backend",
  );
}

function bootFrontend() {
  return own(
    "npx",
    ["vite", "--port", String(FRONTEND_PORT), "--strictPort"],
    { cwd: path.join(ROOT, "frontend"), env: { ...process.env, BACKEND_PORT: String(BACKEND_PORT) } },
    "dev-server",
  );
}

function bootBrowser() {
  mkdirSync(PROFILE, { recursive: true });
  rmSync(path.join(PROFILE, "SingletonLock"), { force: true });
  return own(
    CHROME_BIN,
    [
      "--headless=new",
      "--use-angle=metal",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-allow-debugger",
      "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE}`,
      "--window-size=1600,1000",
      "--force-device-scale-factor=2",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-backgrounding-occluded-windows",
    ],
    { cwd: SCRATCH },
    "browser",
  );
}

/* ──────────────────────────────── page actions ────────────────────────────── */

async function clickButton(page, label) {
  const controls = await page.$$("button, a[role=button]");
  for (const c of controls) {
    const t = text((await c.textContent()) ?? "");
    const aria = text((await c.getAttribute("aria-label")) ?? "");
    if (t === label || aria === label) {
      await c.click();
      return true;
    }
  }
  return false;
}

async function noticeText(page) {
  // While picking, the hook's notice is the live status line `#picker-status`
  // the landing announces; outside picking it moves to the cancelled line.
  return page.evaluate(
    () =>
      (
        document.querySelector("#picker-status")?.textContent ??
        document.querySelector(".start-cancelled")?.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim(),
  );
}

function short(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 38 ? `${s.slice(0, 35)}…` : s;
}

function report(claims) {
  let red = 0;
  log("");
  log("BEHAUPTUNG DER PICKER-ABORT-FAHRT".padEnd(66) + " | ERWARTET / GESEHEN");
  log("─".repeat(66) + "-+-" + "─".repeat(40));
  for (const c of claims) {
    if (!c.ok) red += 1;
    const left = (c.ok ? "ok   " : "ROT  ") + c.claim;
    log(`${left.padEnd(66).slice(0, 66)} | ${short(c.expected)}${c.ok ? "" : "  ≠  " + short(c.observed)}`);
  }
  log("");
  log(`${claims.length - red} of ${claims.length} claims hold. ${red} do not.`);
  return red;
}

/* ────────────────────────────────── the drive ─────────────────────────────── */

async function drive() {
  rmSync(PROFILE, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  rmSync(path.join(SCRATCH, "verdicts.json"), { force: true });
  rmSync(path.join(SCRATCH, "staged"), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFixture();
  log(`fixture   ${TARGET}`);
  log(`scratch cleared: profile, machine copy, staging, screens`);

  for (const port of [BACKEND_PORT, FRONTEND_PORT, CDP_PORT]) {
    const who = listening(port);
    if (who.length > 0)
      throw new Error(`port ${port} is already taken by ${who.join(" / ")} — this run does not share ports`);
  }

  const obs = {
    externalRequests: 0,
    pickerExists: false,
    pickerAborted: false,
    clickedAt: 0,
    noticeAt: 0,
    noticeText: "",
    alternativeVisible: false,
    alternativeEnabled: false,
    chooserOpened: false,
    cityStood: false,
    ranAt: new Date().toISOString(),
  };
  const owned = { backend: null, dev: null, browser: null };
  const t0 = Date.now();
  let page = null;
  let cdpHandle = null;

  try {
    owned.backend = bootBackend();
    await waitFor(
      `the backend on 127.0.0.1:${BACKEND_PORT}`,
      async () => (await fetchJson(`http://127.0.0.1:${BACKEND_PORT}/api/health`)).ok,
      60000,
      400,
    );
    log(`  backend up (${Date.now() - t0} ms)`);

    owned.dev = bootFrontend();
    await waitFor(`the dev server on ${APP}`, async () => (await fetchJson(APP, 2000)).ok, 60000, 400);
    log(`  dev server up`);

    owned.browser = bootBrowser();
    await waitFor(
      `the browser on 127.0.0.1:${CDP_PORT}`,
      async () => (await fetchJson(`${CDP}/json/version`, 2000)).ok,
      60000,
      500,
    );
    log(`  browser up`);

    const require = createRequire(
      process.env.DRIVE_PLAYWRIGHT_ENTRY ??
        path.join(homedir(), ".local/lib/node_modules/playwright/index.js"),
    );
    const { chromium } = require("playwright");
    cdpHandle = await chromium.connectOverCDP(CDP);
    const ctx = cdpHandle.contexts()[0];
    for (const p of ctx.pages()) await p.close().catch(() => {});
    page = await ctx.newPage();
    page.setDefaultTimeout(240000);
    await page.setViewportSize({ width: 1600, height: 1000 });

    page.on("request", (req) => {
      let host = "";
      try {
        host = new URL(req.url()).hostname;
      } catch {
        host = "?";
      }
      if (host !== "localhost" && host !== "127.0.0.1") {
        obs.externalRequests += 1;
        log(`  REQUEST LEFT THE MACHINE: ${req.method()} ${req.url()}`);
      }
    });

    let chooserTarget = null;
    page.on("filechooser", (chooser) => {
      chooserTarget = chooser;
      obs.chooserOpened = true;
      log(`  the page opened its own file chooser for the alternative dialog`);
    });

    // The Erstnutzerin's browser: the capability EXISTS, and it aborts
    // immediately — no dialog was ever open. The defect lives in that
    // combination, so the run plants exactly it and nothing else.
    await page.addInitScript(() => {
      window.showDirectoryPicker = () =>
        Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
    });

    await page.goto(APP, { waitUntil: "load" });
    obs.pickerExists = await page.evaluate(() => typeof window.showDirectoryPicker === "function");
    log(`  picker present as a function: ${obs.pickerExists}`);

    await waitFor(
      `the landing screen offers "${PRIMARY_BUTTON_EN}"`,
      async () => (await page.$$(`text=${PRIMARY_BUTTON_EN}`)).length > 0,
      90000,
      500,
    );
    obs.clickedAt = Date.now();
    await clickButton(page, PRIMARY_BUTTON_EN);
    log(`  pressed the control a stranger is told to press: "${PRIMARY_BUTTON_EN}"`);

    // The alternative control must be visible and enabled, and the notice must
    // carry the fix's own sentence. The AbortError fired on its own; the page
    // never asked again.
    await waitFor(
      `the notice to name the never-opened dialog`,
      async () => (await noticeText(page)).includes(NOTICE_EN),
      30000,
      50,
    );
    obs.noticeAt = Date.now();
    obs.noticeText = await noticeText(page);
    log(`  notice after ${obs.noticeAt - obs.clickedAt} ms: "${obs.noticeText.slice(0, 60)}…"`);
    await page.screenshot({ path: path.join(OUT, "01-notice-offers-the-way-out.png"), animations: "disabled" });

    const alternative = await page.$$("button, a[role=button]");
    for (const c of alternative) {
      if (text((await c.textContent()) ?? "") === ALTERNATIVE_BUTTON_EN) {
        obs.alternativeVisible = true;
        obs.alternativeEnabled = !(await c.isDisabled());
        break;
      }
    }
    log(`  alternative control visible=${obs.alternativeVisible} enabled=${obs.alternativeEnabled}`);

    // The way out must work: the page opens its input, the chooser hands the
    // folder over, the same pipeline the fallback picker drives builds a city.
    await clickButton(page, ALTERNATIVE_BUTTON_EN);
    await waitFor(`the page's own file chooser`, async () => chooserTarget !== null, 30000, 200);
    await chooserTarget.setFiles([TARGET]);
    await waitFor("the city stands", async () => (await page.$(".workspace-modes")) !== null, 300000, 500);
    obs.cityStood = true;
    log(`  the city stood on the folder handed through the alternative dialog`);
    await page.screenshot({ path: path.join(OUT, "02-city-through-the-alternative.png"), animations: "disabled" });

    obs.totalMs = Date.now() - t0;
  } catch (e) {
    obs.error = String(e?.message ?? e);
    log(`  the run stopped: ${obs.error}`);
  } finally {
    if (page) await page.goto("about:blank").catch(() => {});
    if (cdpHandle) await cdpHandle.close().catch(() => {});
    stop(owned.browser);
    stop(owned.dev);
    stop(owned.backend);
    await sleep(1500);
    obs.leftoverPorts = [];
    for (const port of [BACKEND_PORT, FRONTEND_PORT, CDP_PORT]) {
      const who = listening(port);
      if (who.length > 0) {
        obs.leftoverPorts.push(port);
        log(`  STILL LISTENING on ${port}: ${who.join(" / ")}`);
      } else {
        log(`  port ${port} free again`);
      }
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(CAPTURE, JSON.stringify(obs, null, 1));
    log(`capture  ${CAPTURE}`);
  }
  return obs;
}

async function main() {
  if (process.argv[2] === "--expected") {
    log(
      JSON.stringify(
        {
          picker: "exists and aborts immediately with AbortError",
          notice: NOTICE_EN,
          "notice latency": "< 2000 ms after the click",
          alternative: "visible, enabled, and its dialog builds a city",
          egress: 0,
        },
        null,
        1,
      ),
    );
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const obs = await drive();
  if (obs.error) throw new Error(obs.error);

  const claims = [];
  const add = (claim, expected, observed) => claims.push({ claim, expected, observed, ok: observed === expected });
  add("the picker existed (the Erstnutzerin's browser)", true, obs.pickerExists === true);
  add("the page did not stay silent: the notice named the never-opened dialog", true, obs.noticeText.includes(NOTICE_EN));
  add("the notice arrived fast (14 s of silence would be the defect)", true, obs.noticeAt - obs.clickedAt < 2000);
  add("the alternative control was visible", true, obs.alternativeVisible);
  add("the alternative control was enabled", true, obs.alternativeEnabled);
  add("the alternative dialog opened the page's own chooser", true, obs.chooserOpened);
  add("the alternative dialog built a city from the handed folder", true, obs.cityStood);
  add("requests that left this machine", 0, obs.externalRequests);

  const red = report(claims);
  const stranded = (obs.leftoverPorts ?? []).length;
  if (stranded > 0) log(`${stranded} port(s) this run started are still listening — failure`);
  log(`latency   ${obs.noticeAt - obs.clickedAt} ms from click to notice`);
  process.exitCode = red > 0 || stranded > 0 ? 1 : 0;
  if (process.exitCode === 0) log("EXIT 0 — the picker-abort drive holds.");
}

main().catch((e) => {
  console.error(`the run did not answer: ${e?.message ?? e}`);
  process.exitCode = 1;
});
