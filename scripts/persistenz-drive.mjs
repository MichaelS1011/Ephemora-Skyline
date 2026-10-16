#!/usr/bin/env node
/**
 * persistenz-drive.mjs — the verdict-persistence claim as a repeatable check.
 *
 * One command answers, with an exit code, the question the persistence promise
 * rests on: does a verdict a person set on one scan of a folder come back on a
 * re-scan of the same folder after the BACKEND PROCESS was killed and started
 * again — and does a foreign folder find none of it?
 *
 * Built after the first drive (`scripts/first-drive.mjs`) and on the same
 * discipline: its own ports, its own browser profile, the folder handed over
 * through the page's own file chooser, the verdict set through the panel's own
 * buttons. Nothing is injected into the page; every claim is read off the
 * screen or off the machine's own loopback API. A request counter watches the
 * whole run: nothing may leave the machine (S-P2).
 *
 * The run has three scans: A (verdict set), A again after a REAL backend
 * restart (the verdict must be found, not invented), and a foreign folder B
 * (nothing may surface). The browser profile survives the restart on purpose —
 * that is the customer's machine.
 *
 * Usage
 *   node scripts/persistenz-drive.mjs              drive it: exits 0 when every claim holds
 *
 * Ports belong to this run, and it refuses to start on a busy one:
 *   PERSISTENZ_BACKEND_PORT   4112   backend of the driven instance
 *   PERSISTENZ_FRONTEND_PORT  3012   dev server, strict
 *   PERSISTENZ_CDP_PORT       9545   own browser, own profile
 * 4000/3010/4110/3011/9542-9544 are the operator's and other lanes'. This
 * script never binds, signals or closes anything there.
 */

import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
// Same scratch discipline as the first drive: never inside a git-ignored tree,
// because semgrep would then read nothing and the city would still claim the
// scan ran. Measured there, copied here.
const SCRATCH =
  process.env.PERSISTENZ_SCRATCH ?? path.join(tmpdir(), "skyline-persistenz-drive");
const TARGET_A = process.env.PERSISTENZ_TARGET_A ?? path.join(SCRATCH, "a-projekt");
const TARGET_B = process.env.PERSISTENZ_TARGET_B ?? path.join(SCRATCH, "b-fremd");
const OUT = path.join(SCRATCH, "out");
const PROFILE = path.join(SCRATCH, "profile");
const CAPTURE = path.join(OUT, "capture.json");

const BACKEND_PORT = Number(process.env.PERSISTENZ_BACKEND_PORT ?? 4112);
const FRONTEND_PORT = Number(process.env.PERSISTENZ_FRONTEND_PORT ?? 3012);
const CDP_PORT = Number(process.env.PERSISTENZ_CDP_PORT ?? 9545);
const ORIGIN = `http://localhost:${FRONTEND_PORT}`;
const APP = `${ORIGIN}/`;
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const CITY_TIMEOUT_MS = Number(process.env.CITY_TIMEOUT_MS ?? 300000);

const CHROME_BIN =
  process.env.DRIVE_CHROME_BIN ??
  path.join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

/* ─────────────────────────── the folders being driven ──────────────────────
   Authored by hand so every claim is a number this file knew before the app
   was asked. A: three regex findings on the lines named below, top-level dirs
   db, src. B: a different name and a different top-level shape, with one
   finding of its own so "nothing is judged here" is a fact about the verdicts,
   not about an empty list. */

const FIXTURE_A = {
  "package.json": `${JSON.stringify(
    { name: "persistenz-a-projekt", private: true, version: "0.1.0" },
    null,
    2,
  )}\n`,

  "db/schema.sql": `-- The accounts shape. Nothing here is executed.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
`,

  // line 2: SQL built by concatenation → SQL_INJECTION
  "src/api/routes.ts": `export function lookup(req: { params: { name: string } }): string {
  const where = "SELECT id FROM accounts WHERE name = '" + req.params.name + "'";
  return where;
}
`,

  // line 2: HTML into the page without a sanitizer → XSS
  "src/components/Panel.tsx": `export function Panel(props: { note: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.note }} />;
}
`,

  // line 1: a live key shape → HARDCODED_SECRET
  "src/config/keys.ts": `export const BILLING_KEY = "sk_live_51HbQKdXyzABC1234defGHIjklMNOp";
`,

  "README.md": `# persistenz drive target A

Fixture for scripts/persistenz-drive.mjs. Delete it; the run makes it again.
`,
};

const FIXTURE_B = {
  "README.md": `# persistenz drive target B

A foreign folder: another name, another top-level shape, one finding of its own.
`,

  // line 1: console output → CONSOLE_USAGE
  "tests/spec.test.ts": `console.log("smoke: hello");
`,

  // line 2: the same XSS shape as folder A, so B has a finding worth judging
  "lib/view.tsx": `export function View(props: { note: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.note }} />;
}
`,
};

