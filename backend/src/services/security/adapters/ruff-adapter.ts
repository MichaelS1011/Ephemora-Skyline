import { execFile } from "child_process";
import { promisify } from "util";
import pino from "pino";
import type { SecurityIssue } from "../../../models/index.js";
import { relativeToClone } from "../adapter.js";
import type { ScannerAdapter } from "../adapter.js";
import { knowledgeFor } from "../finding-knowledge.js";

const execFileAsync = promisify(execFile);

const RUFF_BIN_FALLBACKS = ["/opt/homebrew/bin/ruff", "/usr/local/bin/ruff"];

// ruff rule code → our finding taxonomy. S-rules are the bandit ports.
const RULE_MAP: Record<string, { type: string; severity: "P0" | "P1" | "P2"; score: number }> = {
  S102: { type: "EVAL_USAGE", severity: "P0", score: 10 },
  S608: { type: "SQL_INJECTION", severity: "P0", score: 9 },
  S602: { type: "CMD_INJECTION", severity: "P0", score: 10 },
  S605: { type: "CMD_INJECTION", severity: "P1", score: 7 },
  S607: { type: "CMD_INJECTION", severity: "P2", score: 4 },
  S506: { type: "UNSAFE_DESERIALIZATION", severity: "P1", score: 8 },
  S324: { type: "WEAK_CRYPTO", severity: "P1", score: 6 },
  S101: { type: "QUALITY_ASSERT", severity: "P2", score: 1 },
  F401: { type: "QUALITY_F401", severity: "P2", score: 1 }, // unused import
  F811: { type: "QUALITY_F811", severity: "P2", score: 1 }, // redefined name
  F841: { type: "QUALITY_F841", severity: "P2", score: 1 }, // unused variable
  F821: { type: "QUALITY_F821", severity: "P2", score: 3 }, // undefined name — real bug class
  E711: { type: "QUALITY_E711", severity: "P2", score: 2 }, // comparison to None with ==
  E712: { type: "QUALITY_E712", severity: "P2", score: 2 },
  B006: { type: "QUALITY_B006", severity: "P2", score: 3 }, // mutable default arg
};

function mapRule(code: string): { type: string; severity: "P0" | "P1" | "P2"; score: number } {
  const hit = RULE_MAP[code];
  if (hit) return hit;
  if (code.startsWith("S")) return { type: `SECURITY_${code}`, severity: "P1", score: 6 };
  return { type: `QUALITY_${code}`, severity: "P2", score: 1 };
}

interface RuffDiagnostic {
  code?: string;
  message?: string;
  filename?: string;
  location?: { row?: number };
  url?: string;
}

/**
 * Python quality + security lint via ruff — one binary, sub-2s on 1000
 * files, F/E/B (pyflakes/pycodestyle bugbear) + S (bandit ports).
 */
export class RuffAdapter implements ScannerAdapter {
  readonly id = "ruff";
  private logger = pino({ name: "ruff-adapter" });
  private resolvedBinary: string | null | undefined;

  lastBatchExecuted = false;

  async scanFile(_filePath: string, _content: string): Promise<SecurityIssue[]> {
    return []; // batch-only
  }

  private async resolveBinary(): Promise<string | null> {
    if (this.resolvedBinary !== undefined) return this.resolvedBinary;
    for (const candidate of ["ruff", ...RUFF_BIN_FALLBACKS]) {
      try {
        await execFileAsync(candidate, ["--version"], { timeout: 5000 });
        this.resolvedBinary = candidate;
        this.logger.info({ binary: candidate }, "ruff found");
        return candidate;
      } catch {
        // next
      }
    }
    this.resolvedBinary = null;
    this.logger.warn("ruff not found — Python quality/security lint skipped");
    return null;
  }

  /** Only worth running when Python files are present */
  static async hasPythonFiles(filePaths: string[]): Promise<boolean> {
    return filePaths.some((p) => p.endsWith(".py"));
  }

  /** Whole-repo lint — batch-only, outside the ScannerAdapter interface */
  /**
   * security scope (standard profile): only the bandit-ported S-rules —
   * quality rules (F/B/E) would flood the city with thousands of P2s.
   * S101 (assert) is never selected: assert in tests is idiomatic Python.
   * full scope (deep profile): + pyflakes/bugbear quality rules.
   */
  async scanRepository(
    clonePath: string,
    opts?: { scope?: "security" | "full" },
  ): Promise<Map<string, SecurityIssue[]>> {
    this.lastBatchExecuted = false;
    const byFile = new Map<string, SecurityIssue[]>();
    const bin = await this.resolveBinary();
    if (!bin) return byFile;

    const select = opts?.scope === "full" ? "F,E4,E7,E9,S,B,ASYNC1" : "S,B006,S201,S301";
    const ignore = "S101";
    try {
      const { stdout } = await execFileAsync(
        bin,
        [
          "check",
          clonePath,
          "--output-format",
          "json",
          "--exit-zero",
          "--select",
          select,
          "--ignore",
          ignore,
          "--extend-exclude",
          ".venv,__pycache__,node_modules,dist,build",
        ],
        { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
      );
      if (!stdout.trim()) {
        this.lastBatchExecuted = true;
        return byFile;
      }
      const diagnostics = JSON.parse(stdout) as RuffDiagnostic[];
      for (const d of diagnostics) {
        const rel = relativeToClone(clonePath, d.filename);
        if (!rel) continue; // outside the scan root
        const mapped = mapRule(d.code ?? "UNKNOWN");
        const knowledge = knowledgeFor(mapped.type);
        const list = byFile.get(rel) ?? [];
        list.push({
          type: mapped.type,
          severity: mapped.severity,
          score: mapped.score,
          line: d.location?.row ?? 1,
          code: "",
          message: d.message ?? `${d.code} finding`,
          fix: d.url ? `Details: ${d.url}` : undefined,
          provenance: "ruff",
          ruleId: `ruff:${d.code ?? "UNKNOWN"}`,
          explanation: knowledge.explain,
          refUrl: d.url ?? knowledge.refUrl,
        } as SecurityIssue);
        byFile.set(rel, list);
      }
      this.lastBatchExecuted = true;
    } catch (e) {
      this.logger.warn({ e }, "ruff run failed — Python lint skipped");
    }
    return byFile;
  }
}
