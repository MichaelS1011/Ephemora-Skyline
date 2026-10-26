import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  listPacks,
  packById,
  semgrepRuleDirs,
  shippedPacksRoot,
  validatePackIds,
} from "../src/services/security/rule-packs.js";
import { resolveConfig } from "../src/services/security/scan-config.js";
import { SemgrepAdapter } from "../src/services/security/adapters/semgrep-adapter.js";
import { categoryOf } from "../src/services/security/categories.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { SEMGREP_RUN_BUDGET_MS, SEMGREP_CONCURRENT_BUDGET_MS } from "./helpers/budgets.js";

/**
 * #41 — Regel-Packs.
 *
 * Der Aufhänger ist eine Lizenz, keine Zahl: `semgrep --config p/security-audit`
 * lädt seine Regeln während des Scans von semgrep.dev — wie viele an welchem Tag,
 * das beantwortet die Registry, kein Artefakt in diesem Baum —, und die Semgrep Rules License v1.0
 * sagt dazu: "This license does not allow you to distribute the rules, or to
 * make them available to others as a service." Ein Bundling dieser Packs ins
 * Programm wäre also kein Formeldetail, sondern ein Verstoß. Gebündelt wird
 * deshalb nur, wessen Regeln wir selbst geschrieben haben — und der Nachweis
 * unten läuft mit gekapptem Netz, damit "lokal" nicht nur im Text steht.
 *
 * Deliberately real semgrep, and on the short list of files that must not move to
 * `tests/helpers/scanners.ts`: which rules a pack contributes is a question only the
 * engine answers. A stub can restate a config string, it cannot show that `semgrep
 * --rule-dirs <pack>` reads the pack's yaml and finds the pattern in a file. That is
 * why this file probes the binary, carries `SEMGREP_RUN_BUDGET_MS` /
 * `SEMGREP_CONCURRENT_BUDGET_MS` budgets and pays for a real run — the load here
 * is the subject, not a side effect.
 */

/**
 * "Is semgrep installed" is a question about a file, not about how fast a cold
 * Python CLI prints its version. Measured on this machine: `semgrep --version`
 * answered in 11–104 s while the frontend built beside it, so the old 8-second
 * probe said "not installed" three times over and the suite went out green with
 * its three deep-scan cases skipped. Absence is now read off `which`, and a
 * present binary always runs the assertions — the per-test timeouts below
 * (`SEMGREP_RUN_BUDGET_MS` / `SEMGREP_CONCURRENT_BUDGET_MS`) are what a slow
 * engine needs.
 */
