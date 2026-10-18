#!/usr/bin/env node
/**
 * `node scripts/local-llm-probe.mjs` — asks the shipped door a real question.
 *
 * The contract tests in `backend/tests/llm-explain-guard.test.ts` prove what the
 * code intends to send; a stub cannot prove that a real server accepts the shape
 * or how long it takes to answer. This script calls the same exported functions
 * the route calls — no re-implementation, so a passing run is evidence about the
 * product and not about a copy of it — and prints the two numbers a reader would
 * otherwise have to trust: how many bytes left, and how long the answer took.
 *
 * It refuses to run against anything but loopback, because that is the rule it
 * is testing. A model reached over an SSH tunnel is still `127.0.0.1` here.
 *
 *   EPHEMORA_LLM_URL=http://127.0.0.1:8100/v1 EPHEMORA_LLM_MODEL=Qwen3.5-9B \
 *     node scripts/local-llm-probe.mjs
 *
 * Exit codes: 0 answered, 1 no model configured, 2 the model refused or timed
 * out, 3 the address broke the loopback rule.
 */
import {
  buildExplainRequest,
  explainFacts,
  explainFinding,
  llmConfigFrom,
} from "../backend/dist/services/security/llm-explain.js";

const config = llmConfigFrom(process.env);
if (!config) {
  console.error(
    "local-llm-probe: EPHEMORA_LLM_URL is not set, so there is nothing to ask.\n" +
      "  EPHEMORA_LLM_URL=http://127.0.0.1:8100/v1 EPHEMORA_LLM_MODEL=<name> node scripts/local-llm-probe.mjs",
  );
  process.exit(1);
}

/** Two lines a scanner would flag: one injection, one credential. */
const CASES = [
  {
    label: "concatenated query",
    issue: {
      type: "SQL_INJECTION",
      ruleId: "py:sql-injection",
      severity: "P0",
      line: 42,
      code: 'db.query("SELECT * FROM users WHERE id=" + user_id)',
      message: "Query built by string concatenation",
      provenance: "semgrep",
      cwe: "CWE-89",
    },
  },
  {
    label: "hard-coded credential",
    issue: {
      type: "HARDCODED_SECRET",
      ruleId: "gitleaks:generic-api-key",
      severity: "P0",
      line: 7,
      code: 'API_KEY = "sk-live-ABCDEFGHIJKLMNOP1234"',
      message: "Hard-coded credential",
      provenance: "gitleaks",
      secretValue: "sk-live-ABCDEFGHIJKLMNOP1234",
    },
  },
];

const lang = process.env.EPHEMORA_LLM_LANG === "de" ? "de" : "en";
let failures = 0;

console.log(`endpoint ${config.url}\nmodel    ${config.model || "(server default)"}`);

const runModule = !process.argv.includes("--live");
for (const { label, issue } of CASES) {
  if (!runModule) break;
  const facts = explainFacts(issue);
  const body = JSON.stringify(buildExplainRequest(issue, config.model, lang));
  const leaked = body.includes("sk-live-ABCDEFGHIJKLMNOP1234");
  console.log(
    `\n── ${label} ──\n  sent keys   ${Object.keys(facts).join(", ")}` +
      `\n  payload     ${body.length} bytes, masked ${leaked ? "NO — LEAK" : "yes"}`,
  );
  const started = performance.now();
  const out = await explainFinding(issue, { url: config.url, model: config.model, lang });
  const ms = Math.round(performance.now() - started);
  if (!out.ok) {
    failures += 1;
    console.log(`  after ${ms} ms: ${out.reason}`);
    continue;
  }
  console.log(`  after ${ms} ms:\n    ${out.text.replace(/\n+/g, "\n    ")}`);
}

if (!runModule) {
  // the live section below is the point of this run
} else {
  if (failures === CASES.length) process.exit(2);
  console.log(`\nprobe: ${CASES.length - failures}/${CASES.length} answered`);
}

