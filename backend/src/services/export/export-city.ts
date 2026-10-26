/**
 * A city on someone else's desk.
 *
 * `exportCity` writes a folder that carries the built app, one scan's city
 * payload and a server that answers exactly one route. Whoever opens the
 * folder runs one file and sees the same city — no Node install on their side
 * (this machine's runtime travels with it), no account, no network.
 *
 * What the folder deliberately does NOT carry: the source code (the payload
 * holds paths, lines, categories and masked snippets, the same bytes
 * `/api/result/:id/city` answers), any route that runs a scanner or a test,
 * and any write path. A shared city is a photograph of a scan, and the
 * folder's README says so in the reader's language.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ExportResult {
  dir: string;
  bytes: number;
  files: number;
  /** The one route the folder's server answers. */
  route: string;
}

const RUNTIME_FILE = "runtime/node";
const SERVER_FILE = "serve.mjs";
const ENTRY = "start.sh";
const ENTRY_WIN = "start.cmd";

/** The payload as the app expects it, plus what a reader needs to judge it. */
export function exportCity(
  outDir: string,
  webDir: string,
  city: unknown,
  options: { lang?: "en" | "de"; titled?: string } = {},
): ExportResult {
  // Validate the inputs before a single byte of the destination is touched.
  if (!fs.existsSync(path.join(webDir, "index.html"))) {
    throw new Error(`exportCity: no built app in ${webDir}`);
  }
  const analysisId = (city as { analysisId?: unknown } | null)?.analysisId;
  if (typeof analysisId !== "string" || analysisId.length === 0) {
    throw new Error("exportCity: the payload has no analysisId");
  }

  // The city is built in full in a disposable sibling of the destination, in
  // the same parent, so the last step is a rename and not a copy. A reader
  // re-exporting into a folder they have already opened therefore keeps the old
  // city — and their own notes in it — untouched until the new one is provably
  // complete; nothing in `outDir` is deleted before the swap. The README's
  // digests are taken from these same bytes, and the rename carries them over
  // unchanged, so what the README vouches for is the city that lands.
  const staging = `${outDir}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const previous = `${outDir}.previous-${process.pid}-${randomBytes(6).toString("hex")}`;
  const hadTarget = fs.existsSync(outDir);

  try {
    fs.mkdirSync(path.join(staging, "app"), { recursive: true });

    copyDir(webDir, path.join(staging, "app"));
    embedPayload(path.join(staging, "app", "index.html"), city);
    fs.writeFileSync(path.join(staging, "city.json"), JSON.stringify(city));
    fs.writeFileSync(path.join(staging, "serve.mjs"), SERVER_SOURCE);
    fs.writeFileSync(
      path.join(staging, "package.json"),
      '{\n  "type": "module",\n  "private": true\n}\n',
    );
    fs.writeFileSync(path.join(staging, "LICENSE"), readLicense(webDir));

    // The runtime travels with the folder: the reader is not asked to install
    // anything. It is the same binary that generated the file, so the OS and the
    // architecture are known to match the person doing the sharing, not the one
    // opening it — stated in the README rather than discovered on a double-click.
    const runtime = path.join(staging, RUNTIME_FILE);
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    fs.copyFileSync(process.execPath, runtime);
    fs.chmodSync(runtime, 0o755);

    fs.writeFileSync(path.join(staging, ENTRY), startScriptSh(), { mode: 0o755 });
    fs.writeFileSync(path.join(staging, ENTRY_WIN), startScriptCmd());
    // Last, because its digests are read from the files just written here.
    fs.writeFileSync(path.join(staging, "README.md"), readme(city, options, staging));

    // The new city is complete and every byte its README vouches for is on disk.
    // Now, and only now, the swap: the destination steps aside under a temporary
    // name and the staging folder takes its place — same parent, so a rename.
    if (hadTarget) fs.renameSync(outDir, previous);
    try {
      fs.renameSync(staging, outDir);
    } catch (swapError) {
      // The install failed. Put the old city back where it was so the reader
      // still has the folder they had, then surface the cause.
      if (hadTarget) {
        try {
          fs.renameSync(previous, outDir);
        } catch (restoreError) {
          // A rollback that itself failed must not hide the original cause. The
          // old city is still under `previous`; name it and carry both errors.
          throw new Error(
            `exportCity: the new city could not be installed (${
              swapError instanceof Error ? swapError.message : String(swapError)
            }) and the previous city could not be restored in place (${
              restoreError instanceof Error ? restoreError.message : String(restoreError)
            }) — the old city is still under "${previous}"`,
            { cause: swapError },
          );
        }
      }
      throw swapError;
    }
    // The swap is committed: the folder it replaced is gone for good.
    if (hadTarget) fs.rmSync(previous, { recursive: true, force: true });
  } finally {
    // A build that never reached a committed swap leaves only the disposable
    // staging folder; the destination was never written to. Remove the remnant.
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }

  return { dir: outDir, ...measure(outDir), route: `/api/result/${analysisId}/city` };
}

/**
 * The payload goes into the page, before any module runs.
 *
 * Measured the other way first: with only the route served, the app installed
 * its guard only after the first module had already fetched
 * `/api/footprint` (a 503 it then reported as a console error) and opened the
 * landing screen instead of the city. A city in a folder has no "boot" moment
 * that is not the city itself, so the page carries it.
 */
function embedPayload(indexHtml: string, city: unknown): void {
  const html = fs.readFileSync(indexHtml, "utf-8");
  const marker = "<!--EPHEMORA-EMBED-->";
  if (!html.includes(marker)) throw new Error("exportCity: index.html has no embed marker");
  const data = JSON.stringify(city).replace(/</g, "\\u003c");
  const script = `<script>window.__EPHEMORA_CITY__=${data};</script>`;
  fs.writeFileSync(indexHtml, html.replace(marker, script));
}

function startScriptSh(): string {
  return `#!/bin/sh
# Ephemora Skyline — one exported city. Run this file; it opens in your browser.
cd "$(dirname "$0")" || exit 1
./${RUNTIME_FILE} ${SERVER_FILE}
`;
}

function startScriptCmd(): string {
  // Windows has no POSIX shell; the .cmd is offered for completeness and says
  // plainly that the runtime this folder carries is the POSIX build.
  return `@echo off\r\nREM Ephemora Skyline — one exported city.\r\nREM This folder carries a POSIX node runtime; on Windows, run \`node serve.mjs\` with a local Node 20+.\r\necho This export carries a POSIX runtime. Install Node 20+ and run: node serve.mjs\r\npause\r\n`;
}

