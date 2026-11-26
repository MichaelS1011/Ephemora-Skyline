/**
 * capture-demos.mjs — record two 30 s walks of the running app.
 *
 * Usage: node scripts/capture-demos.mjs            # needs the app on :4000
 * Output: docs/assets/captures/{skyline,forge}.webm + one poster .png each.
 *
 * This is a genuine browser recording, not a rebuilt scene: the two clips are
 * the shipped preview driven through the same steps a reader takes. ffmpeg
 * trims each to exactly 30 s and makes a poster; no audio track is added.
 */
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve Playwright from the caller's global install — a hard-coded machine
// path is a trace no reader's clone carries (backend/tests/baum-hygiene.test.ts).
const GLOBAL_ROOT = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const PW = path.join(GLOBAL_ROOT, "playwright", "index.mjs");
const { chromium } = await import(PW);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "docs/assets/captures");
const BASE = "http://127.0.0.1:4000";
const DURATION_MS = 30_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});

const page = await context.newPage();
const clicks = async (labels) => {
  for (const label of labels) {
    const items = page.getByRole("button", { name: label });
    const count = await items.count();
    if (count > 0) {
      await items.first().click({ timeout: 4000 }).catch(() => {});
      await wait(350);
    }
  }
};

// ── Clip 1: the city (Skyline) ─────────────────────────────────────────────
const started = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await wait(800);
// The demo only loads through the landing action — a bare ?city= permalink
// leaves the start page (the city is not yet in the store).
await clicks(["Stadt betreten", "Enter the city"]);
await wait(600);
await clicks(["Einführung überspringen", "Skip the introduction", "Weiter", "Continue"]);
await wait(400);
await clicks(["Demo ansehen", "Explore demo", "Weiter", "Continue"]);
await wait(3500); // give WebGL time to draw towers, not just the ground plane
await clicks(["Kritisch: 3 Funde. Stadt filtern", "Critical: 3 findings"]);
await wait(1000);
await clicks(["SICHERHEIT", "SECURITY", "RÖNTGEN", "X-RAY", "•STRUKTUR", "•STRUCTURE"]);
// Walk the keyboard camera while the scene renders.
for (let i = 0; i < 4; i += 1) {
  await page.keyboard.press("ArrowRight");
  await wait(700);
}
await clicks(["Zeig mir die Funde", "Show me the findings"]);
await wait(1800);
await clicks(["Fund-Details ausklappen", "Nächster Fund", "Next finding"]);
let rest = DURATION_MS - (Date.now() - started);
if (rest > 0) await wait(rest);

const cityVideo = page.video();
await context.close();
const cityPath = await cityVideo.path();
console.log(`CITY_VIDEO=${cityPath}`);
let forgePath = null;
if (process.env.SKYLINE_ONLY !== "1") {

// ── Clip 2: Forge ───────────────────────────────────────────────────────────
const forgeContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const forge = await forgeContext.newPage();
const forgeClicks = async (labels) => {
  for (const label of labels) {
    const items = forge.getByRole("button", { name: label });
    if ((await items.count()) > 0) {
      await items.first().click({ timeout: 4000 }).catch(() => {});
      await wait(400);
    }
  }
};
const fStart = Date.now();
await forge.goto(BASE, { waitUntil: "domcontentloaded" });
await wait(1500);
await forgeClicks(["Open FORGE", "FORGE öffnen"]);
await wait(800);
await forgeClicks(["Demo shop", "02 / WEB APP"]);
await wait(1800);
await forgeClicks(["02 Connect", "02 Verbinden"]);
await wait(1200);
await forgeClicks(["03 Test", "03 Testen", "▶ Test project", "▶ Projekt testen"]);
await wait(1800);
// Drive the preview so the clip shows a working app, not a static page.
const add = forge.getByRole("button", { name: "Add" });
if ((await add.count()) > 0) {
  await add.first().click().catch(() => {});
  await wait(700);
}
const order = forge.getByRole("textbox", { name: "Order" });
if ((await order.count()) > 0) await order.first().fill("Demo order").catch(() => {});
await forgeClicks(["Place order", "Bestellung abschließen"]);
await wait(1200);
rest = DURATION_MS - (Date.now() - fStart);
if (rest > 0) await wait(rest);

const forgeVideo = forge.video();
await forgeContext.close();
  forgePath = await forgeVideo.path();
  console.log(`FORGE_VIDEO=${forgePath}`);
}
await browser.close();

// ── Trim + poster, with ffmpeg ─────────────────────────────────────────────
for (const [name, src] of [
  ["skyline", cityPath],
  ["forge", forgePath],
].filter(([, src]) => src !== null)) {
  const mp4 = path.join(OUT, `${name}.mp4`);
  const png = path.join(REPO, `docs/assets/${name}-fresh.png`);
  const cut = spawnSync("ffmpeg", [
    "-y", "-i", src, "-t", "30", "-an", "-c:v", "libx264", "-preset", "fast",
    "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
  ], { encoding: "utf8" });
  if (cut.status !== 0) console.error(`ffmpeg ${name} failed:`, cut.stderr?.slice(-500));
  const shot = spawnSync("ffmpeg", [
    "-y", "-ss", "12", "-i", mp4, "-frames:v", "1", png,
  ], { encoding: "utf8" });
  if (shot.status !== 0) console.error(`poster ${name} failed:`, shot.stderr?.slice(-500));
  console.log(`DONE ${name}: ${mp4} + ${png}`);
}