/**
 * `--live` asks the whole product instead of the module: the backend is started
 * with `EPHEMORA_LLM_URL` set, a folder with two known findings is scanned
 * through the route the browser uses, and the question carries the fingerprint
 * from the city payload. That is the difference between "this function works"
 * and "the door the user clicks works" — the fingerprint the UI holds has to be
 * the one the server resolves, and the loopback rule has to survive Express.
 */
if (process.argv.includes("--live")) {
  const { spawn } = await import("node:child_process");
  const port = process.env.EPHEMORA_PROBE_PORT ?? "4310";
  const base = `http://127.0.0.1:${port}`;
  const headers = {
    Origin: base,
    "Sec-Fetch-Site": "same-origin",
    "content-type": "application/json",
  };
  const child = spawn(process.execPath, ["backend/dist/server/index.js"], {
    env: { ...process.env, PORT: port, HOST: "127.0.0.1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  let code = 0;
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const health = await (await fetch(`${base}/api/health`)).json();
    console.log(`\n── live ──\n  health      localModel ${JSON.stringify(health.localModel)}`);
    if (health.localModel?.configured !== true) {
      console.error("  the server says no model is configured");
      process.exit(1);
    }

    const scan = await (
      await fetch(`${base}/api/analyze-local`, {
        headers,
        method: "POST",
        body: JSON.stringify({
          name: "probe",
          files: [
            {
              path: "app/query.py",
              content:
                'import sqlite3\n\n\ndef lookup(user_id):\n    db = sqlite3.connect("app.db")\n    return db.execute("SELECT * FROM users WHERE id=" + user_id)\n',
            },
            {
              path: "app/config.js",
              content: 'const API_KEY = "sk-live-ABCDEFGHIJKLMNOP1234";\nexport default API_KEY;\n',
            },
          ],
        }),
      })
    ).json();
    const id = scan.id ?? scan.analysisId;
    if (!id) {
      console.error(`  the scan did not start: ${JSON.stringify(scan).slice(0, 200)}`);
      process.exit(1);
    }
    for (let i = 0; i < 400; i++) {
      const status = await (await fetch(`${base}/api/status/${id}`, { headers })).json();
      if (["complete", "done", "error"].includes(String(status.status))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const city = await (await fetch(`${base}/api/result/${id}/city`, { headers })).json();
    // The city payload carries the tree, not a flat file list — and the card
    // reads its fingerprints out of that tree, so the probe has to as well.
    const files = [];
    const walk = (dir) => {
      for (const f of [...(dir.detailFiles ?? []), ...(dir.districtFiles ?? [])]) files.push(f);
      for (const c of dir.children ?? []) walk(c);
    };
    if (city.tree) walk(city.tree);
    const findings = files.flatMap((f) => f.findings.map((v) => ({ ...v, path: f.path ?? f.name })));
    const target = findings.find((v) => v.fingerprint);
    if (!target) {
      console.error(`  nothing to explain — the scan reported ${findings.length} findings`);
      process.exit(1);
    }
    console.log(
      `  scanned     ${findings.length} findings; asking about ${target.ruleId ?? target.type} ` +
        `at ${target.path}:${target.line}`,
    );

    const started = performance.now();
    const res = await fetch(`${base}/api/explain-finding`, {
      headers,
      method: "POST",
      body: JSON.stringify({ analysisId: id, fingerprint: target.fingerprint, lang: "en" }),
    });
    const out = await res.json();
    console.log(`  after ${Math.round(performance.now() - started)} ms  HTTP ${res.status}`);
    if (!out.ok) {
      console.error(`  the route could not get an answer: ${JSON.stringify(out).slice(0, 200)}`);
      code = 2;
    } else {
      console.log(`    ${String(out.text).replace(/\n+/g, "\n    ").slice(0, 700)}`);
    }

    const bogus = await fetch(`${base}/api/explain-finding`, {
      headers,
      method: "POST",
      body: JSON.stringify({ analysisId: id, fingerprint: "not-a-fingerprint" }),
    });
    console.log(`  a fingerprint this scan does not hold → HTTP ${bogus.status}, 404 expected`);
    if (bogus.status !== 404) code = 1;
  } finally {
    child.kill("SIGTERM");
  }
  process.exit(code);
}