const SERVER_SOURCE = `// The one server an exported city has: a page, its assets, and its payload.
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { spawn } from "node:child_process";

const root = import.meta.dirname;
const app = join(root, "app");
const payload = readFileSync(join(root, "city.json"));
const id = JSON.parse(payload.toString("utf-8")).analysisId;
const host = process.env.HOST || "127.0.0.1";
// PORT is the one argument a reader can give this folder, and it is read
// straight from the environment. Taken at face value it is a raw crash: an
// occupied port ends the process on an unhandled 'error' event, a non-number
// becomes NaN and is refused by listen(). So it is checked before it reaches
// listen(), and an unusable one is named in a line the reader can act on. The
// documented default — no PORT at all — stays 127.0.0.1:4179.
const given = process.env.PORT === undefined || process.env.PORT.trim() === ""
  ? null
  : process.env.PORT.trim();
const port = given === null ? 4179 : Number.parseInt(given, 10);
if (given !== null && (!Number.isInteger(port) || port < 0 || port > 65535 || String(port) !== given)) {
  console.error(\`Cannot start this city: PORT must be a whole number from 0 to 65535 (got "\${process.env.PORT}"). Set PORT and run again.\`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

// existsSync asks about one moment and statSync about the next, and a path can
// still change in that gap. A re-export is no longer one of those moments —
// exportCity builds in a staging sibling and renames it over the destination in
// a single step, so the folder is never emptied and refilled — but a single
// file the reader deletes between the two calls still asks and then fails. A
// path that cannot be stated is a path that is not there, so this answers the
// way the line below already does — and it does not let a throw reach a handler
// whose failure is the end of the process.
function isFileHere(at) {
  if (!existsSync(at)) return false;
  try {
    return statSync(at).isFile();
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === \`/api/result/\${encodeURIComponent(id)}/city\`) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(payload);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "This is an exported city: only the city itself is available." }));
    return;
  }
  // A path whose percent-encoding does not decode (a typed address ending in
  // \`100%\`, a stray prober) is a bad request. Unguarded it throws out of this
  // handler, and there is no second process behind it: the folder's only server
  // ends and the reader's city is gone with a stack trace.
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Bad request: the path is not valid percent-encoding." }));
    return;
  }
  const rel = normalize(decoded).replace(/^([/\\\\])+/, "");
  let file = join(app, rel || "index.html");
  if (!file.startsWith(app + sep) && file !== app) {
    res.writeHead(403).end();
    return;
  }
  if (!isFileHere(file)) file = join(app, "index.html");
  const type = TYPES[extname(file)] || "application/octet-stream";
  const cache = file.includes(\`\${sep}assets\${sep}\`) ? "public, max-age=31536000, immutable" : "no-cache";
  // The file is chosen above and opened here, and the open is the one answer
  // this handler does not get to see: a copy that is not readable, a folder
  // wiped mid-request. An 'error' with no listener is not a 500 in a process
  // this small — it is the end of the only server the city has, and the reader
  // loses the window over one address. So the header goes out when the read is
  // genuinely open, and a read that never opened is a 404 like any absent file.
  const stream = createReadStream(file);
  let open = false;
  stream.once("open", () => {
    open = true;
    res.writeHead(200, { "content-type": type, "cache-control": cache });
  });
  stream.on("error", (error) => {
    const shown = String(rel || "index.html").replace(/\\s+/g, " ").slice(0, 120);
    console.log(\`  Not served: \${shown} (\${error.code || error.message})\`);
    if (open) res.destroy();
    else {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Not found");
    }
  });
  stream.pipe(res);
});

// This is the folder's only server, and there is no process behind it to take
// the over. A listen failure — the port already taken, the address not
// bindable — is emitted as an 'error' event on the server; with no listener it
// is an uncaught exception and a raw stack on the reader's first run. One human
// line names where it tried to listen, then the process stops. It does not
// reach for another port: the reader set this one, and the README says so.
server.on("error", (error) => {
  const why =
    error.code === "EADDRINUSE"
      ? \`http://\${host}:\${port} is already in use\`
      : \`could not listen on \${host}:\${port} (\${error.code || error.message})\`;
  console.error(\`Cannot start this city: \${why}. Set PORT to a free port and run again.\`);
  process.exit(1);
});

server.listen(port, host, () => {
  // The port that was asked for is not always the port that is open: 0 is a
  // legal request, and the kernel answers it with an ephemeral one. The reader
  // has only this line and the window this opens, so the address is read off
  // the socket that just started listening. Only a real port is believed —
  // anything else falls back to what was given rather than printing a number
  // nobody bound.
  const bound = server.address();
  const opened = typeof bound === "object" && bound ? bound.port : port;
  const shown = Number.isInteger(opened) && opened > 0 ? opened : port;
  const url = \`http://\${host}:\${shown}/?city=\${encodeURIComponent(id)}\`;
  console.log(\`\\n  This city is open at \${url}\\n  Close this window to stop it.\\n\`);
  if (process.env.EPHEMORA_NO_OPEN !== "1") {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
  }
});
`;

