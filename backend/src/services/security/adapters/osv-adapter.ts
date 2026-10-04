import { execFile } from "child_process";
import { promisify } from "util";
import { access } from "fs/promises";
import path from "path";
import pino from "pino";
import type { SecurityIssue } from "../../../models/index.js";
import { relativeToClone } from "../adapter.js";
import type { ScannerAdapter } from "../adapter.js";
import { knowledgeFor } from "../finding-knowledge.js";
import { isOffline } from "../network-policy.js";

const execFileAsync = promisify(execFile);

// Minimal-PATH servers can't resolve plain "osv-scanner" — try known prefixes
const OSV_BIN_FALLBACKS = ["/opt/homebrew/bin/osv-scanner", "/usr/local/bin/osv-scanner"];

interface OsvVulnerability {
  id?: string;
  summary?: string;
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string; cwe_ids?: string[] };
}

interface OsvPackage {
  package?: { name?: string; version?: string };
  vulnerabilities?: OsvVulnerability[];
}

interface OsvResult {
  source?: { path?: string; type?: string };
  packages?: OsvPackage[];
}

/** CVSS string → severity bucket, shared with the pip-audit fallback */
function bucketSeverity(sev: string | undefined): { severity: "P0" | "P1" | "P2"; score: number } {
  const s = (sev ?? "").toLowerCase();
  if (s.includes("critical") || s.includes("high")) return { severity: "P0", score: 9 };
  if (s.includes("moderate") || s.includes("medium")) return { severity: "P1", score: 6 };
  return { severity: "P2", score: 3 };
}

function cvssSeverity(vuln: OsvVulnerability): string | undefined {
  // Prefer explicit severity array (CVSS vector), fall back to database_specific
  const score = vuln.severity?.[0]?.score;
  if (score && /^CVSS:3\.[01]\/\S*(C|H|M|L):/.test(score)) {
    const m = score.match(/AV:.*?\/.*?(C|H|M|L):/);
    if (m)
      return { C: "critical", H: "high", M: "medium", L: "low" }[m[1] as "C" | "H" | "M" | "L"];
  }
  return vuln.database_specific?.severity;
}

function toIssue(
  pkgName: string,
  pkgVersion: string | undefined,
  vuln: OsvVulnerability,
  provenance: string,
): SecurityIssue {
  const bucket = bucketSeverity(cvssSeverity(vuln));
  const knowledge = knowledgeFor("VULNERABLE_DEPENDENCY");
  return {
    type: "VULNERABLE_DEPENDENCY",
    severity: bucket.severity,
    score: bucket.score,
    line: 1,
    code: `${pkgName}${pkgVersion ? ` ${pkgVersion}` : ""}`,
    message: `${vuln.id ?? "vulnerability"} in ${pkgName}${vuln.summary ? ` — ${vuln.summary}` : ""}`,
    fix: "Check the advisory for a patched version (open the reference link)",
    provenance,
    ruleId: vuln.id ?? `${provenance}:${pkgName}`,
    explanation: knowledge.explain,
    cwe: vuln.database_specific?.cwe_ids?.[0] ?? knowledge.cwe,
    refUrl: vuln.id ? `https://osv.dev/vulnerability/${vuln.id}` : knowledge.refUrl,
  } as SecurityIssue;
}

/**
 * CVE scanning for every ecosystem — one osv-scanner run covers
 * requirements.txt, pyproject, package-lock, Cargo.lock, go.mod, yarn,
 * pnpm, Gemfile.lock, composer.lock … Falls back to pip-audit for Python
 * requirements when the osv binary is unavailable.
 */
export class OsvAdapter implements ScannerAdapter {
  readonly id = "osv";
  private logger = pino({ name: "osv-adapter" });
  private resolvedBinary: string | null | undefined; // undefined = not probed

  lastBatchExecuted = false;
  /** which tool actually produced the findings ("osv" | "pip-audit" | null) */
  lastRunner: string | null = null;

  async scanFile(_filePath: string, _content: string): Promise<SecurityIssue[]> {
    return []; // batch-only adapter (semgrep pattern)
  }

  private async resolveBinary(): Promise<string | null> {
    if (this.resolvedBinary !== undefined) return this.resolvedBinary;
    for (const candidate of ["osv-scanner", ...OSV_BIN_FALLBACKS]) {
      try {
        await execFileAsync(candidate, ["--version"], { timeout: 8000 });
        this.resolvedBinary = candidate;
        this.logger.info({ binary: candidate }, "osv-scanner found");
        return candidate;
      } catch {
        // next candidate
      }
    }
    this.resolvedBinary = null;
    this.logger.warn("osv-scanner not found — CVEs only via pip-audit/npm fallbacks");
    return null;
  }

