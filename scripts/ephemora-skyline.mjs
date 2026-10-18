#!/usr/bin/env node
/**
 * `npx ephemora-skyline` — one command, one address.
 *
 * The product's promise is that nothing leaves the machine, so the launcher
 * does exactly two things: start the backend (which now also serves the built
 * app), and open the address it printed. No daemon, no config, no account.
 *
 * Exit codes matter for `npx` users who pipe it into a script: 0 on a clean
 * shutdown, 1 when the port is taken (the backend already prints a sentence),
 * 2 when this package was installed without its built frontend.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, "..", "backend", "dist", "server", "index.js");
const web = path.join(here, "..", "frontend", "dist");

if (!existsSync(server)) {
  console.error(
    "ephemora-skyline: the server build is missing from this install (backend/dist). " +
      "Reinstall the package, or run from a checkout with `npm run build`.",
  );
  process.exit(2);
}
if (!existsSync(path.join(web, "index.html"))) {
  console.error(
    "ephemora-skyline: the app build is missing from this install (frontend/dist). " +
      "Reinstall the package, or run from a checkout with `npm run build`.",
  );
  process.exit(2);
}

const port = process.env.PORT ?? "4173";
const host = process.env.HOST ?? "127.0.0.1";
const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`;

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOST: host, EPHEMORA_WEB_DIR: web },
});

const forward = (signal) => () => child.kill(signal);
process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));

// Open the browser once the health route answers — not after a fixed sleep.
const started = Date.now();
const opener =
  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
const timer = setInterval(async () => {
  try {
    const res = await fetch(new URL("api/health", url));
    if (!res.ok) return;
    clearInterval(timer);
    console.log(`\n  Ephemora Skyline is open at ${url}  (started in ${Date.now() - started} ms)\n`);
    if (process.env.EPHEMORA_NO_OPEN !== "1") {
      spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
    }
  } catch {
    /* not up yet */
  }
}, 150);

child.on("exit", (code) => {
  clearInterval(timer);
  process.exit(code ?? 0);
});
