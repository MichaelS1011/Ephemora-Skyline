import { describe, it, expect, afterEach } from "vitest";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
  existsSync,
} from "fs";
import { createHash } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import os from "os";
import path from "path";
import { exportCity } from "../src/services/export/export-city.js";

/**
 * The image did not carry the rule pack. `shippedPacksRoot()` resolves
 * `<package>/rules` (backend/src/services/security/rule-packs.ts:50), the pack
 * is `default: true` — the one every profile falls back to when the user
 * selected none — and `Dockerfile.backend` copied only package.json, tsconfig,
 * src and dist. So the container listed a pack it did not have. CI has no
 * Docker job, which is exactly why this is asserted on the file itself.
 *
 * The other artifact that leaves this repository is the exported city folder
 * (`exportCity`): the built app, one scan's payload, and a hand-written server
 * with no framework behind it. The blocks below check both — the image for
 * what it carries, the folder for what it does when someone runs it.
 */
const REPO = path.resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(path.join(REPO, "docker/Dockerfile.backend"), "utf-8");

const stage = (name: string): string => {
  const froms = [...dockerfile.matchAll(/^FROM .*AS (\w+)$/gm)].map((m) => ({
    name: m[1]!,
    at: m.index!,
  }));
  const here = froms.find((f) => f.name === name);
  const next = froms[froms.indexOf(here!) + 1];
  return dockerfile.slice(here!.at + 1, next ? next.at : dockerfile.length);
};

describe("the backend image", () => {
  it("ships the bundled rule pack into the runner", () => {
    const runner = stage("runner");
    expect(runner).toMatch(/^COPY backend\/rules\/\s+\.\/backend\/rules\/$/m);
    // and the WORKDIR makes that path resolve where rule-packs.ts looks
    expect(runner).toMatch(/WORKDIR \/app\/backend/);
  });

  it("has a pack on disk with the name the copy claims", () => {
    const dir = path.join(REPO, "backend/rules/ephemora-core");
    const entries = readdirSync(dir);
    expect(entries).toContain("pack.json");
    const yaml = entries.filter((e) => /\.(ya?ml)$/.test(e));
    expect(yaml.length).toBeGreaterThan(0);
    const manifest = JSON.parse(readFileSync(path.join(dir, "pack.json"), "utf-8")) as {
      ruleCount: number;
      default?: boolean;
    };
    expect(manifest.default, "the pack has to be the fallback").toBe(true);
    expect(manifest.ruleCount).toBeGreaterThan(0);
  });
});

// ── The exported city folder ──────────────────────────────────────────────
// `exportCity` writes a folder carrying a hand-written HTTP server
// (`serve.mjs`, no framework) plus the runtime that runs it. Whoever opens the
// folder runs `start.sh`, a window prints an address and the reader goes to
// look. There is no console this reader opens and no second way in — so every
// request is a boundary the folder cannot afford to lose: an exception in its
// single handler is not a 500, it is the end of the process.
//
// Measured: `GET /%E0%A4%A` (a path whose percent-encoding does not decode)
// reached `decodeURIComponent` in the static handler, threw `URIError: URI
// malformed` and took the server down. The request needs no session, no id and
// no cooperation from the app: one stray request — a typed address ending in
// `100%`, a prober, a stale bookmark — and the shared folder stops answering.
//
// The cases spawn the folder's own `serve.mjs` and talk to it over a socket, so
// what is asserted is the process a reader gets, not a copy of its logic.

const exportDirs: string[] = [];
const exportChildren: ChildProcess[] = [];

afterEach(() => {
  for (const child of exportChildren.splice(0)) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  for (const dir of exportDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A port nobody holds: bound once for the kernel to name it, then released. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

/** A built app as far as the export is concerned: a page with the embed marker. */
function fakeWebDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "export-web-"));
  exportDirs.push(dir);
  writeFileSync(
    path.join(dir, "index.html"),
    "<!doctype html><html><head><!--EPHEMORA-EMBED--></head><body></body></html>",
    "utf8",
  );
  return dir;
}

