#!/usr/bin/env node
/**
 * demo-city.mjs — bake the demo the start screen already offers.
 *
 * WHY THIS FILE EXISTS. `Explore demo` fetches `GET /api/cities/default`, a
 * city built by the backend from a seeded, synthetic repository. That is the
 * right demo for a local install: the app and the demo arrive together. A
 * hosted page without a backend has no such address, and inventing a second
 * demo for it would mean two cities a reader could compare and find different.
 *
 * So the hosted build ships the SAME bytes: this script calls the backend's own
 * `getDemoResult()` and `mapResultToCityData()` and writes the result to
 * `frontend/public/demo/city.json`. Nothing is re-typed, nothing is randomised
 * a second time, and `backend/tests/demo-city-baked.test.ts` regenerates it in
 * memory and fails the moment the file and the backend disagree.
 *
 *   npm run build --workspace backend
 *   node scripts/demo-city.mjs            # write the file
 *   node scripts/demo-city.mjs --check    # fail if the file is stale
 *
 * The `--check` branch is what a lane runs before shipping a build; CI runs the
 * vitest twin, which needs no build directory.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "frontend/public/demo/city.json");
const DEMO = path.join(REPO, "backend/dist/server/routes/demo.js");
const MAPPER = path.join(REPO, "backend/dist/utils/cityMapper.js");

if (!existsSync(DEMO) || !existsSync(MAPPER)) {
  console.error(
    "demo-city: backend/dist is missing — run `npm run build --workspace backend` first.",
  );
  process.exit(1);
}

const { getDemoResult } = await import(pathToFileURL(DEMO).href);
const { mapResultToCityData } = await import(pathToFileURL(MAPPER).href);

const city = mapResultToCityData(getDemoResult());
const json = `${JSON.stringify(city)}\n`;
const digest = createHash("sha256").update(json).digest("hex");
const bytes = Buffer.byteLength(json);
const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (process.argv.includes("--check")) {
  if (previous !== json) {
    console.error(
      `demo-city: frontend/public/demo/city.json is stale (backend now writes ${bytes} B, ` +
        `sha256 ${digest.slice(0, 16)}). Run: node scripts/demo-city.mjs`,
    );
    process.exit(1);
  }
  console.log(`demo-city: up to date — ${bytes} B, sha256 ${digest.slice(0, 16)}`);
  process.exit(0);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, json);
console.log(
  `demo-city: wrote ${path.relative(REPO, OUT)} — ${bytes} B, sha256 ${digest.slice(0, 16)}` +
    `${previous === json ? " (unchanged)" : ""}`,
);
