import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  listPacks,
  packById,
  ruleDirsForScan,
  semgrepRuleDirs,
  shippedPacksRoot,
  validatePackIds,
} from "../src/services/security/rule-packs.js";
import { astRulesRequested, resolveConfig } from "../src/services/security/scan-config.js";
import { SemgrepAdapter } from "../src/services/security/adapters/semgrep-adapter.js";
import { SecurityScanner } from "../src/services/security/scanner.js";
import {
  LocalRulesAdapter,
  suppressLocalDuplicates,
} from "../src/services/security/local-rules.js";
import type { SecurityIssue } from "../src/models/index.js";
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

/**
 * #38 — der eigene Regel-Pack muss ohne Fremdprogramm feuern.
 *
 * Die Messung vor diesem Test: `scanner.ts` schaltete die zwolf Regeln des
 * Hauses allein über den Semgrep-Adapter ein. Eine Maschine ohne Semgrep —
 * jeder, der dieses Repo herunterlädt, bevor er irgendetwas installiert —
 * sah deshalb keine einzige der eigenen Regeln; auf einer echten Fixtur
 * deckte nur die Regex-Schicht 3 von 7 erwarteten Zeilen ab, Zeile 7/11/12/14
 * blieben völlig unbedient (Sonde:
 * `.qoder-scratch/skyline-defect-hunter/2026-10-27-auftrag38/red.mts`).
 * Der lokale Kanal ist kein viertes Fremdprogramm: er liest dasselbe YAML
 * und führt es im Prozess aus, über den TypeScript-Parser, der schon
 * Abhängigkeit ist.
 */
