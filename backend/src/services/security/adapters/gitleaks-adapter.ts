import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import pino from "pino";
import path from "path";
import type { SecurityIssue } from "../../../models/index.js";
import { relativeToClone } from "../adapter.js";
import type { ScannerAdapter } from "../adapter.js";
import { maskSecretText } from "../redact.js";

const execFileAsync = promisify(execFile);

// Entropy helper — Shannon entropy per string (gitleaks-style fallback)
function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  let entropy = 0;
  for (const ch in freq) {
    const p = freq[ch]! / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isHighEntropySecret(value: string): boolean {
  if (value.length < 8) return false;
  // filter obvious placeholders
  if (/^(example|test|placeholder|changeme|xxx+)$/i.test(value)) return false;
  const e = shannonEntropy(value);
  // >3.5 bits/char + mixed charset indicates real secret
  if (e < 3.5) return false;
  if (/^[a-zA-Z0-9_\-+/=]{8,}$/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value))
    return true;
  if (value.length >= 12 && e > 4.0) return true;
  return false;
}

/**
 * The path a leak arrived with, as the merge wants it: relative to the scanned
 * folder. Both shapes are real — an absolute path from the working-tree pass, a
 * commit-relative one from the history pass.
 */
export function leakPath(clonePath: string, reported: string | undefined): string | undefined {
  if (!reported) return undefined;
  const norm = reported.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!path.isAbsolute(norm)) return norm.length > 0 ? norm : undefined;
  return relativeToClone(clonePath, norm);
}

// Regex for candidate secret values — tightened vs old scanner.ts:26
const CANDIDATE_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?token|aws[_-]?secret|github[_-]?token|private[_-]?key)\s*[:=]\s*['"]([^'"]{8,})['"]/gi;
const GENERIC_KEY_RE =
  /(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[bpas]-[0-9A-Za-z-]{10,})/g;

// When the server process runs with a minimal PATH (sandboxed systemd-like
// environments, launch agents), plain "gitleaks" is not resolvable — try the
// usual install locations before falling back to the entropy heuristic.
const GITLEAKS_BIN_FALLBACKS = ["/opt/homebrew/bin/gitleaks", "/usr/local/bin/gitleaks"];

export class GitleaksAdapter implements ScannerAdapter {
  readonly id = "gitleaks";
  private logger = pino({ name: "gitleaks-adapter" });
  private binaryAvailable: boolean | null = null;
  private resolvedBinary: string | null = null;
  private batchMode = false;

  /** Resolve the gitleaks binary once: PATH first, then common prefixes */
  private async resolveBinary(): Promise<string | null> {
    if (this.resolvedBinary) return this.resolvedBinary;
    for (const candidate of ["gitleaks", ...GITLEAKS_BIN_FALLBACKS]) {
      try {
        await execFileAsync(candidate, ["version"], { timeout: 5000 });
        this.resolvedBinary = candidate;
        this.logger.info({ binary: candidate }, "gitleaks binary found");
        return candidate;
      } catch {
        // try next candidate
      }
    }
    this.logger.warn(
      { PATH: process.env.PATH ?? "" },
      "gitleaks binary not found — entropy fallback only",
    );
    return null;
  }

  /**
   * Batch mode: a whole clone directory is scanned once via scanRepository().
   * Per-file binary spawns would duplicate that work (1 process per file),
   * so scanFile only contributes the cheap regex fallback.
   */
  enableBatchMode(): void {
    this.batchMode = true;
    void this.resolveBinary();
  }

  async scanFile(filePath: string, content: string): Promise<SecurityIssue[]> {
    if (this.batchMode) {
      const bin = await this.resolveBinary();
      if (bin) return []; // covered by batch scan
      return this.fallbackScan(content);
    }
    // Try real gitleaks binary first (if installed or via docker)
    const fromBinary = await this.tryBinary(filePath, content);
    if (fromBinary !== null) return fromBinary;
    // Fallback: entropy-based regex (90% FP reduction vs old regex)
    return this.fallbackScan(content);
  }