interface Exported {
  port: number;
  child: ChildProcess;
  /** The folder as the reader has it, so a case can take a file out of it. */
  dir: string;
  stderr: () => string;
}

/** Export a city into a temp folder and run the folder's own server. */
async function runExportedServer(webFiles: Record<string, string> = {}): Promise<Exported> {
  const outDir = path.join(mkdtempSync(path.join(os.tmpdir(), "export-city-")), "city");
  exportDirs.push(outDir);
  const webDir = fakeWebDir();
  for (const [name, content] of Object.entries(webFiles)) {
    const target = path.join(webDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  exportCity(outDir, webDir, {
    analysisId: "walk-1",
    repo: { name: "probe" },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  });

  const port = await freePort();
  let stderr = "";
  const child = spawn(process.execPath, [path.join(outDir, "serve.mjs")], {
    cwd: outDir,
    env: { ...process.env, PORT: String(port), EPHEMORA_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  exportChildren.push(child);
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

  await waitForPort(
    port,
    () => child.exitCode !== null,
    () => stderr,
  );
  return { port, child, dir: outDir, stderr: () => stderr };
}

async function waitForPort(port: number, dead: () => boolean, stderr: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (dead()) throw new Error(`exported server exited before listening:\n${stderr()}`);
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`exported server never listened on ${port}`);
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Give a dying process the moment it needs to become an exited one. */
async function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface Answer {
  status: number;
  body: string;
}

/** The wire framing is not the payload: `res.end()` without a length is chunked. */
function dechunk(headers: string, body: string): string {
  if (!/transfer-encoding:\s*chunked/i.test(headers)) return body;
  let out = "";
  let rest = body;
  for (;;) {
    const eol = rest.indexOf("\r\n");
    if (eol < 0) break;
    const size = parseInt(rest.slice(0, eol), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    out += rest.slice(eol + 2, eol + 2 + size);
    rest = rest.slice(eol + 2 + size + 2);
  }
  return out;
}

/** One request on its own socket, answered or not — no client-side normalising. */
function request(port: number, target: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let raw = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no answer for ${target}:\n${raw}`));
    }, 5000);
    socket.once("connect", () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once("close", () => {
      clearTimeout(timer);
      const split = raw.indexOf("\r\n\r\n");
      const head = split < 0 ? raw : raw.slice(0, split);
      const body = split < 0 ? "" : raw.slice(split + 4);
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(raw)?.[1] ?? 0);
      resolve({ status, body: dechunk(head, body) });
    });
  });
}

describe("an exported city answers a request it cannot parse", () => {
  it("keeps serving the city after a path that will not decode", async () => {
    const server = await runExportedServer();
    const city = `/api/result/${encodeURIComponent("walk-1")}/city`;

    // The folder works as shipped: the one route answers the payload.
    const before = await request(server.port, city);
    expect(before.status, `city route before: ${before.body}`).toBe(200);
    expect(JSON.parse(before.body).analysisId).toBe("walk-1");

    // A path with broken `%`-encoding is a bad request, not the end of it.
    const malformed = await request(server.port, "/%E0%A4%A").catch((err: Error) => err);
    expect(malformed, `malformed request got no answer: ${String(malformed)}`).not.toBeInstanceOf(
      Error,
    );

    // The process that serves the folder is still the one that answers.
    await waitForExit(server.child, 1500);
    expect(server.child.exitCode, `server died:\n${server.stderr()}`).toBeNull();
    expect((malformed as Answer).status).toBe(400);

    // The point of the whole folder: the city is still there afterwards.
    const after = await request(server.port, city);
    expect(after.status, `city route after: ${after.body}`).toBe(200);
    expect(JSON.parse(after.body).analysisId).toBe("walk-1");
  }, 60_000);

  it("still refuses what only looks like a path inside the app", async () => {
    // The traversal guard is the other half of this handler; a decode that is
    // allowed to fail must not become a decode that is skipped.
    const server = await runExportedServer();
    const escaped = await request(server.port, "/..%2f..%2f..%2f..%2fetc%2fpasswd");
    expect(escaped.status, escaped.body).toBe(200);
    expect(escaped.body).not.toContain("root:");
    expect(escaped.body).toContain("__EPHEMORA_CITY__");
  }, 60_000);
});

// The same handler reads the folder a second time after it has already picked
// the file to answer with, and it hands that file to a stream it never watches.
// Both are still boundaries — and neither is the export's doing any more:
// `existsSync` asks about one moment and `statSync` about the next, so a single
// file a reader takes out in that gap is already gone when it is opened, and an
// asset copied out of a project can simply be unreadable. `exportCity` no
// longer wipes the output folder before it refills it; it builds in a
// disposable staging sibling and renames that over the destination in one step,
// so the empty-`app/` window a re-export used to open is gone (the shape itself
// is pinned by the atomicity guard in the re-export block below). Measured on
// the folder's own `serve.mjs`, uid 501: an unreadable file ended the process
// with `Unhandled 'error' event` / EACCES (exit 1), a vanished fallback with
// the same shape on ENOENT. One request and the shared city is gone — there is
// no second process to answer.
//
// The fix is expected to keep the two decisions that are already right: a
// missing file still falls back to the page, and nothing outside `app/` is
// ever read. The file is deliberately not re-checked against a clock: the
// window between the check and the read is the defect, not the test.

/** Root reads anything, so a mode-000 file cannot deny it. */
const deniesByMode = typeof process.getuid !== "function" || process.getuid() !== 0;

describe("an exported city outlives the files it serves", () => {
  it("serves the page again when the asset a reader asked for was deleted", async () => {
    const server = await runExportedServer({ "app.js": "console.log('one asset');\n" });
    unlinkSync(path.join(server.dir, "app", "app.js"));

    const answer = await request(server.port, "/app.js");
    await waitForExit(server.child, 1500);
    // Gone is still "not there", and "not there" is the page: the reader
    // keeps the city they were sent, whatever the address bar tried to fetch.
    expect(server.child.exitCode, `the folder died:\n${server.stderr()}`).toBeNull();
    expect(answer.status, answer.body).toBe(200);
    expect(answer.body).toContain("__EPHEMORA_CITY__");
    expect(answer.body).not.toContain("one asset");
  }, 60_000);

  it("answers 404 and lives when the page it falls back to is gone too", async () => {
    const server = await runExportedServer({ "app.js": "console.log('one asset');\n" });
    unlinkSync(path.join(server.dir, "app", "app.js"));
    unlinkSync(path.join(server.dir, "app", "index.html"));

    const answer = await request(server.port, "/app.js").catch(
      (err: Error) => ({ status: 0, body: String(err) }) satisfies Answer,
    );
    await waitForExit(server.child, 1500);
    expect(answer.status, answer.body).toBe(404);
    expect(server.child.exitCode, `the folder died:\n${server.stderr()}`).toBeNull();

    // The folder is still the folder: the one route it exists for answers.
    const city = await request(server.port, `/api/result/${encodeURIComponent("walk-1")}/city`);
    expect(city.status, city.body).toBe(200);
    expect(JSON.parse(city.body).analysisId).toBe("walk-1");
  }, 60_000);

  it.skipIf(!deniesByMode)(
    "answers 404 and lives when an asset cannot be read",
    async () => {
      const server = await runExportedServer({ "blocked.txt": "not in this payload\n" });
      // Present, a file, listed in the folder: the two checks that pass. Only
      // the read refuses, and that answer has to come from the stream.
      chmodSync(path.join(server.dir, "app", "blocked.txt"), 0o000);

      const answer = await request(server.port, "/blocked.txt").catch(
        (err: Error) => ({ status: 0, body: String(err) }) satisfies Answer,
      );
      await waitForExit(server.child, 1500);
      expect(answer.status, `${answer.body}\n${server.stderr()}`).toBe(404);
      expect(server.child.exitCode, `the folder died:\n${server.stderr()}`).toBeNull();
      expect(server.stderr()).not.toContain("Unhandled 'error' event");

      const city = await request(server.port, `/api/result/${encodeURIComponent("walk-1")}/city`);
      expect(city.status, city.body).toBe(200);
      expect(JSON.parse(city.body).analysisId).toBe("walk-1");
    },
    60_000,
  );
});

/**
 * The static atomicity guard for `exportCity`.
 *
 * The two cases in the describe below prove the behaviour on disk. This helper
 * proves the shape in the source, because the regression that would reopen the
 * empty-folder window — wipe the destination, then rebuild it in place — still
 * passes every behavioural case the moment the rebuild happens to succeed. It
 * requires the four moves of a committed swap and forbids the one move that is
 * no longer there; it throws (rather than returning a boolean) so a case can
 * assert the guard itself with `.toThrow()`.
 */
function assertAtomicExport(src: string): void {
  const required: Array<[string, RegExp]> = [
    ["a disposable staging sibling (`const staging =`)", /const staging = /],
    [
      "the destination moved aside (`renameSync(outDir, previous)`)",
      /fs\.renameSync\(\s*outDir,\s*previous\s*\)/,
    ],
    [
      "the finished city installed (`renameSync(staging, outDir)`)",
      /fs\.renameSync\(\s*staging,\s*outDir\s*\)/,
    ],
    [
      "a failed swap renamed back (`renameSync(previous, outDir)`)",
      /fs\.renameSync\(\s*previous,\s*outDir\s*\)/,
    ],
  ];
  for (const [move, pattern] of required) {
    if (!pattern.test(src)) throw new Error(`exportCity is no longer atomic: missing ${move}`);
  }
  if (/fs\.rmSync\(\s*outDir\b/.test(src)) {
    throw new Error("exportCity empties the destination before the build (`fs.rmSync(outDir)`)");
  }
}

// A reader who re-exports into a folder they have already opened, when the
// export then fails partway through, must not lose the city that is already
// there. The old `exportCity` deleted the destination (a leading
// `fs.rmSync(outDir, …)` before the build) so an embed error on the second run
// wiped the previous `city.json` and the reader's own notes with it — the
// failure destroyed the very thing it was trying to update.
//
// The two cases are the halves of the contract, on the folder on disk alone:
// no port, no browser, no spawned server. A failed re-export refuses and leaves
// the destination byte-for-byte intact; a successful one swaps the new folder
// in without leaving a temp or previous sibling behind, and the README's digest
// vouches for the bytes that actually landed in the destination.

describe("a re-export into a folder someone already opened", () => {
  it("a failed re-export keeps the previous city and the reader's notes", () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "export-atomic-"));
    exportDirs.push(parent);
    const outDir = path.join(parent, "city");
    mkdirSync(outDir);
    const priorCity = JSON.stringify({
      analysisId: "older-1",
      repo: { name: "vorige stadt" },
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    });
    const notes = "meine notizen ueber diese stadt\n";
    writeFileSync(path.join(outDir, "city.json"), priorCity, "utf8");
    writeFileSync(path.join(outDir, "meine-notizen.txt"), notes, "utf8");

    // A built app whose page carries no embed marker: the payload cannot go in,
    // so exportCity has to refuse it.
    const webDir = mkdtempSync(path.join(os.tmpdir(), "export-web-nomarker-"));
    exportDirs.push(webDir);
    writeFileSync(
      path.join(webDir, "index.html"),
      "<!doctype html><html><body></body></html>",
      "utf8",
    );

    // Refuse — and the refusal must never reach the folder already on disk.
    expect(() =>
      exportCity(outDir, webDir, {
        analysisId: "walk-1",
        repo: { name: "probe" },
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      }),
    ).toThrow(/embed marker/);

    // The previous city and the reader's notes survive exactly as they were.
    expect(existsSync(path.join(outDir, "city.json")), "the previous city was deleted").toBe(true);
    expect(
      existsSync(path.join(outDir, "meine-notizen.txt")),
      "the reader's notes were deleted",
    ).toBe(true);
    expect(readFileSync(path.join(outDir, "city.json"), "utf8")).toBe(priorCity);
    expect(readFileSync(path.join(outDir, "meine-notizen.txt"), "utf8")).toBe(notes);

    // The abandoned build lived in a disposable sibling of the destination and
    // cleaned itself up: no half-written temp or previous folder is left behind.
    const leftovers = readdirSync(parent).filter(
      (name) => name.includes(".tmp-") || name.includes(".previous-"),
    );
    expect(leftovers, `leftover siblings: ${leftovers.join(", ")}`).toEqual([]);
  });

  it("a successful re-export swaps the new city in and leaves no temp behind", () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "export-atomic-"));
    exportDirs.push(parent);
    const outDir = path.join(parent, "city");
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, "city.json"), '{"analysisId":"older-1"}', "utf8");
    writeFileSync(path.join(outDir, "meine-notizen.txt"), "alt\n", "utf8");

    const webDir = fakeWebDir(); // carries the embed marker
    const city = {
      analysisId: "walk-1",
      repo: { name: "probe" },
      findingsBySeverity: { P0: 1, P1: 0, P2: 0 },
    };
    const result = exportCity(outDir, webDir, city);

    // The destination is the new, complete folder: same path, new content.
    expect(result.dir).toBe(outDir);
    expect(JSON.parse(readFileSync(path.join(outDir, "city.json"), "utf8")).analysisId).toBe(
      "walk-1",
    );
    expect(readFileSync(path.join(outDir, "serve.mjs"), "utf8")).toContain("createServer");

    // The README's digest of city.json is the digest of the bytes that actually
    // landed here, not of a staging copy that since differed.
    const readme = readFileSync(path.join(outDir, "README.md"), "utf8");
    const line = readme.split("\n").find((l) => l.includes("`city.json`")) ?? "";
    const stated = /sha256:([0-9a-f]{16})/.exec(line)?.[1];
    const actual = createHash("sha256")
      .update(readFileSync(path.join(outDir, "city.json")))
      .digest("hex")
      .slice(0, 16);
    expect(stated, "the README must vouch for the city that is really there").toBe(actual);

    // A committed swap removes the folder it replaced: no temp, no previous.
    const leftovers = readdirSync(parent).filter(
      (name) => name.includes(".tmp-") || name.includes(".previous-"),
    );
    expect(leftovers, `leftover siblings: ${leftovers.join(", ")}`).toEqual([]);
  });

  it("stays atomic on disk: staging, a committed swap, and no early wipe", () => {
    const src = readFileSync(path.join(REPO, "backend/src/services/export/export-city.ts"), "utf8");

    // The shipped source holds the swap, so the guard passes it. This is the
    // real product file, read only — the case never writes it.
    expect(() => assertAtomicExport(src)).not.toThrow();

    // Gegenlauf, so the pass is not green by reading a file that says nothing.
    // (a) the literal regression: an early `fs.rmSync(outDir)` in place of any
    //     staging — refused before it could reach a swap.
    const wiped = [
      "export function exportCity(outDir, webDir, city) {",
      "  fs.rmSync(outDir, { recursive: true, force: true });",
      "  fs.mkdirSync(path.join(outDir, 'app'), { recursive: true });",
      "  return { dir: outDir };",
      "}",
    ].join("\n");
    expect(() => assertAtomicExport(wiped)).toThrow(/no longer atomic/);

    // (b) isolates the one clause that forbids an early wipe: the shipped atomic
    //     source with only a leading `rm` slipped in before the staging, so it
    //     can fail nowhere but the empties-the-destination branch — that line of
    //     the guard has teeth of its own.
    const sneak = src.replace(
      / {2}const staging = /,
      "  fs.rmSync(outDir, { recursive: true, force: true });\n  const staging = ",
    );
    expect(sneak, "the probe must actually add the early wipe").not.toBe(src);
    expect(() => assertAtomicExport(sneak)).toThrow(/empties the destination/);
  });
});

// ── The port the folder's one server is given ─────────────────────────────
// `start.sh` runs `serve.mjs` with no port argument; the port comes from the
// reader's `PORT`, and with none it is the README's documented default,
// `127.0.0.1:4179`. Measured on the shipped folder:
//   PORT=<already taken>  → the process dies on an unhandled 'error' event: a
//                           stack of node:internal frames ending in EADDRINUSE,
//                           not one line the reader could act on.
//   PORT=abc              → `Number("abc")` is NaN, handed straight to
//                           `listen()`, which throws ERR_INVALID_ARG_VALUE — the
//                           same raw stack, no usable answer.
// Either way the shared city never opens, and the crash is the folder's very
// first moment on someone else's desk. The default (no PORT) and a free PORT
// must keep opening the city exactly as before.
//
// A third value is legal and gets through the checks above: `PORT=0` is a real
// request — the kernel binds an ephemeral port and the city does run. But the
// address the folder prints, and the one it hands to the browser, are built
// from the requested number, so the reader is told `http://127.0.0.1:0/...`.
// Port 0 is not a port anyone can connect to: the city is up and unfindable,
// with a plausible-looking line in the terminal as the only evidence.

/** A city in a temp folder, for a case that spawns `serve.mjs` itself. */
function exportATempCity(): string {
  const outDir = path.join(mkdtempSync(path.join(os.tmpdir(), "export-city-")), "city");
  exportDirs.push(outDir);
  exportCity(outDir, fakeWebDir(), {
    analysisId: "walk-1",
    repo: { name: "probe" },
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
  });
  return outDir;
}

interface Spawned {
  /** The folder's own process, so a case can ask whether it is still alive. */
  child: ChildProcess;
  /** Resolves with the exit; a null code means it is still running at the deadline. */
  settle: (ms: number) => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stderr: () => string;
  /** The address the folder prints for the reader to follow. */
  stdout: () => string;
}

/** Run the folder's own `serve.mjs` with the given env, capturing stdout and stderr. */
function spawnServe(outDir: string, env: Record<string, string>): Spawned {
  let stderr = "";
  let stdout = "";
  const inherited = { ...process.env };
  // `PORT` is the one argument a reader gives this folder, and every case below
  // states it itself. One inherited from the test runner would decide a case by
  // accident, so it is dropped here and set per case.
  delete inherited.PORT;
  const child = spawn(process.execPath, [path.join(outDir, "serve.mjs")], {
    cwd: outDir,
    env: { ...inherited, EPHEMORA_NO_OPEN: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  exportChildren.push(child);
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    // `close` fires after stdio is drained, so the last stderr line is in.
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const settle = async (ms: number) =>
    (await Promise.race([
      closed,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ])) ?? { code: null, signal: null };
  return { child, settle, stderr: () => stderr, stdout: () => stdout };
}

/**
 * Waits for the one line the folder prints when it starts listening, and hands
 * back everything it said. The address in it is the reader's only way in, so it
 * is read off the process's own stdout — never recomputed here.
 */
async function waitForPrintedLine(
  live: () => string,
  pattern: RegExp,
  ms: number,
): Promise<string> {
  const deadline = Date.now() + ms;
  for (;;) {
    const text = live();
    if (pattern.test(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (Date.now() >= deadline) {
      throw new Error(
        `nothing matching ${pattern.source} was printed in ${ms}ms, stdout was:\n${text}`,
      );
    }
  }
}

/** A port held open by this very test process, so the child cannot take it. */
function holdPort(): Promise<{ port: number; release: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const holder = net.createServer();
    holder.once("error", reject);
    holder.listen(0, "127.0.0.1", () => {
      const address = holder.address();
      const port = typeof address === "object" && address ? address.port : 0;
      if (!port) {
        holder.close();
        reject(new Error("no held port"));
        return;
      }
      resolve({ port, release: () => new Promise<void>((r) => holder.close(() => r())) });
    });
  });
}

describe("the port an exported city is asked to open on", () => {
  const oneLine = (err: string): string[] => err.trim().split(/\r?\n/).filter(Boolean);
  const noStack = (err: string): RegExpMatchArray | null =>
    err.match(/\bat\s|node:internal|serve\.mjs:\d+|ERR_INVALID_ARG|Unhandled 'error' event/);

  it("reports a busy port in one line instead of dying on a stack", async () => {
    const held = await holdPort();
    try {
      const server = spawnServe(exportATempCity(), { PORT: String(held.port) });
      const { code } = await server.settle(8000);
      const err = server.stderr();

      // It stops — but stops with an answer, not a crash.
      expect(code, `busy port ${held.port}: server never exited`).not.toBeNull();
      expect(code, `busy port ${held.port}: exited 0`).not.toBe(0);
      expect(oneLine(err), `stderr was not one line:\n${err}`).toHaveLength(1);
      expect(noStack(err), `raw stack, not a human line:\n${err}`).toBeNull();
      // The one line says where it tried to listen, so the reader can react.
      expect(err).toContain("127.0.0.1");
      expect(err).toContain(String(held.port));
    } finally {
      await held.release();
    }
  }, 60_000);

  it("rejects a port that is not a number in the same one line, not with NaN", async () => {
    const server = spawnServe(exportATempCity(), { PORT: "abc" });
    const { code } = await server.settle(8000);
    const err = server.stderr();

    expect(code, `PORT=abc: server never exited`).not.toBeNull();
    expect(code, `PORT=abc: exited 0`).not.toBe(0);
    expect(oneLine(err), `stderr was not one line:\n${err}`).toHaveLength(1);
    expect(noStack(err), `raw stack, not a human line:\n${err}`).toBeNull();
    expect(err, `the bad value vanished as NaN:\n${err}`).toContain("abc");
    expect(err).not.toContain("NaN");
  }, 60_000);

  it("still opens the city on a free port and keeps running", async () => {
    // The positive control: the fix must not touch the working default path.
    const server = await runExportedServer();
    const city = await request(server.port, `/api/result/${encodeURIComponent("walk-1")}/city`);
    expect(city.status, city.body).toBe(200);
    expect(JSON.parse(city.body).analysisId).toBe("walk-1");

    await waitForExit(server.child, 500);
    expect(server.child.exitCode, `free port died:\n${server.stderr()}`).toBeNull();
    expect(server.stderr(), `free port complained:\n${server.stderr()}`).not.toMatch(
      /in use|invalid|NaN|Unhandled/,
    );
  }, 60_000);

  const shownPort = (text: string): number =>
    Number(/http:\/\/127\.0\.0\.1:(\d+)\//.exec(text)?.[1]);

  it("prints a port it actually listens on when PORT=0 asks the kernel for one", async () => {
    // The reader has nothing but this line: no console, no second way in. The
    // address has to be the one that was really bound, so the assertions below
    // take the port out of stdout and then use it — connect, and ask the city.
    const server = spawnServe(exportATempCity(), { PORT: "0" });
    const printed = await waitForPrintedLine(server.stdout, /http:\/\/127\.0\.0\.1:\d+\//, 15_000);
    const port = shownPort(printed);

    expect(port, `stdout named the requested zero, not a bound port:\n${printed}`).toBeGreaterThan(
      0,
    );
    expect(
      await canConnect(port),
      `the city is up but nothing answers the printed ${port}:\n${printed}`,
    ).toBe(true);

    const city = await request(port, `/api/result/${encodeURIComponent("walk-1")}/city`);
    expect(city.status, `${city.body}\nstdout:\n${printed}`).toBe(200);
    expect(JSON.parse(city.body).analysisId).toBe("walk-1");

    await waitForExit(server.child, 500);
    expect(server.child.exitCode, `PORT=0 died:\n${server.stderr()}`).toBeNull();
    expect(server.stderr(), `PORT=0 complained:\n${server.stderr()}`).not.toMatch(
      /Cannot start|in use|invalid|NaN|Unhandled/,
    );
  }, 60_000);

  it("keeps printing the documented 127.0.0.1:4179 when the reader gives no PORT", async () => {
    // The other positive control: reading the bound address must not move or
    // re-interpret the default the README promises.
    const server = spawnServe(exportATempCity(), {});
    const printed = await waitForPrintedLine(server.stdout, /http:\/\/127\.0\.0\.1:\d+\//, 15_000);

    expect(shownPort(printed), `the default address moved:\n${printed}`).toBe(4179);
    const city = await request(4179, `/api/result/${encodeURIComponent("walk-1")}/city`);
    expect(city.status, `${city.body}\nstdout:\n${printed}`).toBe(200);
    expect(JSON.parse(city.body).analysisId).toBe("walk-1");
  }, 60_000);
});
