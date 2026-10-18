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
import { createHash } from "node:crypto";
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
  if (!fs.existsSync(path.join(webDir, "index.html"))) {
    throw new Error(`exportCity: no built app in ${webDir}`);
  }
  const analysisId = (city as { analysisId?: unknown } | null)?.analysisId;
  if (typeof analysisId !== "string" || analysisId.length === 0) {
    throw new Error("exportCity: the payload has no analysisId");
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "app"), { recursive: true });

  copyDir(webDir, path.join(outDir, "app"));
  embedPayload(path.join(outDir, "app", "index.html"), city);
  fs.writeFileSync(path.join(outDir, "city.json"), JSON.stringify(city));
  fs.writeFileSync(path.join(outDir, "serve.mjs"), SERVER_SOURCE);
  fs.writeFileSync(
    path.join(outDir, "package.json"),
    '{\n  "type": "module",\n  "private": true\n}\n',
  );
  fs.writeFileSync(path.join(outDir, "LICENSE"), readLicense(webDir));

  // The runtime travels with the folder: the reader is not asked to install
  // anything. It is the same binary that generated the file, so the OS and the
  // architecture are known to match the person doing the sharing, not the one
  // opening it — stated in the README rather than discovered on a double-click.
  const runtime = path.join(outDir, RUNTIME_FILE);
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.copyFileSync(process.execPath, runtime);
  fs.chmodSync(runtime, 0o755);

  fs.writeFileSync(path.join(outDir, ENTRY), startScriptSh(), { mode: 0o755 });
  fs.writeFileSync(path.join(outDir, ENTRY_WIN), startScriptCmd());
  // Last, because its digests are read from the files above.
  fs.writeFileSync(path.join(outDir, "README.md"), readme(city, options, outDir));
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
const port = Number(process.env.PORT || 4179);
const host = process.env.HOST || "127.0.0.1";

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
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\\\])+/, "");
  let file = join(app, rel || "index.html");
  if (!file.startsWith(app + sep) && file !== app) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = join(app, "index.html");
  const type = TYPES[extname(file)] || "application/octet-stream";
  const cache = file.includes(\`\${sep}assets\${sep}\`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": type, "cache-control": cache });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  const url = \`http://\${host}:\${port}/?city=\${encodeURIComponent(id)}\`;
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
