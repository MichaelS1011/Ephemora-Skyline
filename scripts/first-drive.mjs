#!/usr/bin/env node
/**
 * first-drive.mjs — the first drive of Ephemora Skyline as a repeatable check.
 *
 * One command answers, with an exit code, the question the release rests on:
 * can a person who has never seen this project get from a folder on their own
 * disk to a city, on a machine that already runs one instance?
 *
 * It drives a SECOND instance on its own ports (backend, dev server, browser),
 * hands the folder over through the browser's own file chooser, and then reads
 * the numbers off the screen. Nothing is injected: no store import, no prepared
 * state, no fixture inside the app.
 *
 * The app's main street is the native directory picker, which no automation can
 * answer. This run takes the street a browser without that API takes: the
 * capability is removed before the page's own scripts run, so the app chooses
 * its own fallback reader, and that fallback is what gets proven — with the
 * folder handed to it by the chooser the page itself opened.
 *
 * What it claims is counted, not looked at: file count, finding count, the drop
 * line, and that the folder's arithmetic closes — paths on disk = analyzed +
 * not read. Every number is read out of the page's own text. Screens are kept
 * for the operator; they are never the evidence.
 *
 * Usage
 *   node scripts/first-drive.mjs              drive it: exits 0 when every claim holds
 *   node scripts/first-drive.mjs --fixture    write the target folder and stop
 *   node scripts/first-drive.mjs --expected   print what this file claims, without running
 *   node scripts/first-drive.mjs --replay     re-check a saved capture against the same code, no browser
 *   node scripts/first-drive.mjs --falsify drop|analyzed|findings|finding-line|extra-finding|grades|mask|picker|egress
 *                                             re-check with one claim made wrong: must go red, no browser
 *
 * Ports belong to this run, and it refuses to start on a busy one:
 *   DRIVE_BACKEND_PORT / PORT   4110   backend of the second instance
 *   FRONTEND_PORT               3011   dev server, strict: it never slides onto a neighbour
 *   CDP_PORT                     9544  own browser, own profile
 * 3010, 4000, 9542 and 9543 are the operator's and other lanes'. This script
 * never binds, signals or closes anything there.
 */

import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { loadavg, homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
// Never inside a git-ignored tree, and that is a measurement, not taste:
// `semgrep` skips whatever git ignores, so a scan root under an ignored path
// returns zero findings while the city still reports the engine as having run.
// Measured on two byte-identical trees in one repository —
//   ignored by .gitignore  -> 0 files scanned, 0 findings
//   not ignored            -> 1 file scanned, 1 finding
// The check used to sit in the author's scratch and quietly report 3 findings
// where the same folder outside an ignored tree reports 4.
const SCRATCH =
  process.env.FAHRT_SCRATCH ?? path.join(tmpdir(), "skyline-first-drive");
const TARGET = process.env.FAHRT_TARGET ?? path.join(SCRATCH, "target");
const OUT = process.env.FAHRT_OUT ?? path.join(SCRATCH, "out");
const PROFILE = path.join(SCRATCH, "profile");
const CAPTURE = path.join(OUT, "capture.json");

const BACKEND_PORT = Number(process.env.DRIVE_BACKEND_PORT ?? process.env.PORT ?? 4110);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 3011);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9544);
const ORIGIN = `http://localhost:${FRONTEND_PORT}`;
const APP = `${ORIGIN}/`;
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const CITY_TIMEOUT_MS = Number(process.env.CITY_TIMEOUT_MS ?? 300000);

// The browser this run drives. DRIVE_CHROME_BIN names it; the default is this
// machine's own Playwright cache, read from the home folder it resolves to at
// run time — a shipped script carries no user name and no path of one person.
const CHROME_BIN =
  process.env.DRIVE_CHROME_BIN ??
  path.join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

/** The value the fixture plants, and the marker the scan answers with. */
const SECRET = "sk_live_" + "51HbQKdXyzABC1234defGHIjklMNOp";
const HIDDEN = "‹hidden›";

/* ───────────────────────────── the folder being driven ──────────────────────

   Authored by hand, on purpose. Every number the run checks is a number this
   file knew before the app was asked. Letting the program report what it read
   from a folder nobody counted proves the pipeline is talkative, not that it is
   right. 13 paths: 8 in a format the scanners read, 5 not; 3 planted findings,
   each on the line named below. */