function writeFixture(dir, fixture) {
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(fixture)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  let n = 0;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) n += 1;
  }
  return n;
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
    const body = (res.headers.get("content-type") ?? "").includes("json")
      ? await res.json()
      : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(what, fn, timeoutMs, stepMs = 500) {
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
  child.on("exit", (code, signal) => chunks.push(`\n[exit ${code} ${signal}]\n`));
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

async function pickFolder(page, obs, target) {
  obs.target = target;
  const label = "Choose project folder";
  await waitFor(
    `the landing screen offers "${label}"`,
    async () => (await page.$$(`text=${label}`)).length > 0,
    90000,
    500,
  );
  await clickButton(page, label);
  log(`  pressed the control a stranger is told to press: "${label}"`);
}

async function waitCity(page) {
  await waitFor("the city stands", async () => (await page.$(".workspace-modes")) !== null, CITY_TIMEOUT_MS);
  await waitFor("the completion card", async () => (await page.$(".start-summary")) !== null, 30000, 300);
  const close = await page.$(".start-summary-close");
  if (close) await close.click();
  await waitFor("the one-line summary", async () => (await page.$(".start-summary-strip")) !== null, 30000, 300);
}

async function openFindings(page) {
  const toggle = await page.$('button[aria-controls="findings-panel"]');
  if (!toggle) throw new Error("no findings control over the city");
  await toggle.click();
  await waitFor("the findings list", async () => (await page.$$(".finding-row")).length > 0, 30000, 300);
}

/** Find a finding row by its file's card path and its type, then click it. */
async function clickFindingRow(page, pathPart, typePart) {
  const cards = await page.$$(".finding-file-card");
  for (const card of cards) {
    const cardPath = text((await card.$eval(".finding-file-path", (n) => n.textContent)) ?? "");
    if (!cardPath.includes(pathPart)) continue;
    const rows = await card.$$(".finding-row");
    for (const row of rows) {
      const meta = text((await row.$eval(".finding-row-meta", (n) => n.textContent)) ?? "");
      const type = (meta.split("·").pop() ?? "").trim();
      if (type.includes(typePart)) {
        const t = text((await row.textContent()) ?? "");
        await row.click();
        return `${cardPath} / ${type}`;
      }
    }
  }
  throw new Error(`no finding row for ${pathPart} / ${typePart}`);
}

/** The pressed state of every verdict segment in the panel's review group.
 *  Other controls (filter chips, view modes) also carry aria-pressed — only
 *  the three verdict labels count as a verdict. */
const VERDICT_LABELS = ["Reviewed ✓", "False positive", "To fix"];

async function pressedSegments(page) {
  const pressed = await page.evaluate(() =>
    [...document.querySelectorAll('div[role="group"] button[aria-pressed="true"]')].map((b) =>
      String(b.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
  );
  return pressed.filter((t) => VERDICT_LABELS.includes(t));
}

async function setVerdict(page, label) {
  await waitFor(
    `the verdict control offers "${label}"`,
    async () => {
      const buttons = await page.$$('div[role="group"] button');
      for (const b of buttons) {
        if (text((await b.textContent()) ?? "") === label) return true;
      }
      return false;
    },
    30000,
    300,
  );
  const buttons = await page.$$('div[role="group"] button');
  for (const b of buttons) {
    if (text((await b.textContent()) ?? "") === label) {
      await b.click();
      return;
    }
  }
  throw new Error(`the "${label}" segment vanished`);
}

async function clickButton(page, label) {
  const controls = await page.$$("button, a[role=button]");
  let loose = null;
  for (const c of controls) {
    const t = text((await c.textContent()) ?? "");
    const aria = text((await c.getAttribute("aria-label")) ?? "");
    if (t === label || aria === label) {
      await c.click();
      return true;
    }
    if (!loose && (t.includes(label) || aria.includes(label))) loose = c;
  }
  if (loose) {
    await loose.click();
    return true;
  }
  return false;
}

/* ──────────────────────────────── the report ──────────────────────────────── */

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  return false;
}

function evaluate(obs) {
  const claims = [];
  const add = (claim, expected, observed) =>
    claims.push({ claim, expected, observed, ok: equal(expected, observed) });

  add("scan A stood", true, obs.a1.city === true);
  add("the browser offered no native directory picker", true, obs.nativePickerAbsent === true);
  add("the verdict was set on the panel", ["False positive"], obs.a1.pressedAfterSet);
  add(
    "the verdict went to a project bucket, not a scan bucket",
    true,
    Array.isArray(obs.a1.bucketKeys) && obs.a1.bucketKeys.every((k) => /^p-[0-9a-f]{16}$/.test(k)),
  );
  add("the backend process was really ended", true, obs.restart.stopped === true);
  add("the backend answered again on the same port", true, obs.restart.up === true);
  add("scan A-2 (same folder, new scan) stood", true, obs.a2.city === true);
  add("the verdict was found, not invented", ["False positive"], obs.a2.pressed);
  add(
    "the verdict survives on the machine (loopback route)",
    true,
    obs.a2.machine === true,
  );
  add("scan B (foreign folder) stood", true, obs.b.city === true);
  add("the foreign folder found no verdict on the panel", [], obs.b.pressed);
  add("the foreign folder found no verdict on the machine", true, obs.b.machine === true);
  add("requests that left this machine", 0, obs.externalRequests);
  return claims;
}

function report(claims, obs) {
  let red = 0;
  log("");
  log("BEHAUPTUNG DER PERSISTENZ-FAHRT".padEnd(66) + " | ERWARTET / GESEHEN");
  log("─".repeat(66) + "-+-" + "─".repeat(40));
  for (const c of claims) {
    if (!c.ok) red += 1;
    const left = (c.ok ? "ok   " : "ROT  ") + c.claim;
    log(
      `${left.padEnd(66).slice(0, 66)} | ${short(c.expected)}${c.ok ? "" : "  ≠  " + short(c.observed)}`,
    );
  }
  log("");
  log(
    `numbers: ${JSON.stringify({
      scans: [obs.a1.scanId, obs.a2.scanId, obs.b.scanId],
      bucketA: obs.a1.bucketKeys,
      externalRequests: obs.externalRequests,
      totalMs: obs.totalMs,
    })}`,
  );
  log(`${claims.length - red} of ${claims.length} claims hold. ${red} do not.`);
  return red;
}

function short(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 38 ? `${s.slice(0, 35)}…` : s;
}

/* ────────────────────────────────── the drive ─────────────────────────────── */

async function drive() {
  // A clean slate, or the run would measure the leftovers of the last one: the
  // browser profile must enter empty (the verdict has to be SET here) and the
  // machine copy must not already hold the verdict the run is about to prove.
  // The profile survives everything inside the run — that is the customer's
  // machine — it is only the previous run's memory that goes.
  rmSync(PROFILE, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  rmSync(path.join(SCRATCH, "verdicts.json"), { force: true });
  rmSync(path.join(SCRATCH, "staged"), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFixture(TARGET_A, FIXTURE_A);
  writeFixture(TARGET_B, FIXTURE_B);
  log(`fixtures  A ${TARGET_A}  B ${TARGET_B}`);
  log(`scratch cleared: profile, machine copy, staging, screens`);

  for (const port of [BACKEND_PORT, FRONTEND_PORT, CDP_PORT]) {
    const who = listening(port);
    if (who.length > 0)
      throw new Error(
        `port ${port} is already taken by ${who.join(" / ")} — this run does not share ports`,
      );
  }

  const obs = {
    externalRequests: 0,
    nativePickerAbsent: false,
    a1: { city: false, scanId: null, pressedAfterSet: [], bucketKeys: [] },
    restart: { stopped: false, up: false },
    a2: { city: false, scanId: null, pressed: [], machine: false },
    b: { city: false, scanId: null, pressed: [], machine: false },
    ranAt: new Date().toISOString(),
  };
  const owned = { backend: null, dev: null, browser: null };
  const t0 = Date.now();
  let page = null;
  let cdpHandle = null;
  let currentTarget = TARGET_A;

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

    page.on("filechooser", async (chooser) => {
      await chooser.setFiles([currentTarget]);
      log(`  the folder was handed to the page through its own request`);
    });

    // The app's main street is the native directory picker, which no automation
    // can answer. Same as the first drive: the capability is removed before the
    // page's own scripts run, so the app takes its own fallback reader and the
    // folder is handed over by the chooser the page itself opened.
    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
    });
    obs.nativePickerAbsent = false;

    /* ── scan A: set the verdict ── */
    await page.goto(APP, { waitUntil: "load" });
    obs.nativePickerAbsent = await page.evaluate(
      () => typeof window.showDirectoryPicker === "undefined",
    );
    await pickFolder(page, obs, TARGET_A);
    await waitCity(page);
    obs.a1.city = true;
    obs.a1.scanId = new URL(page.url()).searchParams.get("city");
    log(`  scan A stood: ${obs.a1.scanId}`);
    await openFindings(page);
    const rowA = await clickFindingRow(page, "routes.ts", "SQL_INJECTION");
    log(`  clicked the finding: ${rowA}`);
    await setVerdict(page, "False positive");
    obs.a1.pressedAfterSet = await pressedSegments(page);
    obs.a1.bucketKeys = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("codecity-reviews:"))
        .map((k) => k.slice("codecity-reviews:".length)),
    );
    log(`  verdict set; bucket keys in the browser: ${obs.a1.bucketKeys.join(", ")}`);
    await page.screenshot({ path: path.join(OUT, "01-a1-verdict.png"), animations: "disabled" });

    /* ── the real restart: SIGTERM, then the same port again ── */
    stop(owned.backend);
    owned.backend = null;
    await waitFor(
      `the backend to leave ${BACKEND_PORT}`,
      async () => listening(BACKEND_PORT).length === 0,
      30000,
      300,
    );
    obs.restart.stopped = true;
    log(`  backend process ended`);
    owned.backend = bootBackend();
    await waitFor(
      `the backend back on 127.0.0.1:${BACKEND_PORT}`,
      async () => (await fetchJson(`http://127.0.0.1:${BACKEND_PORT}/api/health`)).ok,
      60000,
      400,
    );
    obs.restart.up = true;
    log(`  backend restarted on the same port`);

    /* ── scan A again: the verdict must be found ── */
    currentTarget = TARGET_A;
    await page.goto(APP, { waitUntil: "load" });
    await pickFolder(page, obs, TARGET_A);
    await waitCity(page);
    obs.a2.city = true;
    obs.a2.scanId = new URL(page.url()).searchParams.get("city");
    log(`  scan A-2 stood: ${obs.a2.scanId}`);
    await openFindings(page);
    await clickFindingRow(page, "routes.ts", "SQL_INJECTION");
    obs.a2.pressed = await pressedSegments(page);
    log(`  panel after the restart: pressed = ${JSON.stringify(obs.a2.pressed)}`);
    await page.screenshot({ path: path.join(OUT, "02-a2-verdict-found.png"), animations: "disabled" });

    /* the machine's own answer, read like an agent reads it */
    const a2machine = await fetchJson(
      `http://127.0.0.1:${BACKEND_PORT}/api/result/${obs.a2.scanId}/verdicts`,
    );
    if (a2machine.ok && a2machine.body && typeof a2machine.body === "object") {
      const reviews = a2machine.body.reviews ?? {};
      const values = Object.values(reviews);
      const keys = Object.keys(reviews);
      obs.a2.machine =
        keys.length === 1 && keys[0].startsWith("fp:") && values[0] === "false-positive";
      log(
        `  machine answer for A-2: ${a2machine.status} ${JSON.stringify({
          project: a2machine.body.project,
          verdicts: values.length,
        })}`,
      );
    } else {
      log(`  machine answer for A-2: ${a2machine.status} (no verdict route yet)`);
    }

    /* ── scan B: the foreign folder must find nothing ── */
    currentTarget = TARGET_B;
    await page.goto(APP, { waitUntil: "load" });
    await pickFolder(page, obs, TARGET_B);
    await waitCity(page);
    obs.b.city = true;
    obs.b.scanId = new URL(page.url()).searchParams.get("city");
    log(`  scan B stood: ${obs.b.scanId}`);
    await openFindings(page);
    await clickFindingRow(page, "view.tsx", "XSS");
    obs.b.pressed = await pressedSegments(page);
    log(`  panel of the foreign folder: pressed = ${JSON.stringify(obs.b.pressed)}`);
    await page.screenshot({ path: path.join(OUT, "03-b-foreign-clean.png"), animations: "disabled" });

    const bmachine = await fetchJson(
      `http://127.0.0.1:${BACKEND_PORT}/api/result/${obs.b.scanId}/verdicts`,
    );
    if (bmachine.ok && bmachine.body && typeof bmachine.body === "object") {
      const reviews = bmachine.body.reviews ?? {};
      obs.b.machine = Object.keys(reviews).length === 0;
      log(`  machine answer for B: ${bmachine.status} ${JSON.stringify(bmachine.body)}`);
    } else {
      log(`  machine answer for B: ${bmachine.status} (no verdict route yet)`);
    }

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
          a1: "verdict set",
          restart: "SIGTERM + same port",
          a2: "verdict found on the panel and on the loopback route",
          b: "foreign folder: nothing on the panel, nothing on the route",
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
  const red = report(evaluate(obs), obs);
  const stranded = (obs.leftoverPorts ?? []).length;
  if (stranded > 0) log(`${stranded} port(s) this run started are still listening — failure`);
  process.exitCode = red > 0 || stranded > 0 ? 1 : 0;
  if (process.exitCode === 0) log("EXIT 0 — the persistence drive holds.");
}

main().catch((e) => {
  console.error(`the run did not answer: ${e?.message ?? e}`);
  process.exitCode = 1;
});
