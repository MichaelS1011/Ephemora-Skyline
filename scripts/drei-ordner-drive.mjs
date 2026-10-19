#!/usr/bin/env node
/**
 * drei-ordner-drive.mjs — the upload path, the three modes and the city build,
 * driven end over end through the real UI for three folder shapes:
 *
 *   klein    3 files, one hardcoded secret — the smallest honest city
 *   mittel   14 files in 4 directories, package.json + a vulnerable pin —
 *            districts, dependency arcs, an injection and a secret
 *   gross    120 files across 30 nested directories (4 levels) — the shape
 *            of a real monorepo: drill paths, LOD, many districts
 *
 * For every folder it proves, with numbers read off the screen:
 *  - the folder was handed over through the page's OWN fallback picker
 *  - the city stands and the completion card's arithmetic closes:
 *    analysed + not-read = the file count on disk
 *  - STRUCTURE / SECURITY / DEPENDENCIES each activate, each changes the
 *    mode bar's own aria state, none throws a console error
 *  - the dock's triage count equals the card's finding count
 * Screenshots go to /tmp/drei-ordner/ for the operator; the claims are the
 * numbers, never the pictures.
 *
 * It uses the operator's running pair (3010/4000) — this session's own
 * servers — and never binds or starts anything.
 */
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(
  process.env.DRIVE_PLAYWRIGHT_ENTRY ?? join(homedir(), ".local/lib/node_modules/playwright/index.js"),
);
const { chromium } = require("playwright");

const ROOT = "/tmp/drei-ordner";
const OUT = join(ROOT, "shots");
const URL = "http://localhost:3010/";
const CITY_TIMEOUT_MS = Number(process.env.CITY_TIMEOUT_MS ?? 240000);

// ── fixtures ────────────────────────────────────────────────────────────────
const SECRET = 'const API_KEY = "sk-liv3-' + "aB3dEf7Gh9Ij2Kl4";
function file(path, content) {
  const full = join(ROOT, path);
  mkdirSync(full.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(full, content);
}
function buildFixtures() {
  rmSync(join(ROOT, "klein"), { recursive: true, force: true });
  rmSync(join(ROOT, "mittel"), { recursive: true, force: true });
  rmSync(join(ROOT, "gross"), { recursive: true, force: true });

  // klein — 3 files
  file("klein/auth.ts", `export const KEY = "${SECRET}";\nexport const login = (u: string) => u;\n`);
  file("klein/util.py", `def add(a, b):\n    return a + b\n`);
  file("klein/README.md", `# klein\n\nA three-file project.\n`);

  // mittel — 14 files in 4 directories
  const m = "mittel";
  file(`${m}/package.json`, JSON.stringify({
    name: "mittel-app", version: "1.0.0",
    dependencies: { "lodash": "4.17.20", "express": "4.16.0", "left-pad": "1.3.0" },
  }, null, 2));
  file(`${m}/src/server.ts`, `import express from "express";\nimport { run } from "./tools/exec.js";\nconst app = express();\napp.get("/i", (q, r) => r.send("<b>" + q.query.x + "</b>"));\napp.listen(0);\n`);
  file(`${m}/src/tools/exec.ts`, `import { exec } from "child_process";\nexport const run = (target: string) => exec("ping " + target);\n`);
  file(`${m}/src/db.ts`, `const PASSWORD = "${SECRET}";\nexport const query = (id: string) => "SELECT * FROM t WHERE id = " + id;\n`);
  for (let i = 0; i < 6; i++) file(`${m}/src/lib/f${i}.ts`, `export const f${i} = (x: number) => x + ${i};\n`);
  file(`${m}/web/index.html`, `<!doctype html><title>mittel</title><body><div id="root"></div></body>\n`);
  file(`${m}/web/app.ts`, `document.getElementById("root")!.innerHTML = location.hash.slice(1);\n`);
  file(`${m}/tests/server.test.ts`, `import { describe, it } from "vitest";\ndescribe("s", () => it("works", () => {}));\n`);
  file(`${m}/docs/notes.md`, `# notes\n\nNothing to see here.\n`);

  // gross — 120 files across 30 nested directories
  const g = "gross";
  const dirs = [];
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 5; b++) dirs.push(`${g}/pkg${a}/area${b}/deep${(a + b) % 3}/leaf${b % 2}`);
  let n = 0;
  for (const d of dirs) {
    for (let i = 0; i < 4; i++) {
      const poison = n === 7 ? `\nconst TOKEN = "${SECRET}";\n` : n === 42 ? `\nexport const q = (x: string) => "SELECT * FROM u WHERE a = " + x;\n` : "";
      file(`${d}/mod${i}.ts`, `export const v${n}_${i} = ${n};\nexport const use = (x: number) => x * ${i + 1};${poison}`);
      n++;
    }
  }
  file(`${g}/package.json`, JSON.stringify({
    name: "gross-monorepo", version: "0.1.0",
    dependencies: { "axios": "0.21.1", "minimist": "1.2.5" },
  }, null, 2));
  file(`${g}/README.md`, `# gross\n\n120 files, 30 nested directories.\n`);
}
function countFiles(dir) {
  let c = 0;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) c += countFiles(p);
    else c++;
  }
  return c;
}

// ── helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (what, fn, ms, step = 400) => {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(step);
  }
};
const num = (s, re) => {
  const m = s.match(re);
  return m ? Number(m[1].replace(/[^\d]/g, "")) : NaN;
};

// ── the drive ───────────────────────────────────────────────────────────────
async function driveFolder(page, name, claims, chooserBox) {
  const dir = resolve(ROOT, name);
  const onDisk = countFiles(dir);

  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await waitFor("landing", () => page.$$eval("button", (bs) => bs.some((b) => b.textContent?.includes("Choose project folder"))), 60000);

  chooserBox.dir = dir;
  chooserBox.seen = false;
  await page.getByRole("button", { name: /Choose project folder/ }).click();
  await waitFor("the folder was requested by the page", async () => chooserBox.seen, 30000, 200);

  await waitFor("the city stands", () => page.$(".workspace-modes"), CITY_TIMEOUT_MS);
  await waitFor("the completion card", () => page.$(".start-summary"), 60000, 300);
  const pin = await page.$(".start-summary-pin");
  if (pin) await pin.click();
  await sleep(500);
  const card = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: join(OUT, `${name}-1-city.png`), animations: "disabled" });

  // arithmetic off the card: "<A> files analyzed" + "<U> ... not read" = on disk
  const first = (...vals) => vals.find((v) => Number.isFinite(v)) ?? NaN;
  const analysed = num(card, /(\d[\d,.]*) files analyzed/);
  const unread = first(
    num(card, /(\d[\d,.]*) files? in a format the scanners do not read/),
    num(card, /(\d[\d,.]*) files were not read/),
    0,
  );
  const findings = num(card, /(\d[\d,.]*) findings? to review/);

  // read at arrival, while all five surfaces are on screen — the scan
  // banner folds itself into a strip later, and a strip has no count
  // One total, four surfaces — each read inside its OWN container. A first
  // version searched body.innerText for "N findings to review" and got the
  // context card's number where it meant to see the scan banner's: the same
  // surface counted twice is a gate with no teeth, and the negative control
  // (a banner deliberately one finding high) stayed green because of it.
  const surfaces = await page.evaluate(() => {
    const inBox = (sel, re) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      // innerText, not textContent: the count and the word are separate
      // nodes, and only the rendered text puts a space between them
      const m = (el.innerText ?? "").replace(/\u00a0/g, " ").match(re);
      return m ? Number(m[1].replace(/[^\d]/g, "")) : null;
    };
    const chip = (id) => {
      const el = document.querySelector(`.workspace-severities button[data-severity="${id}"]`);
      if (!el) return 0; // a chip is only drawn above zero, so absent IS the zero
      const m = (el.innerText ?? "").match(/(\d[\d.,]*)/);
      return m ? Number(m[1].replace(/\D/g, "")) : 0;
    };
    return {
      present: {
        severities: !!document.querySelector(".workspace-severities"),
        dock: !!document.querySelector(".action-dock"),
        summary: !!document.querySelector(".start-summary"),
        ctxCard: !!document.querySelector(".panel-context-card"),
      },
      p0: chip("P0"),
      p1: chip("P1"),
      p2: chip("P2"),
      dockTriage: inBox(".action-dock", /Triage\s*(\d+)/i),
      dockFindings: inBox(".action-dock", /(\d[\d.,]*)\s+findings?\b/i) ?? inBox(".action-dock", /Findings\s*(\d+)/i),
      // the announcement states no grade: the census belongs to the chips
      // above, which are the ones that filter the city when clicked
      bannerGrades: (
        (document.querySelector(".start-summary")?.innerText ?? "").match(
          /(Critical|High|Medium|Kritisch|Hoch|Mittel)\s*:?\s*\d|\d\s*(Critical|High|Medium|Kritisch|Hoch|Mittel)/g,
        ) ?? []
      ).length,
      ctxCard: inBox(".panel-context-card", /(\d[\d.,]*)\s+findings?\b/i),
    };
  });
  const chipSum = surfaces.p0 + surfaces.p1 + surfaces.p2;

  // Die Wortebene darf mit der Breite nicht verschwinden. Gemessen an einem
  // Punkt: "▲ 3" ist eine Form und eine Zahl und sagt nicht, welcher Grad das
  // ist — Schwelle ist 300 px, kleine Desktop-Fenster sind zu schmal, und
  // Farbsehschwäche macht die Schwere unsichtbar. Das Wort muss bei 390 und
  // bei 1440 da sein.
  // Ein Testmesspunkt nur: live lesen, sofort zurück auf die aktuelle Größe.
  const narrowWord = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".workspace-severities button")];
    const label = chips[0]?.querySelector(".severity-label");
    return { labels: chips.filter((b) => b.querySelector(".severity-label")).length, words: chips.map((b) => (b.querySelector(".severity-label")?.textContent ?? "").trim()) };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(900);
  const narrow = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".workspace-severities button")];
    const visible = chips.filter((b) => (b.getBoundingClientRect().width ?? 0) > 0);
    const labels = visible.filter((b) => {
      const l = b.querySelector(".severity-label");
      return l && getComputedStyle(l).display !== "none" && l.getBoundingClientRect().width > 0;
    });
    return { chips: visible.length, labelled: labels.length };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(900);


  // the three modes: each must activate and answer in its own aria state
  const modes = {};
  for (const label of ["SECURITY", "DEPENDENCIES", "STRUCTURE"]) {
    await page.getByRole("radio", { name: new RegExp(label) }).click();
    await sleep(900);
    modes[label] = await page.getByRole("radio", { name: new RegExp(label) }).getAttribute("aria-checked");
    await page.screenshot({ path: join(OUT, `${name}-mode-${label.toLowerCase()}.png`), animations: "disabled" });
  }
  // dock triage count vs the card's finding count — the dock's own text is
  // "Triage" + "8 findings" as two nodes, so the space is optional
  // Ein Klick, der nichts tut, ist ein geschluckter Klick. Ein Treffer-Test auf
  // Layout-Rechtecke hat hier zweimal falschen Alarm gegeben (verdeckte
  // <details>-Kinder haben echte Rects, ohne gemalt zu werden), also fragt
  // dieses Tor die einzige Instanz, die zählt: die Anwendung selbst.
  const dockClicks = {};
  for (const [label, re] of [
    ["overview", /Overview|R\u00fcckblick|\u00dcbersicht/],
    ["triage", /Triage/],
  ]) {
    const btn = page.getByRole("button", { name: re }).first();
    const before = await page.evaluate(() => document.body.innerText);
    const err = await btn.click({ timeout: 5000 }).then(() => null).catch((e) => String(e).split("\n")[0].slice(0, 60));
    await sleep(1200);
    const after = await page.evaluate(() => document.body.innerText);
    dockClicks[label] = { clicked: err === null, reacted: after !== before };
  }
  // der Dock-Zähler wird am Ankunftsmoment gelesen (surfaces.dockTriage);
  // ein zweiter Lesegang nach den Modus- und Klick-Tests findet ihn nicht mehr,
  // weil das Dock im Triage-Modus „3 / 8“ zeigt statt „Triage 8 findings“

  // the same total on every surface that states it. Three of these were
  // computed independently in the code until city/facts.ts became the one door;
  // this is the check that catches a door being propped open again.

  claims.push({
    folder: name, onDisk, analysed, unread,
    arithmeticCloses: analysed + unread === onDisk,
    findings, surfaces, chipSum, narrowWord, narrow, dockClicks,
    modes,
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  buildFixtures();
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
  // ONE handler for the whole run — a handler per folder would stack and the
  // second setFiles on an already-answered chooser times out
  const chooserBox = { dir: null, seen: false };
  page.on("filechooser", async (chooser) => {
    chooserBox.seen = true;
    await chooser.setFiles([chooserBox.dir]);
  });
  const claims = [];
  for (const name of ["klein", "mittel", "gross"]) {
    console.log(`── ${name} ──`);
    try {
      await driveFolder(page, name, claims, chooserBox);
    } catch (e) {
      claims.push({ folder: name, failed: String(e).slice(0, 200) });
      await page.screenshot({ path: join(OUT, `${name}-FAILED.png`), animations: "disabled" }).catch(() => {});
    }
  }
  await browser.close();
  console.log(JSON.stringify({ claims, consoleErrors }, null, 1));
  const ok = claims.every((c) => !c.failed) &&
    claims.every((c) => c.arithmeticCloses) &&
    claims.every((c) => Object.values(c.modes).every((v) => v === "true")) &&
    claims.every((c) => c.surfaces.dockTriage === c.findings) &&
    // one total, four surfaces: header chips, dock triage, dock findings,
    // context card — and every container must actually be there, or a null
    // quietly reads as agreement. The announcement adds no number to that
    // circle any more: it states the file count and the total, and stays out
    // of the grade census, which one surface above already says.
    // jeder Dock-Klick muss ankommen und eine Wirkung haben
    claims.every((c) => Object.values(c.dockClicks).every((d) => d.clicked && d.reacted)) &&
    // jedes sichtbare Schwere-Chip trägt bei 390 px sein Wort
    claims.every((c) => c.narrow.chips > 0 && c.narrow.labelled === c.narrow.chips) &&
    claims.every((c) => Object.values(c.surfaces.present).every(Boolean)) &&
    claims.every((c) => c.chipSum === c.findings) &&
    claims.every((c) => c.surfaces.dockFindings === c.findings) &&
    // die Meldung nennt keine Schwere: sie wäre die zweite oder dritte Kopie
    claims.every((c) => c.surfaces.bannerGrades === 0) &&
    claims.every((c) => c.surfaces.ctxCard === c.findings) &&
    consoleErrors.length === 0;
  console.log(ok ? "DREI-ORDNER-DRIVE: PASS" : "DREI-ORDNER-DRIVE: FAIL");
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error("drive failed:", e);
  process.exit(2);
});