const FIXTURE = {
  "package.json": `${JSON.stringify(
    {
      name: "fahrt-first-drive-target",
      private: true,
      version: "0.1.0",
      scripts: { start: "node dist/server.js" },
    },
    null,
    2,
  )}\n`,

  "db/schema.sql": `-- The shape of the accounts table. Nothing here is executed.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);
CREATE INDEX accounts_by_name ON accounts (name);
`,

  // line 2: SQL built by concatenation
  "src/api/routes.ts": `export function lookup(req: { params: { name: string } }): string {
  const where = "SELECT id, email FROM accounts WHERE name = '" + req.params.name + "'";
  return where;
}
`,

  "src/api/server.ts": `export function answer(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "empty";
  return trimmed.toUpperCase();
}
`,

  "src/utils/format.ts": `export function plural(one: string, many: string, count: number): string {
  return count === 1 ? one : many;
}

export function label(count: number, noun: string): string {
  return plural(noun, noun + "s", count) + " " + String(count);
}
`,

  // line 2: HTML put into the page without a sanitizer
  "src/components/Panel.tsx": `export function Panel(props: { note: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.note }} />;
}
`,

  // line 1: a live key shape. The one finding that does not come from this
  // project's own patterns — which is what makes the engine named on the card
  // worth reading at all. line 2 is the neighbour the frame owes the reader:
  // readable, unshortened, right beside the value that is not.
  "src/config/keys.ts": `export const BILLING_KEY = "${SECRET}";
const HEADER_NAME = "Authorization";

export function billingHeader(): Record<string, string> {
  return { [HEADER_NAME]: "Bearer " + BILLING_KEY };
}
`,

  "scripts/deploy.sh": `#!/bin/sh
set -eu
# Packs the fixture. It is here so a scan has a script to read, not so that
# anyone runs it.
mkdir -p out2
cp src/api/server.ts out2/server.js
echo packed
`,

  // — five paths the scan does not read. Four of them are still uploaded,
  //   because the reader takes them along and the scanner declines them;
  //   the image never leaves the disk and is counted by the reader instead.
  "README.md": `# first-drive target

Written by scripts/first-drive.mjs for the first drive of Ephemora Skyline.
This folder is a fixture; delete it and the run makes it again.
`,

  ".gitignore": `node_modules/
*.tmp
`,

  Makefile: `list:
	@ls -1 src
`,

  "data/seed.csv": `name,email
ada@example.com
grace@example.com
`,

  // a real 1x1 image, so the file is what its extension says
  "assets/logo.png": Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

/** What the screen must say, decided before the run, from the folder above. */
const EXPECT = {
  pathsOnDisk: 13,
  analyzed: 8,
  unread: 5,
  findings: 4,
  severities: { Critical: 2, High: 2, Medium: 0 },
  dropRows: ["5 files in a format the scanners do not read"],
  findingRows: [
    { path: "src/api/routes.ts", line: 2, type: "SQL_INJECTION" },
    { path: "src/components/Panel.tsx", line: 2, type: "XSS" },
    { path: "src/config/keys.ts", line: 1, type: "HARDCODED_SECRET" },
    {
      // The canary among the rows. The fixture plants a
      // `dangerouslySetInnerHTML` that the rule pack answers to, so a run
      // missing this row never really showed the folder to semgrep — whatever
      // the provenance line claims. This row is what would have caught the
      // ignored-scratch case on the day it started, not three weeks later.
      path: "src/components/Panel.tsx",
      line: 2,
      type: "REACT_DANGEROUSLYSETINNERHTML",
    },
  ],
  /**
   * The canary. The fixture plants a `dangerouslySetInnerHTML` that the rule
   * pack answers to, so a run in which semgrep contributed nothing did not
   * really see the folder — whatever the provenance line claims. This is the
   * claim that would have caught the ignored-scratch case on the day it
   * happened, instead of three weeks later.
   */
  enginesThatMustContribute: ["semgrep"],
};

/* ─────────────────────────────────── fixture ───────────────────────────────── */

function writeFixture() {
  rmSync(TARGET, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(FIXTURE)) {
    const abs = path.join(TARGET, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const onDisk = pathsUnder(TARGET);
  if (onDisk !== EXPECT.pathsOnDisk) {
    throw new Error(
      `the fixture wrote ${onDisk} paths, this file claims ${EXPECT.pathsOnDisk} — fix the file, not the folder`,
    );
  }
  return onDisk;
}

/** Every regular file under a folder, counted on the disk, not from the app. */
function pathsUnder(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) n += pathsUnder(abs);
    else if (statSync(abs).isFile()) n += 1;
  }
  return n;
}

/* ─────────────────────────────────── checks ──────────────────────────────────

   Pure: a capture in, a verdict out. --replay and --falsify run the same code
   the drive runs, so the proof that a claim can go red is a proof about the
   checker that made the claim. */

const digits = (raw) => Number(String(raw).replace(/[^\d]/g, ""));

function countIn(text, pattern) {
  const m = pattern.exec(text);
  return m ? digits(m[1]) : null;
}

/** the card counts every reason on its own line; the folder's unread is their sum */
function cardUnread(card) {
  const reasons = [
    /([\d.,]+) files? were longer than the path limit/,
    /([\d.,]+) files? were unsafe/,
    /([\d.,]+) files? were too large or unreadable/,
    /([\d.,]+) files? could not be read/,
    /([\d.,]+) files? you excluded/,
    /([\d.,]+) files? in a format the scanners do not read/,
  ];
  let sum = null;
  for (const re of reasons) {
    const n = countIn(card, re);
    if (n !== null) sum = (sum ?? 0) + n;
  }
  return sum;
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  return false;
}

const SORTED = (rows) => [...rows].sort();

function evaluate(obs) {
  const claims = [];
  const add = (claim, expected, observed) =>
    claims.push({ claim, expected, observed, ok: equal(expected, observed) });

  const card = obs.cardText ?? "";
  const strip = obs.stripText ?? "";
  const findingsView = obs.findingsText ?? "";

  const analyzed = countIn(card, /([\d.,]+) files? analyzed/);
  const analyzedAgain = countIn(strip, /([\d.,]+) files? analyzed/);
  const unreadCard = cardUnread(card);
  const unreadStrip = countIn(strip, /([\d.,]+) files? were not read/);

  add("files analyzed, said by the completion card", EXPECT.analyzed, analyzed);
  add("files analyzed, still said after the card closed itself", EXPECT.analyzed, analyzedAgain);
  add("paths the card accounts for as unread", EXPECT.unread, unreadCard);
  add("paths the one-line summary accounts for as unread", EXPECT.unread, unreadStrip);
  add(
    "the folder adds up: analyzed + unread = paths on this disk",
    obs.pathsOnDisk,
    analyzed !== null && unreadStrip !== null ? analyzed + unreadStrip : null,
  );

  for (const row of EXPECT.dropRows) {
    add(`the card names the reason it left them out: ${row}`, true, card.includes(row));
  }

  /**
   * The grade census, read off the header's filter chips. It used to be cut out
   * of the page's whole text with `/Critical: (\d+)/`, which is how a second
   * copy of the same three numbers on the announcement could hide a missing
   * first one. The chips are the surface that states them, and clicking one
   * filters the city — so they are what the total is tied to.
   */
  const chips = {
    Critical: obs.gradeChips?.Critical ?? null,
    High: obs.gradeChips?.High ?? null,
    Medium: obs.gradeChips?.Medium ?? null,
  };
  const chipSum =
    chips.Critical !== null && chips.High !== null
      ? chips.Critical + chips.High + (chips.Medium ?? 0)
      : null;
  const stripFindings = countIn(strip, /([\d.,]+) findings? to review/);
  const barFindings = countIn(findingsView, /Findings ([\d.,]+)/);
  const rows = Array.isArray(obs.findingRows) ? obs.findingRows.length : null;

  add("critical findings, said by the header's filter chip", EXPECT.severities.Critical, chips.Critical);
  add("high findings, said by the header's filter chip", EXPECT.severities.High, chips.High);
  add(
    "no medium finding was planted, none is claimed",
    EXPECT.severities.Medium,
    chips.Medium ?? 0,
  );
  add("the severity chips add up to the total", EXPECT.findings, chipSum);
  /* One surface, one census. The card that used to print "Critical: 2 / High: 2"
     under "Scan complete" is the reason this is a claim and not a style note:
     three surfaces said the same grades and the reader could not tell which one
     to trust. */
  add(
    "the announcement itself states no grade of its own",
    false,
    /(Critical|High|Medium)\s*:?\s*\d|\d\s*(Critical|High|Medium)/.test(obs.cardOwnText ?? ""),
  );
  add("the one-line summary counts the same total", EXPECT.findings, stripFindings);
  add("the control over the city counts the same total", EXPECT.findings, barFindings);
  add("the list a person can open has exactly that many rows", EXPECT.findings, rows);

  for (const planted of EXPECT.findingRows) {
    const hit = (obs.findingRows ?? []).find(
      (r) => r.path === planted.path && r.type === planted.type,
    );
    add(`a ${planted.type} stands under ${planted.path}`, true, Boolean(hit));
    add(`it is carried to source line ${planted.line}`, planted.line, hit ? hit.line : null);
  }
  add(
    "nothing else joined the list",
    SORTED(EXPECT.findingRows.map((f) => `${f.type} @ ${f.path}`)),
    SORTED((obs.findingRows ?? []).map((r) => `${r.type} @ ${r.path}`)),
  );

  add("the scan says it finished", true, card.includes("Scan complete"));

  /* Masking, scoped to the surface that promises it: the finding's own frame —
     the one the card opens on the line — and the city payload the browser was
     handed. The file view below the finding shows the person's own file as it
     is on their own disk; that is not a leak and the drive does not claim it
     is. It records both, so the claim cannot drift into a sentence the screen
     does not support. */
  const frame = obs.frameText ?? "";
  add("the finding's own frame carries the marker instead of the value", true, frame.includes(HIDDEN));
  add("the finding's own frame does not carry the value", false, frame.includes(SECRET));
  add(
    "the line beside the hidden value stays readable, so the frame is not a black box",
    true,
    frame.includes("HEADER_NAME"),
  );
  add("the city the browser holds does not carry the value", false, (obs.cityPayload ?? "").includes(SECRET));
  add("the city the browser holds is the scan's own answer", true, (obs.cityPayload ?? "").includes("src/api/routes.ts"));
  /* recorded, not claimed — see the comment above */
  add("the file view under the finding is the folder's own text, unmasked", true, (obs.fileViewText ?? "").includes(SECRET));

  add("the browser offered no native directory picker", true, obs.nativePickerAbsent === true);
  add("the app then asked for a whole folder", "directory", obs.pickerKind);
  add("a folder was handed to that request", true, obs.chooserSeen === true);
  add("the folder handed over is the one this file wrote", TARGET, obs.pickedPath);
  add("the city stood", true, obs.cityReached === true);
  add("requests that left this machine", 0, obs.externalRequests);

  return claims;
}

/* ─────────────────────────────────── plumbing ──────────────────────────────── */

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
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
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

function log(msg) {
  console.log(msg);
}

/* ─────────────────────────────────── the boots ──────────────────────────────── */

function bootBackend() {
  return own("npx", ["tsx", "src/server/index.ts"], {
    cwd: path.join(ROOT, "backend"),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      HOST: "127.0.0.1",
      FRONTEND_ORIGIN: ORIGIN,
      CODECITY_UPLOAD_DIR: path.join(SCRATCH, "staged"),
    },
  }, "backend");
}