describe("der lokale Regelkanal feuert ohne jeden Download (#38)", () => {
  const packDir = semgrepRuleDirs(["ephemora-core"])[0] ?? "";

  /** Zeilen aus NODE_FIXTURE (Zeile 1 ist die leere erste Zeile des Templates). */
  const EXPECTED: { rule: string; lines: number[]; severity: "P0" | "P1" }[] = [
    { rule: "ephemora-node-command-injection", lines: [6, 7, 8], severity: "P0" },
    { rule: "ephemora-node-eval-of-dynamic-code", lines: [9], severity: "P0" },
    { rule: "ephemora-node-weak-hash", lines: [11], severity: "P1" },
    { rule: "ephemora-node-world-writable-file", lines: [12], severity: "P1" },
    { rule: "ephemora-node-tls-verification-disabled", lines: [14], severity: "P0" },
  ];

  const localAdapter = () => {
    const adapter = new LocalRulesAdapter();
    adapter.setRuleDirs([packDir], ["ephemora-core"]);
    return adapter;
  };

  it("kompiliert die 5 JS-Regeln und lehnt die 7 Python-Regeln mit Grund ab", () => {
    const st = localAdapter().status();
    expect(st).toHaveLength(12);
    expect(
      st
        .filter((s) => s.local)
        .map((s) => s.id)
        .sort(),
    ).toEqual([
      "ephemora-node-command-injection",
      "ephemora-node-eval-of-dynamic-code",
      "ephemora-node-tls-verification-disabled",
      "ephemora-node-weak-hash",
      "ephemora-node-world-writable-file",
    ]);
    for (const rejected of st.filter((s) => !s.local)) {
      expect(rejected.id).toMatch(/^ephemora-python-/);
      expect(rejected.reason).toContain("kein Parser");
    }
    expect(localAdapter().runnableRules()).toBe(5);
  });

  it("meldet 7 Befunde auf den Positivbeispielen — die Negativbeispiele bleiben still", async () => {
    const adapter = localAdapter();
    const issues = ((await adapter.scanFile("bad.ts", NODE_FIXTURE)) as SecurityIssue[]).sort(
      (a, b) => a.line - b.line,
    );
    const byRule = new Map<string, number[]>();
    for (const i of issues) {
      byRule.set(i.ruleId ?? "?", [...(byRule.get(i.ruleId ?? "?") ?? []), i.line]);
    }
    for (const e of EXPECTED) {
      expect(byRule.get(e.rule), e.rule).toEqual(e.lines);
      for (const i of issues.filter((x) => x.ruleId === e.rule)) {
        expect(i.severity).toBe(e.severity);
        expect(i.provenance).toBe("local-rules");
      }
    }
    // exakt sieben Befunde: eval("1+1") (Z. 10) und chmodSync(…, 0o644) (Z. 13) feuern nicht
    expect(issues.map((i) => i.line)).toEqual([6, 7, 8, 9, 11, 12, 14]);
    expect(issues.filter((i) => i.line === 10 || i.line === 13)).toEqual([]);
    expect(issues.find((i) => i.ruleId === "ephemora-node-command-injection")!.cwe).toMatch(
      /^CWE-78/,
    );
    expect(adapter.filesScanned()).toBe(1);
  });

  it("bedient die Hausregeln auch ohne Engine — und nennt den Kanal ehrlich", async () => {
    const scanner = new SecurityScanner(undefined, undefined, { semgrep: null, gitleaks: null });
    // leerer Pack-Auswahl-Wort: der gelieferte Default-Pack wird gelesen
    expect(scanner.localRuleChannel().dirs.length).toBe(1);
    expect(scanner.localRuleChannel().rules).toBe(5);
    const issues = await scanner.scanFile("bad.ts", NODE_FIXTURE);
    // die vier Zeilen, die die HEAD-Messung völlig unbedient ließ (7, 11, 12, 14)
    for (const line of [7, 11, 12, 14]) {
      const hits = issues.filter(
        (i) => i.line === line && (i.provenance === "local-rules" || i.provenance === "semgrep"),
      );
      expect(hits.length, `Zeile ${line}`).toBeGreaterThan(0);
    }
    // kein Befund des lokalen Kanals gibt sich als semgrep-Lauf aus
    for (const i of issues.filter((x) => x.provenance === "local-rules")) {
      expect(i.ruleId).toMatch(/^ephemora-node-/);
    }
    expect(issues.some((i) => i.provenance === "semgrep")).toBe(false);
    expect(scanner.localRuleChannel().ran).toBe(true);
  });

  it("liefert offline dieselben Befunde wie online — der lokale Kanal holt nichts", async () => {
    const res = resolveConfig({ rulePacks: ["ephemora-core"] });
    expect(res.errors).toEqual([]);
    const scannerOnline = new SecurityScanner(undefined, res.config, {
      semgrep: null,
      gitleaks: null,
    });
    const online = await scannerOnline.scanFile("bad.ts", NODE_FIXTURE);
    const prev = process.env.SKYLINE_OFFLINE;
    process.env.SKYLINE_OFFLINE = "1";
    try {
      const offlineRes = resolveConfig({ rulePacks: ["ephemora-core"] });
      // offline darf ein Kanal, der nur die Platte liest, nicht abgeschaltet sein
      expect(offlineRes.config.tools.semgrep).toBe(true);
      expect(astRulesRequested(offlineRes.config)).toBe(true);
      const scanner = new SecurityScanner(undefined, offlineRes.config, {
        semgrep: null,
        gitleaks: null,
      });
      expect(scanner.localRuleChannel().dirs).toEqual([packDir]);
      const offline = await scanner.scanFile("bad.ts", NODE_FIXTURE);
      const key = (list: SecurityIssue[]) =>
        list.map((i) => `${i.line}|${i.type}|${i.severity}|${i.provenance}`).sort();
      expect(key(offline)).toEqual(key(online));
      // und der Matcher selbst liefert unbeordnet dieselben sieben Befunde
      const matcher = (await localAdapter().scanFile("bad.ts", NODE_FIXTURE)) as SecurityIssue[];
      expect(matcher.map((i) => i.line).sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 11, 12, 14]);
    } finally {
      if (prev === undefined) delete process.env.SKYLINE_OFFLINE;
      else process.env.SKYLINE_OFFLINE = prev;
    }
    // und das Quick-Profil, das "no AST scan" verspricht, schaltet auch ihn ab
    expect(astRulesRequested(resolveConfig({ profile: "quick" }).config)).toBe(false);
  });

  it("ergeduppt Kanal-Dubletten an einer Zeile: wo die Engine sprach, gewinnt sie", () => {
    const local: SecurityIssue = {
      type: "CMD_INJECTION",
      severity: "P0",
      score: 10,
      line: 6,
      code: 'exec("ls " + user, () => {});',
      message: "m",
      provenance: "local-rules",
      ruleId: "ephemora-node-command-injection",
    };
    const other: SecurityIssue = { ...local, line: 7 };
    const engine: SecurityIssue = {
      ...local,
      ruleId: "backend.rules.ephemora-core.node.yaml.ephemora-node-command-injection",
      provenance: "semgrep",
    };
    // gleiche Linie, gleicher Typ → der lokale Befund weicht der Engine
    expect(suppressLocalDuplicates([local, other], [engine])).toEqual([other]);
    // Engine-Befunde werden von dieser Regel niemals weggenommen
    expect(suppressLocalDuplicates([engine], [local])).toEqual([engine]);
    // andere Linie bleibt stehen, gleicher type ohne ruleId reicht als Schlüssel
    const engineNoId: SecurityIssue = { ...engine, ruleId: undefined };
    expect(suppressLocalDuplicates([local, other], [engineNoId])).toEqual([other]);
  });

  it.skipIf(!SEMGREP_BIN)(
    "End-zu-End: mit echter Engine erscheint keine Zeile zweimal",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "codecity-dedup38-"));
      await writeFile(path.join(dir, "bad.ts"), NODE_FIXTURE, "utf-8");
      const res = resolveConfig({ rulePacks: ["ephemora-core"] });
      const scanner = new SecurityScanner(undefined, res.config);
      // der Scan liest genau die Ordner, die die Pack-Auswahl ihm nennt
      expect(scanner.localRuleChannel().dirs).toEqual(ruleDirsForScan(["ephemora-core"]));
      // pro Datei zuerst der Per-File-Lauf (Regex + lokale Regeln), dann der
      // echte Semgrep-Batch, wie der Orchestrator ihn fährt
      const perFile = await scanner.scanFile("bad.ts", NODE_FIXTURE);
      const fa = {
        path: "bad.ts",
        language: "TypeScript",
        lines: { total: 16, code: 14, comments: 0, blank: 2 },
        complexity: { cyclomatic: 1 },
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        vulnerabilities: perFile,
        content: NODE_FIXTURE,
      };
      await scanner.scanRepositoryBatch(dir, [fa]);
      const keys = fa.vulnerabilities.map((i) => `${i.line}|${i.type}`);
      expect(new Set(keys).size).toBe(keys.length);
      // jede Positivzeile ist genau einmal mit ihrem Regeltyp bedient —
      // gleichgültig welcher Kanal sie trug (regex beansprucht Zeile+Typ vor
      // Engine und lokalem Kanal, das ist Hausordnung seit #41)
      const lineTypes: Record<number, string> = {
        6: "CMD_INJECTION",
        7: "CMD_INJECTION",
        8: "CMD_INJECTION",
        9: "EVAL_USAGE",
        11: "EPHEMORA_NODE_WEAK_HASH",
        12: "EPHEMORA_NODE_WORLD_WRITABLE_FILE",
        14: "EPHEMORA_NODE_TLS_VERIFICATION_DISABLED",
      };
      for (const [line, type] of Object.entries(lineTypes)) {
        const hits = fa.vulnerabilities.filter((i) => i.line === Number(line) && i.type === type);
        expect(hits, `Zeile ${line} Typ ${type}`).toHaveLength(1);
      }
      // die Negativbeispiele feuern auf keinem Kanal
      expect(fa.vulnerabilities.filter((i) => i.line === 13)).toEqual([]);
      // wo semgrep eine Regelzeile meldete, steht kein zweiter Kanal mehr darauf
      for (const line of [6, 7, 8, 9, 11, 12, 14]) {
        const engineHere = fa.vulnerabilities.filter(
          (i) => i.line === line && i.provenance === "semgrep",
        );
        if (engineHere.length > 0) {
          const localSame = fa.vulnerabilities.filter(
            (i) => i.line === line && i.provenance === "local-rules",
          );
          for (const l of localSame) {
            expect(
              engineHere.some((e) => e.type === l.type),
              `Zeile ${line}: ${l.type}`,
            ).toBe(false);
          }
        }
      }
    },
    SEMGREP_RUN_BUDGET_MS,
  );
});