  /**
   * Scan an entire clone directory with a SINGLE gitleaks process — the
   * intended usage pattern (startup + rule loading once, not per file).
   * With gitHistory, runs a second pass WITHOUT --no-git so secrets in past
   * commits surface too (requires a full clone, i.e. repo.fullHistory).
   * Returns per-file issues, or null when the binary is unavailable.
   */
  async scanRepository(
    clonePath: string,
    opts?: { gitHistory?: boolean },
  ): Promise<Map<string, SecurityIssue[]> | null> {
    if (this.binaryAvailable === false) return null;
    try {
      const bin = await this.resolveBinary();
      if (!bin) {
        this.binaryAvailable = false;
        return null;
      }
      this.binaryAvailable = true;
      const byFile = new Map<string, SecurityIssue[]>();
      const passes: Array<{ args: string[]; history: boolean }> = [
        {
          args: [
            "detect",
            "--source",
            clonePath,
            "--no-git",
            "--report-format",
            "json",
            "--report-path",
            "-",
            "--no-banner",
          ],
          history: false,
        },
      ];
      if (opts?.gitHistory) {
        passes.push({
          args: [
            "detect",
            "--source",
            clonePath,
            "--report-format",
            "json",
            "--report-path",
            "-",
            "--no-banner",
          ],
          history: true,
        });
      }
      for (const pass of passes) {
        // Per-pass isolation: a history pass needs a git repository and can
        // fail or time out on its own, and that must not throw away the
        // secrets already found in the working tree.
        const { stdout } = await execFileAsync(bin, pass.args, {
          timeout: parseInt(process.env.GITLEAKS_TIMEOUT || "120", 10) * 1000,
          maxBuffer: 50 * 1024 * 1024,
        }).catch((e: unknown) => {
          const err = e as { stdout?: string };
          // gitleaks exits 1 when leaks found, stdout still contains JSON
          if (err.stdout) return { stdout: err.stdout } as { stdout: string };
          this.logger.warn(
            { e, pass: pass.history ? "history" : "working tree" },
            "gitleaks pass failed — continuing with the other pass",
          );
          return { stdout: "" };
        });
        if (!stdout?.trim()) continue;
        const leaks = JSON.parse(stdout) as Array<{
          RuleID: string;
          StartLine: number;
          File: string;
          Commit?: string;
          Secret?: string;
        }>;
        for (const l of leaks) {
          // The two passes name files differently: the working-tree pass reports
          // an absolute path under --source, the history pass reports the path as
          // the commit holds it — repo-relative. Reading only the absolute shape
          // silently dropped EVERY secret that deep's history pass found, which is
          // why the Deep profile scored exactly like Standard on every repo.
          const rel = leakPath(clonePath, l.File);
          if (!rel) continue;
          // history findings can duplicate the working-tree finding on the same line
          const list = byFile.get(rel) ?? [];
          list.push({
            type: "HARDCODED_SECRET",
            severity: "P0",
            score: 10,
            line: l.StartLine ?? 1,
            code: "", // historical findings must never borrow the current source line
            // The matched secret still has to reach the masking boundary: this
            // path is the one that reports real credentials from git history,
            // and a later snippet fill would otherwise carry the raw value.
            secretValue: l.Secret,
            historyCommit: pass.history ? l.Commit : undefined,
            message: `Hardcoded secret detected (${l.RuleID}) — gitleaks${pass.history ? " (in git history)" : ""}`,
            fix: pass.history
              ? "The secret persists in git history — rotate the credential, then rewrite history (git filter-repo)"
              : "Move to environment variable or secrets manager (Vault, AWS Secrets Manager)",
            provenance: pass.history ? "gitleaks-history" : "gitleaks",
            ruleId: l.RuleID,
          } as SecurityIssue);
          byFile.set(rel, list);
        }
      }
      return byFile;
    } catch (e) {
      this.logger.warn({ e }, "gitleaks repository scan failed");
      return null;
    }
  }