function readme(
  city: unknown,
  options: { lang?: "en" | "de"; titled?: string },
  outDir: string,
): string {
  const c = city as {
    analysisId?: string;
    repo?: { name?: string };
    findingsBySeverity?: Record<string, number>;
  };
  const name = options.titled ?? c.repo?.name ?? "city";
  const sev = c.findingsBySeverity ?? {};
  const total = (sev.P0 ?? 0) + (sev.P1 ?? 0) + (sev.P2 ?? 0);
  // The digests are of the files as they were written a moment ago, so the
  // README the reader checks first can be checked against the folder itself.
  const digests = ["city.json", "serve.mjs", "start.sh"].map((file) => {
    const hash = createHash("sha256")
      .update(fs.readFileSync(path.resolve(outDir, file)))
      .digest("hex");
    return `| \`${file}\` | \`sha256:${hash.slice(0, 16)}…\` |`;
  });
  return `# ${name} — an Ephemora Skyline city

This folder is **one scan of one folder**, as a picture you can open. It carries
the app, the measurements and the findings' descriptions — not the source code.
Paths, line numbers, categories and short masked snippets are what a scan
records; the files themselves were never copied out of the project.

- ${total} findings (${sev.P0 ?? 0} critical, ${sev.P1 ?? 0} high, ${sev.P2 ?? 0} medium)
- scan id \`${c.analysisId}\`

## Open it

Run \`./start.sh\` (macOS or Linux). It starts a local server on
\`127.0.0.1:4179\` and opens it; close that window to stop it. Nothing is sent
anywhere, and no other route exists: this folder answers the city and nothing
else — no scanning, no test runner, no verdicts.

The runtime in \`runtime/node\` is the one the exporter used. It matches that
machine's operating system and processor, so an export made on macOS runs on a
Mac. On another system, install Node 20+ and run \`node serve.mjs\`.

## Check it

| File | Digest |
| --- | --- |
${digests.join("\n")}

A shared city is a photograph of a scan. To act on a finding, open the project
in Skyline on your own machine.
`;
}

function readLicense(webDir: string): string {
  const candidates = [path.join(webDir, "..", "..", "LICENSE"), path.join(webDir, "..", "LICENSE")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf-8");
  }
  return "Apache-2.0\n";
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

function measure(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const walk = (at: string): void => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const target = path.join(at, entry.name);
      if (entry.isDirectory()) walk(target);
      else {
        files += 1;
        bytes += fs.statSync(target).size;
      }
    }
  };
  walk(dir);
  return { bytes, files };
}