function locateSemgrep(): string | null {
  for (const candidate of ["semgrep", "/opt/homebrew/bin/semgrep", "/usr/local/bin/semgrep"]) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    try {
      const found = execFileSync("/usr/bin/which", [candidate], {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (found) return found;
    } catch {
      /* not on PATH — the next candidate is an absolute path */
    }
  }
  return null;
}

const SEMGREP_BIN = locateSemgrep();

const NODE_FIXTURE = `
import { exec, execSync, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
export function run(user: string) {
  exec("ls " + user, () => {});
  execSync(\`git log \${user}\`);
  spawn("sh", ["-c", user], { shell: true });
  eval(user);
  eval("1+1");
  const h = crypto.createHash("md5").update(user);
  fs.chmodSync("/srv/app.conf", 0o777);
  fs.chmodSync("/srv/app.conf", 0o644);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return h.digest("hex");
}
`;

const PYTHON_FIXTURE = `
import os, subprocess, hashlib, requests
def run(user, cur):
    os.system("ls " + user)
    os.system("ls")
    subprocess.run(["ls", "-l"], check=False)
    subprocess.call("echo " + user, shell=True)
    cur.execute(f"SELECT * FROM t WHERE id = {user}")
    cur.execute("SELECT 1")
    requests.get("https://x", verify=False)
    hashlib.md5(b"a")
    os.chmod("/srv/f", 0o777)
`;

describe("Regel-Pack ephemora-core (#41)", () => {
  it("ist gelistet, mit Herkunft, Lizenz und echter Regelzahl", () => {
    const pack = packById("ephemora-core");
    expect(pack, `Pack-Wurzel: ${shippedPacksRoot()}`).toBeTruthy();
    expect(pack!.origin).toBe("shipped");
    expect(pack!.ruleCount).toBe(12);
    // Die Lizenz ist der Grund, warum dieses Pack im Repo liegen darf
    expect(pack!.license).toContain("Apache-2.0");
    expect(pack!.source).toContain("Eigenentwicklung");
    expect(pack!.categories).toEqual(
      expect.arrayContaining(["injection", "crypto", "transport", "permissions"]),
    );
    expect(listPacks().map((p) => p.id)).toContain("ephemora-core");
  });

  it("wirft ein Pack weg, dessen Manifest über der Regelzahl lügt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codecity-packs-"));
    const dir = path.join(root, "bluffer");
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "pack.json"),
      JSON.stringify({ id: "bluffer", name: "x", ruleCount: 9, license: "MIT", source: "x" }),
    );
    writeFileSync(path.join(dir, "one.yaml"), "rules:\n  - id: only-one\n    message: m\n");
    const before = process.env.CODECITY_RULES_DIR;
    process.env.CODECITY_RULES_DIR = root;
    try {
      expect(listPacks().map((p) => p.id)).toEqual([]);
      // dasselbe Manifest mit richtiger Zahl wird angenommen
      writeFileSync(
        path.join(dir, "pack.json"),
        JSON.stringify({ id: "bluffer", name: "x", ruleCount: 1, license: "MIT", source: "x" }),
      );
      expect(listPacks().map((p) => p.id)).toEqual(["bluffer"]);
    } finally {
      if (before === undefined) delete process.env.CODECITY_RULES_DIR;
      else process.env.CODECITY_RULES_DIR = before;
    }
  });

  it("kennt nur Packs, die es gibt — und niemals einen Pfad", () => {
    const errors: string[] = [];
    expect(validatePackIds(["ephemora-core", "ephemora-core"], errors)).toEqual(["ephemora-core"]);
    expect(errors).toEqual([]);
    expect(validatePackIds(["../../etc"], errors)).toEqual([]);
    expect(errors.at(-1)).toContain("invalid pack id");
    expect(validatePackIds(["p/security-audit"], errors)).toEqual([]);
    expect(errors.at(-1)).toContain("invalid pack id");
    expect(validatePackIds("p/security-audit", errors)).toEqual([]);
    expect(errors.at(-1)).toContain("expected an array");
    expect(validatePackIds(["ganz-anders"], errors)).toEqual([]);
    expect(errors.at(-1)).toContain("unknown pack");
  });

  it("lässt den Deep-Scan zu, wenn die Regeln lokal liegen — und nur dann", () => {
    const withPack = resolveConfig({ rulePacks: ["ephemora-core"] });
    expect(withPack.errors).toEqual([]);
    expect(withPack.config.rulePacks).toEqual(["ephemora-core"]);
    expect(semgrepRuleDirs(withPack.config.rulePacks)[0]).toContain("ephemora-core");

    // Offline ohne Pack: semgrep würde seine Regeln von semgrep.dev ziehen
    process.env.SKYLINE_OFFLINE = "1";
    try {
      expect(resolveConfig().config.tools.semgrep).toBe(false);
      // Offline mit lokalem Pack: nichts zu holen, also darf der Engine laufen
      expect(resolveConfig({ rulePacks: ["ephemora-core"] }).config.tools.semgrep).toBe(true);
      expect(resolveConfig({ rulePacks: ["ephemora-core"] }).config.tools.osv).toBe(false);
    } finally {
      delete process.env.SKYLINE_OFFLINE;
    }
  });

  it("lehnt einen Scan mit unbekanntem Pack ab, statt still enger zu scannen", () => {
    const res = resolveConfig({ rulePacks: ["nonexistent-pack"] });
    expect(res.errors.join(" ")).toContain("unknown pack");
    expect(res.config.rulePacks).toEqual([]);
  });
});

