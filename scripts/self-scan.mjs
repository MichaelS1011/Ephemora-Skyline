#!/usr/bin/env node
/**
 * `npm run self-scan` — the repository's own folder through the product.
 *
 * This is a gate, not a screenshot: it starts a freshly built backend with an
 * isolated staging/archive root, sends the working tree through the same
 * `POST /api/analyze-local` route the browser uses, and fails if any finding is
 * still open after the project's documented self-scan policy is applied.
 *
 * The policy is deliberately small and visible here:
 *   - `backend/tests/fixtures/regeln/` holds deliberately vulnerable rule
 *     fixtures. Their job is to make the rule tests fire, not to accuse this
 *     repository. The user-facing scan is unchanged.
 *   - `CONSOLE_USAGE` is code hygiene, and this repository's CLI scripts print
 *     on purpose. The rest of the scan still sees console calls in app source.
 *   - `.gitleaks.toml` allowlists exact fake credential values, never paths.
 *
 * Everything else has to be zero. A new finding is a red gate; triage it in
 * `docs/SELF_SCAN.md` rather than adding a broad exclusion.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const EXPLICIT_URL = argValue("--url") ?? process.env.EPHEMORA_SELF_SCAN_URL;
const SCAN_ROOT = path.resolve(argValue("--root") ?? ROOT);
const DEFAULT_PROFILE = args.includes("--default-profile");
const WRITE_FINDINGS = argValue("--write-findings");

const SELF_SCAN_CONFIG = {
  profile: "standard",
  rulePacks: ["ephemora-core"],
  // The fixtures under backend/tests/fixtures/regeln teach the rules; teaching/
  // teaches people. Both hold deliberate flaws that must not read as findings in
  // the product code. Recorded as a standing exception in docs/SELF_SCAN.md.
  excludePaths: ["backend/tests/fixtures/regeln", "teaching"],
  disabledFindingTypes: ["CONSOLE_USAGE"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const trimBase = (url) => url.replace(/\/+$/, "");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(base, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = String(error?.message ?? error);
    }
    await sleep(150);
  }
  throw new Error(`backend did not become healthy: ${last}`);
}

function trackedFiles(root) {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr?.toString().trim() || result.status}`);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

function readPayload(root) {
  const files = [];
  const skipped = { binary: 0, tooLarge: 0 };
  for (const rel of trackedFiles(root)) {
    const full = path.join(root, rel);
    let stat;
    try {
      stat = fsSync.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > 2 * 1024 * 1024) {
      skipped.tooLarge += 1;
      continue;
    }
    const buf = fsSync.readFileSync(full);
    if (buf.includes(0)) {
      skipped.binary += 1;
      continue;
    }
    files.push({ path: rel, content: buf.toString("utf8") });
  }
  return { files, skipped };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function findingRows(result) {
  const rows = [];
  for (const file of result.files ?? []) {
    for (const issue of file.vulnerabilities ?? []) {
      rows.push({
        path: file.path,
        line: issue.line,
        severity: issue.severity,
        type: issue.type,
        ruleId: issue.ruleId ?? "",
        provenance: issue.provenance ?? "",
      });
    }
  }
  return rows;
}

function printGroups(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.severity} ${row.type} ${row.ruleId} (${row.provenance})`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${key}`);
  }
  console.log("");
  for (const row of rows.slice(0, 30)) {
    console.log(`  ${row.path}:${row.line}  ${row.type}  ${row.ruleId}`);
  }
  if (rows.length > 30) console.log(`  … ${rows.length - 30} more`);
}

let child;
let temp;
let base = EXPLICIT_URL ? trimBase(EXPLICIT_URL) : "";
try {
  const payload = readPayload(SCAN_ROOT);
  if (payload.files.length === 0) throw new Error(`no source files under ${SCAN_ROOT}`);
  console.log(
    `self-scan: ${payload.files.length} text files from ${SCAN_ROOT} ` +
      `(skipped ${payload.skipped.binary} binary, ${payload.skipped.tooLarge} over 2 MB)`,
  );

  if (!base) {
    const serverEntry = path.join(ROOT, "backend", "dist", "server", "index.js");
    if (!fsSync.existsSync(serverEntry)) {
      throw new Error("backend/dist is missing — run `npm run build --workspace backend` first");
    }
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "ephemora-self-scan-"));
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [serverEntry], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        EPHEMORA_UPLOAD_DIR: path.join(temp, "uploads"),
        EPHEMORA_RUNS_DIR: path.join(temp, "runs"),
        ...(args.includes("--online") ? {} : { SKYLINE_OFFLINE: "1" }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.once("exit", (code) => {
      if (code !== 0 && code !== null) process.stderr.write(stderr);
    });
    await waitForHealth(base);
  }

  const response = await fetch(`${base}/api/analyze-local`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ephemora-Skyline",
      files: payload.files,
      config: DEFAULT_PROFILE ? { profile: "standard" } : SELF_SCAN_CONFIG,
      dropped: {},
    }),
  });
  const started = await response.json().catch(() => ({}));
  if (!response.ok || typeof started.id !== "string") {
    throw new Error(
      `analyze-local answered HTTP ${response.status}: ${started.error ?? "no analysis id"}`,
    );
  }

  const deadline = Date.now() + 5 * 60_000;
  let status;
  while (Date.now() < deadline) {
    status = await (await fetch(`${base}/api/status/${started.id}`)).json();
    if (status.status === "complete" || status.status === "failed") break;
    await sleep(250);
  }
  if (status?.status !== "complete") {
    throw new Error(`scan did not complete: ${status?.status ?? "timeout"} ${status?.error ?? ""}`);
  }

  const result = await (await fetch(`${base}/api/result/${started.id}`)).json();
  if (WRITE_FINDINGS) {
    const delivered = (result.files ?? [])
      .flatMap((file) =>
        (file.vulnerabilities ?? []).map((issue) => {
          const { code: _code, snippet: _snippet, match: _match, ...rest } = issue;
          return {
            schema: "ephemora.finding.v1",
            analysisId: "Ephemora-Skyline",
            ...rest,
            path: file.path,
          };
        }),
      )
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    await fs.writeFile(
      path.resolve(SCAN_ROOT, WRITE_FINDINGS),
      delivered.map((row) => JSON.stringify(row)).join("\n") + "\n",
    );
    console.log(`self-scan: wrote ${delivered.length} finding(s) to ${WRITE_FINDINGS}`);
  }
  const rows = findingRows(result);
  const command = rows.filter((row) => row.type === "CMD_INJECTION");
  console.log(
    `self-scan: ${result.summary?.totalFiles ?? "?"} analyzed, ` +
      `${rows.length} finding(s), ${command.length} CMD_INJECTION, run ${started.id}`,
  );
  if (rows.length > 0) {
    printGroups(rows);
    if (!DEFAULT_PROFILE) {
      throw new Error("self-scan is red: unresolved findings (see docs/SELF_SCAN.md)");
    }
    console.log("self-scan: default profile list written; the policy gate is a separate run");
  } else {
    console.log("self-scan: PASS — no open findings under the documented policy");
  }
} finally {
  await stopChild(child);
  if (temp) await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
}