  /** Returns per-manifest-file issues (attached to the matching building) */
  /** Whole-repo CVE scan — batch-only, outside the ScannerAdapter interface */
  async scanRepository(clonePath: string): Promise<Map<string, SecurityIssue[]>> {
    this.lastBatchExecuted = false;
    this.lastRunner = null;
    const byFile = new Map<string, SecurityIssue[]>();

    // osv needs at least one recognized lockfile/manifest on disk
    const hasManifest = await this.hasAnyManifest(clonePath);
    if (!hasManifest) return byFile;

    const bin = await this.resolveBinary();
    if (bin) {
      try {
        const { stdout } = await execFileAsync(
          bin,
          ["scan", "-r", clonePath, "--format", "json", "--no-ignore"],
          {
            timeout: parseInt(process.env.OSV_TIMEOUT || "120", 10) * 1000,
            maxBuffer: 20 * 1024 * 1024,
          },
        ).catch((e: unknown) => {
          // osv-scanner exits non-zero when vulns exist — stdout still has JSON
          const err = e as { stdout?: string };
          if (err.stdout) return { stdout: err.stdout } as { stdout: string };
          throw e;
        });
        const parsed = JSON.parse(stdout) as { results?: OsvResult[] };
        for (const result of parsed.results ?? []) {
          const rel = relativeToClone(clonePath, result.source?.path);
          if (!rel) continue;
          for (const pkg of result.packages ?? []) {
            const pkgName = pkg.package?.name ?? "dependency";
            const pkgVersion = pkg.package?.version;
            for (const vuln of pkg.vulnerabilities ?? []) {
              const list = byFile.get(rel) ?? [];
              list.push(toIssue(pkgName, pkgVersion, vuln, "osv"));
              if (list.length > 0) byFile.set(rel, list);
            }
          }
        }
        this.lastBatchExecuted = true;
        this.lastRunner = "osv";
        return byFile;
      } catch (e) {
        this.logger.warn({ e }, "osv-scanner run failed — trying pip-audit fallback");
      }
    }

    /**
     * pip-audit asks pypi.org for every requirement name it is given; the
     * "cached DB" this call used to be commented with is not how it resolves
     * advisories. Offline skips it rather than quietly reaching out.
     */
    const pipIssues = isOffline() ? null : await this.pipAuditFallback(clonePath);
    if (pipIssues) {
      this.lastBatchExecuted = true;
      this.lastRunner = "pip-audit";
      for (const [rel, list] of pipIssues) {
        byFile.set(rel, list);
      }
    }
    return byFile;
  }

  private async hasAnyManifest(clonePath: string): Promise<boolean> {
    const manifests = [
      "requirements.txt",
      "Pipfile.lock",
      "poetry.lock",
      "pyproject.toml",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "Cargo.lock",
      "go.mod",
      "go.sum",
      "Gemfile.lock",
      "composer.lock",
    ];
    for (const m of manifests) {
      try {
        await access(path.join(clonePath, m));
        return true;
      } catch {
        // next
      }
    }
    return false;
  }

  /** pip-audit --format json over requirements.txt (already installed locally) */
  private async pipAuditFallback(clonePath: string): Promise<Map<string, SecurityIssue[]> | null> {
    const req = path.join(clonePath, "requirements.txt");
    try {
      await access(req);
    } catch {
      return null;
    }
    for (const candidate of [
      "pip-audit",
      "/opt/homebrew/bin/pip-audit",
      "/usr/local/bin/pip-audit",
    ]) {
      try {
        const { stdout } = await execFileAsync(
          candidate,
          ["-r", req, "--format", "json", "--no-deps", "--skip-editable"],
          { timeout: 120_000, maxBuffer: 5 * 1024 * 1024 },
        ).catch((e: unknown) => {
          const err = e as { stdout?: string };
          if (err.stdout) return { stdout: err.stdout } as { stdout: string };
          throw e;
        });
        type PipAuditRow = {
          name: string;
          version: string;
          vulns: Array<{
            id: string;
            fix_versions?: string[];
            description?: string;
            aliases?: string[];
          }>;
        };
        const rows = JSON.parse(stdout) as PipAuditRow[];
        const byFile = new Map<string, SecurityIssue[]>();
        const list: SecurityIssue[] = [];
        for (const row of rows) {
          for (const vuln of row.vulns ?? []) {
            const bucket = bucketSeverity(
              vuln.id.toUpperCase().includes("CRITICAL") ? "high" : "medium",
            );
            const knowledge = knowledgeFor("VULNERABLE_DEPENDENCY");
            list.push({
              type: "VULNERABLE_DEPENDENCY",
              severity: bucket.severity,
              score: bucket.score,
              line: 1,
              code: `${row.name} ${row.version}`,
              message: `${vuln.id} in ${row.name}${vuln.description ? ` — ${vuln.description.slice(0, 140)}` : ""}`,
              fix: vuln.fix_versions?.length
                ? `Update ${row.name} to ${vuln.fix_versions.join(" / ")}`
                : "Check the advisory",
              provenance: "pip-audit",
              ruleId: vuln.id,
              explanation: knowledge.explain,
              cwe: knowledge.cwe,
              refUrl: `https://osv.dev/vulnerability/${vuln.aliases?.[0] ?? vuln.id}`,
            } as SecurityIssue);
          }
        }
        if (list.length > 0) byFile.set("requirements.txt", list);
        return byFile;
      } catch {
        // try next candidate
      }
    }
    return null;
  }
}