describe("der Scan läuft ohne Netz gegen das lokale Pack", () => {
  let fixtureDir = "";
  let packDir = "";

  beforeAll(async () => {
    fixtureDir = await mkdtemp(path.join(tmpdir(), "codecity-packfix-"));
    await writeFile(path.join(fixtureDir, "bad.ts"), NODE_FIXTURE, "utf-8");
    await writeFile(path.join(fixtureDir, "bad.py"), PYTHON_FIXTURE, "utf-8");
    packDir = semgrepRuleDirs(["ephemora-core"])[0] ?? "";
  });

  // Two full-suite runs of this file under load (turbo builds the frontend at
  // the same time) took the adapter's 120s semgrep timeout and came back short.
  // The fix is time, not a softer assertion: a missing rule is still a failure.
  const prevTimeout = process.env.SEMGREP_TIMEOUT;
  beforeAll(() => {
    process.env.SEMGREP_TIMEOUT = "300";
  });
  afterAll(() => {
    if (prevTimeout === undefined) delete process.env.SEMGREP_TIMEOUT;
    else process.env.SEMGREP_TIMEOUT = prevTimeout;
  });

  const runWith = async (proxy: string | null) => {
    const adapter = new SemgrepAdapter();
    adapter.setRuleDirs([packDir]);
    if (proxy) {
      process.env.HTTPS_PROXY = proxy;
      process.env.HTTP_PROXY = proxy;
    }
    try {
      const issues = await adapter.scanBatch(fixtureDir);
      return issues.map((i) => (i.ruleId ?? "").split(".").pop() ?? "").sort();
    } finally {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
    }
  };

  it.skipIf(!SEMGREP_BIN)(
    "findet jede Regelart und liefert mit gekapptem Netz dieselbe Zahl",
    async () => {
      const normal = await runWith(null);
      // Port 9 (discard) — jede ausgehende Anfrage scheitert sofort
      const blackout = await runWith("http://127.0.0.1:9");
      expect(blackout).toEqual(normal);
      expect(normal.length).toBeGreaterThanOrEqual(11);
      for (const id of [
        "ephemora-node-command-injection",
        "ephemora-node-eval-of-dynamic-code",
        "ephemora-node-weak-hash",
        "ephemora-node-world-writable-file",
        "ephemora-node-tls-verification-disabled",
        "ephemora-python-command-injection",
        "ephemora-python-shell-true",
        "ephemora-python-sql-injection",
        "ephemora-python-tls-verification-disabled",
        "ephemora-python-weak-hash",
        "ephemora-python-world-writable-file",
      ]) {
        expect(normal.filter((x) => x === id).length, id).toBeGreaterThan(0);
      }
      // Die Negativbeispiele dürfen nicht schlagen
      expect(normal.filter((x) => x === "ephemora-node-command-injection").length).toBe(3);
    },
    SEMGREP_RUN_BUDGET_MS,
  );

  it.skipIf(!SEMGREP_BIN)(
    "zwei Läufe gleichzeitig verlieren keine Funde — der SARIF-Pfad ist pro Lauf einzigartig",
    async () => {
      // Vor dem Fix hieß die Ausgabedatei `codecity-semgrep-<Date.now()>.sarif`;
      // zwei gleichzeitig gestartete Läufe trafen dieselbe Millisekunde und der
      // schnellere löschte den Bericht des langsameren. Zwei Läufe reichen als
      // Nachweis — mehr davon würden die übrige Suite aus dem Zeitfenster heben.
      const runs = await Promise.all(
        Array.from({ length: 2 }, async () => {
          const adapter = new SemgrepAdapter();
          adapter.setRuleDirs([packDir]);
          return adapter.scanBatch(fixtureDir);
        }),
      );
      const counts = runs.map((r) => r.length);
      expect(Math.min(...counts)).toBe(Math.max(...counts));
      expect(counts[0]).toBeGreaterThanOrEqual(11);
    },
    SEMGREP_CONCURRENT_BUDGET_MS,
  );

  it.skipIf(!SEMGREP_BIN)(
    "trägt die Funde in die Kategorienachse ein, weil die CWE stimmt",
    async () => {
      const adapter = new SemgrepAdapter();
      adapter.setRuleDirs([packDir]);
      const issues = await adapter.scanBatch(fixtureDir);
      const categories = new Set(issues.map((i) => categoryOf(i.type, i.cwe)));
      expect(categories.has("injection")).toBe(true);
      expect(categories.has("crypto")).toBe(true);
      expect(categories.has("transport")).toBe(true);
      expect(categories.has("permissions")).toBe(true);
      // Die CWE kommt aus der Regel selbst, nicht aus einer Namensheuristik
      const byRule = new Map(issues.map((i) => [i.ruleId?.split(".").pop(), i.cwe]));
      expect(byRule.get("ephemora-node-command-injection")).toMatch(/^CWE-78/);
      expect(byRule.get("ephemora-python-sql-injection")).toMatch(/^CWE-89/);
    },
    SEMGREP_RUN_BUDGET_MS,
  );
});