  private async tryBinary(filePath: string, content: string): Promise<SecurityIssue[] | null> {
    if (this.binaryAvailable === false) return null;
    let tmpBase: string | null = null;
    try {
      const bin = await this.resolveBinary();
      if (!bin) {
        this.binaryAvailable = false;
        return null;
      }
      this.binaryAvailable = true;
      tmpBase = await mkdtemp(path.join(tmpdir(), "codecity-gitleaks-"));
      const tmpFile = path.join(tmpBase, path.basename(filePath));
      await writeFile(tmpFile, content, { encoding: "utf-8", mode: 0o600 });
      const { stdout } = await execFileAsync(
        bin,
        [
          "detect",
          "--source",
          tmpBase,
          "--no-git",
          "--report-format",
          "json",
          "--report-path",
          "-",
          "--no-banner",
        ],
        {
          timeout: 7000,
          maxBuffer: 5 * 1024 * 1024,
        },
      ).catch((e: unknown) => {
        const err = e as { stdout?: string; code?: number };
        // gitleaks exits 1 when leaks found, stdout still contains JSON
        if (err.stdout) return { stdout: err.stdout } as { stdout: string };
        throw e;
      });
      if (!stdout?.trim()) return [];
      const leaks = JSON.parse(stdout) as Array<{
        RuleID: string;
        Secret?: string;
        StartLine: number;
        File: string;
      }>;
      return leaks.map((l) => ({
        type: "HARDCODED_SECRET",
        severity: "P0" as const,
        score: 10,
        line: l.StartLine ?? 1,
        // Masked before the display clip: a value cut in half is no longer a
        // shape the boundary recognises, and the tail left behind is the secret.
        code: maskSecretText((content.split("\n")[l.StartLine - 1] ?? "").trim(), l.Secret).slice(
          0,
          120,
        ),
        // gitleaks tells us the secret itself; the masking boundary consumes it.
        // Before that this field was parsed and dropped, which is how a token
        // behind an innocuous name (`const pat = "ghp_…"`) left the machine.
        secretValue: l.Secret,
        message: `Hardcoded secret detected (${l.RuleID}) — gitleaks`,
        fix: "Move to environment variable or secrets manager (Vault, AWS Secrets Manager)",
        provenance: "gitleaks",
        ruleId: l.RuleID,
      })) as SecurityIssue[];
    } catch {
      return null;
    } finally {
      if (tmpBase) await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Entropy/keyword fallback without the binary — public because it is the
   * offline half of this adapter's contract, and its masking is judged
   * directly (`secret-redaction.test.ts`) without reaching into the class.
   */
  fallbackScan(content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split("\n");
    let m: RegExpExecArray | null;

    CANDIDATE_RE.lastIndex = 0;
    while ((m = CANDIDATE_RE.exec(content)) !== null) {
      const secretVal = m[1] ?? "";
      if (!isHighEntropySecret(secretVal)) continue;
      // allowlisted placeholders: test/example secrets
      if (
        /example|test|demo|sample|placeholder/i.test(
          content.slice(Math.max(0, m.index - 60), m.index),
        )
      ) {
        // still check entropy — above handles
      }
      const lineNum = content.slice(0, m.index).split("\n").length;
      issues.push({
        type: "HARDCODED_SECRET",
        severity: "P0",
        score: 10,
        line: lineNum,
        code: maskSecretText((lines[lineNum - 1] ?? "").trim(), secretVal).slice(0, 120),
        message: "Hardcoded secret detected — high-entropy credential (gitleaks fallback)",
        fix: "Use environment variables or a secrets manager",
        provenance: "gitleaks-fallback",
        ruleId: "gitleaks:generic-api-key",
      } as SecurityIssue);
    }

    GENERIC_KEY_RE.lastIndex = 0;
    while ((m = GENERIC_KEY_RE.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      // avoid duplicate if already reported on same line
      if (issues.some((i) => i.line === lineNum && i.type === "HARDCODED_SECRET")) continue;
      issues.push({
        type: "HARDCODED_SECRET",
        severity: "P0",
        score: 10,
        line: lineNum,
        code: maskSecretText((lines[lineNum - 1] ?? "").trim(), m[0]).slice(0, 120),
        message: "Hardcoded secret detected — known token pattern (AWS/GitHub/Slack)",
        fix: "Revoke and move to secrets manager",
        provenance: "gitleaks-fallback",
        ruleId: "gitleaks:generic-api-key",
      } as SecurityIssue);
    }

    return issues;
  }
}
