import { execFile } from "child_process";
import { promisify } from "util";
import { access } from "fs/promises";
import path from "path";
import pino from "pino";
import type { SecurityIssue } from "../../../models/index.js";

const execFileAsync = promisify(execFile);

interface NpmAuditAdvisory {
  title?: string;
  url?: string;
  severity?: string;
}

interface NpmAuditVulnerability {
  name: string;
  severity: string;
  range?: string;
  via?: Array<NpmAuditAdvisory | string>;
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

interface NpmAuditReport {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

const SEVERITY_MAP: Record<string, { severity: "P0" | "P1" | "P2"; score: number }> = {
  critical: { severity: "P0", score: 10 },
  high: { severity: "P0", score: 8 },
  moderate: { severity: "P1", score: 6 },
  low: { severity: "P2", score: 3 },
};

/**
 * Dependency scanner — one `npm audit --json` run per repository.
 *
 * Finds known CVEs in the dependency tree (the supply-chain layer the code
 * scanners can't see). Only runs for npm projects with a package-lock.json;
 * returns an empty map (executed: false) for everything else.
 */
export class DependencyAdapter {
  readonly id = "dependency";
  private logger = pino({ name: "dependency-adapter" });

  async scanRepository(
    clonePath: string,
  ): Promise<{ issuesByFile: Map<string, SecurityIssue[]>; executed: boolean }> {
    const issuesByFile = new Map<string, SecurityIssue[]>();

    // npm audit requires a lockfile — without one there is nothing to audit
    try {
      await access(path.join(clonePath, "package-lock.json"));
    } catch {
      return { issuesByFile, executed: false };
    }

    try {
      const { stdout } = await execFileAsync("npm", ["audit", "--json"], {
        cwd: clonePath,
        timeout: parseInt(process.env.NPM_AUDIT_TIMEOUT || "90", 10) * 1000,
        maxBuffer: 20 * 1024 * 1024,
      });
      this.parseAudit(stdout, issuesByFile);
    } catch (e) {
      const err = e as { stdout?: string };
      // npm audit exits non-zero when vulnerabilities exist — stdout still has the JSON
      if (err.stdout) {
        this.parseAudit(err.stdout, issuesByFile);
      } else {
        this.logger.warn({ e }, "npm audit failed — dependency scan unavailable");
        return { issuesByFile, executed: false };
      }
    }
    return { issuesByFile, executed: true };
  }

  private parseAudit(stdout: string, issuesByFile: Map<string, SecurityIssue[]>): void {
    let report: NpmAuditReport;
    try {
      report = JSON.parse(stdout) as NpmAuditReport;
    } catch {
      this.logger.warn("npm audit output was not valid JSON");
      return;
    }
    const issues: SecurityIssue[] = [];
    for (const vuln of Object.values(report.vulnerabilities ?? {})) {
      const mapped = SEVERITY_MAP[vuln.severity] ?? SEVERITY_MAP["low"]!;
      const advisory = (vuln.via ?? []).find(
        (v): v is NpmAuditAdvisory => typeof v === "object" && v !== null,
      );
      const fix =
        typeof vuln.fixAvailable === "object" && vuln.fixAvailable
          ? `Update ${vuln.fixAvailable.name ?? vuln.name} to ${vuln.fixAvailable.version ?? "latest"}`
          : typeof vuln.fixAvailable === "boolean" && vuln.fixAvailable
            ? `Update ${vuln.name} to a patched version`
            : "No direct fix available — check the advisory for workarounds";
      issues.push({
        type: "VULNERABLE_DEPENDENCY",
        severity: mapped.severity,
        score: mapped.score,
        line: 1,
        code: `${vuln.name}${vuln.range ? ` ${vuln.range}` : ""}`,
        message: `${vuln.severity} vulnerability in ${vuln.name}${advisory?.title ? ` — ${advisory.title}` : ""}`,
        fix,
        provenance: "npm-audit",
        ruleId: `npm-audit:${vuln.name}`,
      } as SecurityIssue);
    }
    if (issues.length > 0) {
      // Findings are repo-level: attach them to the lockfile building
      issuesByFile.set("package-lock.json", issues);
      this.logger.info({ count: issues.length }, "npm audit found vulnerable dependencies");
    }
  }
}