function bootFrontend() {
  return own("npx", ["vite", "--port", String(FRONTEND_PORT), "--strictPort"], {
    cwd: path.join(ROOT, "frontend"),
    env: { ...process.env, BACKEND_PORT: String(BACKEND_PORT) },
  }, "dev-server");
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

/* ─────────────────────────────────── the drive ──────────────────────────────── */

async function drive() {
  const diskPaths = writeFixture();
  log(`fixture  ${TARGET}`);
  log(`         ${diskPaths} paths on disk, written by this file from a list it already had`);

  for (const port of [BACKEND_PORT, FRONTEND_PORT, CDP_PORT]) {
    const who = listening(port);
    if (who.length > 0)
      throw new Error(
        `port ${port} is already taken by ${who.join(" / ")} — this run does not share ports, and it will not take over someone else's`,
      );
  }

  const owned = { backend: null, dev: null, browser: null };
  const obs = { pathsOnDisk: diskPaths, externalRequests: 0, pickedPath: TARGET, ranAt: new Date().toISOString() };
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
    log(`  backend up on 127.0.0.1:${BACKEND_PORT} (${Date.now() - t0} ms)`);

    owned.dev = bootFrontend();
    await waitFor(`the dev server on ${APP}`, async () => (await fetchJson(APP, 2000)).ok, 60000, 400);
    const proxied = await fetchJson(`${APP.replace(/\/$/, "")}/api/health`);
    log(`  dev server up on ${APP} (${Date.now() - t0} ms), its proxy answers ${proxied.status}`);

    owned.browser = bootBrowser();
    await waitFor(
      `the browser on 127.0.0.1:${CDP_PORT}`,
      async () => (await fetchJson(`${CDP}/json/version`, 2000)).ok,
      60000,
      500,
    );
    log(`  browser up on 127.0.0.1:${CDP_PORT} (${Date.now() - t0} ms)`);

    // Playwright lives in this machine's global install, not in node_modules.
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

    /** the city the browser is handed — the payload behind every number above */
    page.on("response", async (res) => {
      if (/\/api\/result\/[^/]+\/city(\?|$)/.test(res.url())) {
        try {
          obs.cityPayload = await res.text();
          obs.cityPayloadBytes = obs.cityPayload.length;
        } catch {
          obs.cityPayload = "";
        }
      }
    });

    await page.addInitScript(() => {
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
    });
    await page.goto(APP, { waitUntil: "load" });
    obs.nativePickerAbsent = await page.evaluate(() => typeof window.showDirectoryPicker === "undefined");

    page.on("filechooser", async (chooser) => {
      obs.chooserSeen = true;
      const el = await chooser.element();
      obs.pickerKind = await el.evaluate((node) =>
        node.hasAttribute("webkitdirectory") ? "directory" : String(node.type),
      );
      await chooser.setFiles([TARGET]);
      log("  the folder was handed to the page through its own request");
    });

    const label = "Choose project folder";
    await waitFor(`the landing screen offers "${label}"`, async () => (await page.$$(`text=${label}`)).length > 0, 90000, 500);
    await page.screenshot({ path: path.join(OUT, "01-landing.png"), animations: "disabled" });
    if (!(await clickButton(page, label))) throw new Error(`no control labelled "${label}"`);
    log(`  pressed the control a stranger is told to press: "${label}"`);

    await waitFor("the city stands", async () => (await page.$(".workspace-modes")) !== null, CITY_TIMEOUT_MS);
    obs.cityReached = true;
    obs.cityMs = Date.now() - t0;
    log(`  city stands after ${obs.cityMs} ms (load ${loadavg().join(" ")})`);

    await waitFor("the completion card", async () => (await page.$(".start-summary")) !== null, 30000, 300);
    const pin = await page.$(".start-summary-pin");
    if (pin) await pin.click();
    await sleep(400);
    obs.cardText = text(await page.evaluate(() => document.body.innerText));
    /* The grade split is stated by the header, in the chips that filter the
       city when clicked — not by the announcement, which used to print the
       same three numbers a second time. Read off those controls, and read the
       card's own text apart from the page's, so the claim below cannot be
       satisfied by a number that lives somewhere else on the screen. */
    obs.gradeChips = await page.evaluate(() => {
      const flat = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
      const out = {};
      for (const b of document.querySelectorAll(".workspace-severities button[data-severity]")) {
        const label = flat(b.querySelector(".severity-label")?.textContent);
        const digits = flat(b.textContent).match(/(\d[\d.,]*)/);
        if (label && digits) out[label] = Number(digits[1].replace(/[^\d]/g, ""));
      }
      return out;
    });
    obs.cardOwnText = text(await page.evaluate(
      () => document.querySelector(".start-summary")?.innerText ?? "",
    ));
    await page.screenshot({ path: path.join(OUT, "02-summary-card.png"), animations: "disabled" });

    const toggle = await page.$('button[aria-controls="findings-panel"]');
    if (!toggle) throw new Error("no findings control over the city");
    await toggle.click();
    await waitFor("the findings list", async () => (await page.$$(".finding-row")).length > 0, 30000, 300);
    obs.findingsText = text(await page.evaluate(() => document.body.innerText));
    obs.findingRows = await page.evaluate(() => {
      const flat = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(".finding-file-card")].flatMap((card) => {
        const cardPath = flat(card.querySelector(".finding-file-path")?.textContent);
        return [...card.querySelectorAll(".finding-row")].map((row) => {
          const meta = flat(row.querySelector(".finding-row-meta")?.textContent);
          return {
            path: cardPath,
            line: Number((meta.match(/(\d+)/) ?? [])[1] ?? NaN),
            type: (meta.split("·").pop() ?? "").trim(),
            row: flat(row.textContent),
          };
        });
      });
    });
    await page.screenshot({ path: path.join(OUT, "03-findings.png"), animations: "disabled" });

    const secretIndex = (obs.findingRows ?? []).findIndex((r) => r.type === "HARDCODED_SECRET");
    if (secretIndex >= 0) {
      const rows = await page.$$(".finding-row");
      await rows[secretIndex].click();
      /* the frame arrives with the file's own text, loaded on demand: wait for
         the marker instead of the clock, so the claim below is never about how
         long this machine took */
      await waitFor(
        "the finding's own code frame",
        async () => (await page.$('[aria-label^="Code around"]')) !== null,
        30000,
        300,
      );
      const frameEl = await page.$('[aria-label^="Code around"]');
      obs.frameText = frameEl ? text((await frameEl.evaluate((n) => n.textContent)) ?? "") : "";
      /* the file view is a second surface, loaded on demand, and it shows the
         person's own file as it stands on their own disk */
      await waitFor(
        "the file view under the finding",
        async () => {
          const el = await page.$("[data-source-scroll]");
          return el ? text(await el.evaluate((n) => n.textContent)).includes("HEADER_NAME") : false;
        },
        30000,
        300,
      );
      const viewEl = await page.$("[data-source-scroll]");
      obs.fileViewText = viewEl ? text(await viewEl.evaluate((n) => n.textContent)) : "";
      obs.sourceText = text(await page.evaluate(() => document.body.innerText));
      await page.screenshot({ path: path.join(OUT, "04-finding-source.png"), animations: "disabled" });
    }

    const close = await page.$(".start-summary-close");
    if (close) await close.click();
    await waitFor("the one-line summary", async () => (await page.$(".start-summary-strip")) !== null, 30000, 300);
    obs.stripText = text(await page.evaluate(() => document.body.innerText));
    await page.screenshot({ path: path.join(OUT, "05-summary-strip.png"), animations: "disabled" });

    obs.totalMs = Date.now() - t0;
    obs.load = loadavg().map((n) => n.toFixed(2));
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

const text = (s) => String(s).replace(/\s+/g, " ").trim();

/** find the control by the words on it — a moved button must fail loudly */
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

/* ─────────────────────────────────── the report ─────────────────────────────── */

function report(claims, obs) {
  let red = 0;
  log("");
  log("BEHAUPTUNG DER FAHRT".padEnd(66) + " | ERWARTET / GESEHEN");
  log("─".repeat(66) + "-+-" + "─".repeat(40));
  for (const c of claims) {
    if (!c.ok) red += 1;
    const left = (c.ok ? "ok   " : "ROT  ") + c.claim;
    log(`${left.padEnd(66).slice(0, 66)} | ${short(c.expected)}${c.ok ? "" : "  ≠  " + short(c.observed)}`);
  }
  log("");
  log(
    `numbers: ${JSON.stringify({
      pathsOnDisk: obs.pathsOnDisk,
      analyzed: countIn(obs.cardText ?? "", /([\d.,]+) files? analyzed/),
      unread: countIn(obs.stripText ?? "", /([\d.,]+) files? were not read/),
      findings: countIn(obs.stripText ?? "", /([\d.,]+) findings? to review/),
      externalRequests: obs.externalRequests,
      cityMs: obs.cityMs,
      totalMs: obs.totalMs,
      ...(obs.load ? { load1_5_15: obs.load } : {}),
    })}`,
  );
  log(`${claims.length - red} of ${claims.length} claims hold. ${red} do not.`);
  return red;
}

function short(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 38 ? `${s.slice(0, 35)}…` : s;
}

/* ──────────────────────────────────── modes ─────────────────────────────────── */

/**
 * A capture with one thing made wrong. Each case is the smallest edit that
 * turns the screen's own words into a lie, so the claim it answers is shown to
 * be able to fail. Nothing here touches the product: the page text is what the
 * last run recorded, and only the number inside it moves.
 */
const FALSIFICATIONS = {
  drop: (obs) => {
    obs.stripText = obs.stripText.replace("5 files were not read", "4 files were not read");
    obs.cardText = obs.cardText.replace(
      "5 files in a format the scanners do not read",
      "4 files in a format the scanners do not read",
    );
    return "one unread path is no longer owned";
  },
  analyzed: (obs) => {
    obs.cardText = obs.cardText.replace("8 files analyzed", "9 files analyzed");
    obs.stripText = obs.stripText.replace("8 files analyzed", "9 files analyzed");
    return "one path is claimed as analyzed that was not read";
  },
  findings: (obs) => {
    obs.stripText = obs.stripText.replace("3 findings to review", "2 findings to review");
    return "the total on the line is not the total in the list";
  },
  "finding-line": (obs) => {
    const hit = (obs.findingRows ?? []).find((r) => r.type === "SQL_INJECTION");
    if (hit) hit.line = 7;
    return "the finding is carried to a line that was not planted";
  },
  "extra-finding": (obs) => {
    obs.findingRows = (obs.findingRows ?? []).concat([
      { path: "src/api/server.ts", line: 2, type: "CONSOLE_USAGE" },
    ]);
    return "a finding joins the list that nobody planted";
  },
  grades: (obs) => {
    obs.cardOwnText = `${obs.cardOwnText} Critical: 2`;
    return "the announcement states a grade the header already states";
  },
  mask: (obs) => {
    obs.frameText = obs.frameText.replace(HIDDEN, SECRET);
    return "the finding's own frame carries the value it promised to hide";
  },
  picker: (obs) => {
    obs.pickerKind = "file";
    return "the app asked for single files, not the folder a person chose";
  },
  egress: (obs) => {
    obs.externalRequests = 1;
    return "one request left the machine";
  },
};

function readCapture() {
  if (!existsSync(CAPTURE)) throw new Error(`no capture at ${CAPTURE} — drive it once first`);
  return JSON.parse(readFileSync(CAPTURE, "utf8"));
}

async function main() {
  const mode = process.argv[2];
  mkdirSync(OUT, { recursive: true });

  if (mode === "--fixture") {
    log(`wrote ${TARGET} with ${writeFixture()} paths`);
    return;
  }

  if (mode === "--expected") {
    log(JSON.stringify({ ...EXPECT, paths: Object.keys(FIXTURE) }, null, 1));
    return;
  }

  if (mode === "--replay" || mode === "--falsify") {
    const obs = readCapture();
    if (mode === "--falsify") {
      const which = (process.argv[3] ?? "drop").replace(/^--/, "");
      const mutate = FALSIFICATIONS[which];
      if (!mutate)
        throw new Error(
          `no falsification named "${which}" — this file knows: ${Object.keys(FALSIFICATIONS).join(", ")}`,
        );
      log(`falsifying: ${which} — ${mutate(obs)}`);
    }
    const red = report(evaluate(obs), obs);
    if (mode === "--falsify") {
      log("");
      log(
        red > 0
          ? `falsification: ${red} claim(s) went red, which is what a checker owes you`
          : "falsification stayed GREEN — this checker cannot tell a wrong number",
      );
      process.exitCode = red > 0 ? 0 : 1;
      return;
    }
    process.exitCode = red > 0 ? 1 : 0;
    return;
  }

  const obs = await drive();
  if (!obs.cityReached) throw new Error(obs.error ?? "the drive never reached a city");
  const red = report(evaluate(obs), obs);
  const stranded = (obs.leftoverPorts ?? []).length;
  if (stranded > 0) log(`${stranded} port(s) this run started are still listening — counted as a failure`);
  process.exitCode = red > 0 || stranded > 0 ? 1 : 0;
  if (process.exitCode === 0) log("EXIT 0 — the first drive holds.");
}

main().catch((e) => {
  console.error(`the run did not answer: ${e?.message ?? e}`);
  process.exitCode = 1;
});
