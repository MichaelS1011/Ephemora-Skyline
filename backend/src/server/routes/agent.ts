/**
 * agent — the two ends of a coding agent's loop.
 *
 * GET  /api/result/:id/handoff        → newline-delimited JSON, one finding per
 *                                       line, byte-stable fingerprint as the key.
 * POST /api/verify {before, after, fingerprints?}
 *                                      → of the findings in `before`: still
 *                                       present, gone, or present somewhere else.
 *
 * Both read the RAM store only. Nothing here touches the disk, opens a folder or
 * runs anything: an agent gets evidence and a way to check its own work, and the
 * verdict about the code stays with the human who picked the folder.
 */

import type { Request, Response } from "express";
import type { AnalysisResult, OwaspBucket } from "../../models/index.js";
import { findingFingerprint } from "../../services/security/finding-identity.js";

/** Structural subset of the analysis store the handlers need */
type ResultStore = {
  get(id: string): AnalysisResult | undefined;
};

interface HandoffLine {
  schema: "ephemora.finding.v1";
  analysisId: string;
  fingerprint: string;
  path: string;
  line: number;
  type: string;
  ruleId: string;
  severity: string;
  provenance: string;
  cwe?: string;
  /** OWASP Top 10 (2021) bucket, present whenever the finding carries one */
  owasp?: OwaspBucket;
  refUrl?: string;
  explanation?: string;
  fix?: string;
  assessment: string;
}

/** One finding per line, ordered by file then line so two runs produce the same bytes. */
export function buildHandoffLines(result: AnalysisResult): HandoffLine[] {
  const lines: HandoffLine[] = [];
  for (const file of [...result.files].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const v of [...file.vulnerabilities].sort((a, b) => a.line - b.line)) {
      const ruleId = (v as unknown as { ruleId?: string }).ruleId ?? v.type;
      lines.push({
        schema: "ephemora.finding.v1",
        analysisId: result.id,
        fingerprint: findingFingerprint({
          path: file.path,
          type: v.type,
          ruleId,
          line: v.line,
          code: v.code,
          provenance: v.provenance,
          historyCommit: v.historyCommit,
        }),
        path: file.path,
        line: v.line,
        type: v.type,
        ruleId,
        severity: v.severity,
        provenance: v.provenance ?? "unknown",
        ...(v.cwe ? { cwe: v.cwe } : {}),
        ...(v.owasp ? { owasp: v.owasp } : {}),
        ...(v.refUrl ? { refUrl: v.refUrl } : {}),
        ...(v.explanation ? { explanation: v.explanation } : {}),
        ...(v.fix ? { fix: v.fix } : {}),
        // The sentence that keeps a scanner hit from being read as a proven
        // vulnerability — the panel says it, so the machine channel says it too.
        assessment: "Scanner finding requiring verification; not a confirmed vulnerability.",
      });
    }
  }
  return lines;
}

export function handleHandoff(req: Request, res: Response, store: ResultStore): void {
  const result = store.get(typeof req.params.id === "string" ? req.params.id : "");
  if (!result) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const body = buildHandoffLines(result)
    .map((l) => JSON.stringify(l))
    .join("\n");
  res.type("application/x-ndjson").send(body.length > 0 ? `${body}\n` : body);
}

interface FingerprintHit {
  fingerprint: string;
  path: string;
  line: number;
  type: string;
  ruleId: string;
  severity: string;
}

/** Every finding of a result, keyed by the same fingerprint the UI and SARIF use. */
export function fingerprintIndex(result: AnalysisResult): Map<string, FingerprintHit[]> {
  const index = new Map<string, FingerprintHit[]>();
  for (const file of result.files) {
    for (const v of file.vulnerabilities) {
      const ruleId = (v as unknown as { ruleId?: string }).ruleId ?? v.type;
      const fingerprint = findingFingerprint({
        path: file.path,
        type: v.type,
        ruleId,
        line: v.line,
        code: v.code,
        provenance: v.provenance,
        historyCommit: v.historyCommit,
      });
      const hits = index.get(fingerprint) ?? [];
      hits.push({
        fingerprint,
        path: file.path,
        line: v.line,
        type: v.type,
        ruleId,
        severity: v.severity,
      });
      index.set(fingerprint, hits);
    }
  }
  return index;
}

export type ComparabilityReason =
  | "different-project"
  | "different-engines"
  | "different-dependency-runner"
  | "live-delta"
  | "preview-sample";

export interface Comparability {
  ok: boolean;
  reasons: ComparabilityReason[];
}

export interface VerifyReport {
  before: string;
  after: string;
  checked: number;
  present: FingerprintHit[];
  gone: FingerprintHit[];
  /** Same rule in the same file at another line: not a fix to celebrate */
  moved: Array<{ from: FingerprintHit; to: FingerprintHit }>;
  /** Findings only the later scan holds — never possible before this field existed */
  newFindings: FingerprintHit[];
  newBySeverity: { P0: number; P1: number; P2: number };
  /**
   * Whether the two scans can be read against each other at all. Counts remain
   * in the report for a caller that wants to inspect them, but a different
   * project, engine set, dependency runner, live delta or preview sample means
   * the difference may be the scan, not the code.
   */
  comparable: Comparability;
  /** Fingerprints the caller asked for that `before` never contained */
  unknown: string[];
}

const FINDING_ENGINES = [
  "regex",
  "gitleaks",
  "semgrep",
  "localRules",
  "dependencies",
  "osv",
  "ruff",
] as const;

function enginesOf(provenance: AnalysisResult["summary"]["scanProvenance"]): string[] {
  if (!provenance) return [];
  return FINDING_ENGINES.filter((engine) => provenance[engine] === true).map(String);
}

/**
 * Why two results may not be comparable.
 *
 * A scan difference can look exactly like a code change: turning on semgrep
 * adds findings, a sampled preview leaves files unopened, and a live delta
 * carries some engines forward from an earlier state. None of those is a
 * reason to hide the numbers from an agent, but none may be presented to a
 * person as "what changed in your code" either.
 */
export function comparabilityOf(before: AnalysisResult, after: AnalysisResult): Comparability {
  const reasons: ComparabilityReason[] = [];
  const beforeRepo = before.repo;
  const afterRepo = after.repo;
  if (
    (beforeRepo?.owner ?? "") !== (afterRepo?.owner ?? "") ||
    (beforeRepo?.name ?? "") !== (afterRepo?.name ?? "")
  ) {
    reasons.push("different-project");
  }

  const beforeProvenance = before.summary?.scanProvenance;
  const afterProvenance = after.summary?.scanProvenance;
  if ((before.summary?.dropped?.preview ?? 0) > 0 || (after.summary?.dropped?.preview ?? 0) > 0) {
    reasons.push("preview-sample");
  }
  if (beforeProvenance?.live || afterProvenance?.live) reasons.push("live-delta");

  const beforeEngines = enginesOf(beforeProvenance);
  const afterEngines = enginesOf(afterProvenance);
  if (beforeEngines.join("\u0000") !== afterEngines.join("\u0000")) {
    reasons.push("different-engines");
  }
  if (
    (beforeProvenance?.dependencyRunner ?? null) !== (afterProvenance?.dependencyRunner ?? null)
  ) {
    reasons.push("different-dependency-runner");
  }

  return { ok: reasons.length === 0, reasons };
}

function compareHits(a: FingerprintHit, b: FingerprintHit): number {
  return (
    a.path.localeCompare(b.path) ||
    a.line - b.line ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fingerprint.localeCompare(b.fingerprint)
  );
}

function ruleKey(hit: FingerprintHit): string {
  return `${hit.path}\u0000${hit.ruleId}`;
}

/**
 * Compare two scans by fingerprint.
 *
 * A vanished fingerprint is not proof of a fix — the line may have moved, the
 * file may have been renamed, or the finding may have been silenced. Those cases
 * are separated here instead of being reported as `gone`, because an agent that
 * believes a false "fixed" is worse than one that got nothing.
 *
 * The comparison is one-to-one: a moved pair consumes both its before and its
 * after hit, so two findings cannot share one target and a hit cannot appear in
 * `moved` and `newFindings` at once. Duplicate fingerprints are counted as a
 * multiset rather than collapsed by the index.
 */
export function compareScans(
  before: AnalysisResult,
  after: AnalysisResult,
  wanted?: string[],
): VerifyReport {
  const beforeIndex = fingerprintIndex(before);
  const afterIndex = fingerprintIndex(after);
  const presentByFingerprint = new Map<string, FingerprintHit[]>();
  const beforeSurplus: FingerprintHit[] = [];
  const afterSurplus: FingerprintHit[] = [];

  for (const [fingerprint, hits] of beforeIndex) {
    const later = afterIndex.get(fingerprint) ?? [];
    const paired = Math.min(hits.length, later.length);
    if (paired > 0) presentByFingerprint.set(fingerprint, hits.slice(0, paired));
    beforeSurplus.push(...hits.slice(paired));
  }
  for (const [fingerprint, hits] of afterIndex) {
    const earlier = beforeIndex.get(fingerprint);
    afterSurplus.push(...hits.slice(earlier?.length ?? 0));
  }

  const beforeByRule = new Map<string, FingerprintHit[]>();
  const afterByRule = new Map<string, FingerprintHit[]>();
  for (const hit of beforeSurplus) {
    const key = ruleKey(hit);
    const list = beforeByRule.get(key) ?? [];
    list.push(hit);
    beforeByRule.set(key, list);
  }
  for (const hit of afterSurplus) {
    const key = ruleKey(hit);
    const list = afterByRule.get(key) ?? [];
    list.push(hit);
    afterByRule.set(key, list);
  }

  const usedFrom = new Set<FingerprintHit>();
  const usedTo = new Set<FingerprintHit>();
  const moved: VerifyReport["moved"] = [];
  for (const [key, fromHits] of beforeByRule) {
    const toHits = afterByRule.get(key);
    if (!toHits || toHits.length === 0) continue;
    const froms = [...fromHits].sort(compareHits);
    const tos = [...toHits].sort(compareHits);
    let cursor = 0;
    for (const from of froms) {
      while (cursor < tos.length && tos[cursor]!.line === from.line) cursor += 1;
      const to = tos[cursor];
      if (!to) break;
      cursor += 1;
      usedFrom.add(from);
      usedTo.add(to);
      moved.push({ from, to });
    }
  }
  moved.sort((a, b) => compareHits(a.from, b.from));

  const gone = beforeSurplus.filter((hit) => !usedFrom.has(hit));
  const newFindings = afterSurplus.filter((hit) => !usedTo.has(hit)).sort(compareHits);
  const newBySeverity = { P0: 0, P1: 0, P2: 0 };
  for (const hit of newFindings) {
    if (hit.severity === "P0" || hit.severity === "P1" || hit.severity === "P2") {
      newBySeverity[hit.severity] += 1;
    }
  }

  const report: VerifyReport = {
    before: before.id,
    after: after.id,
    checked: 0,
    present: [],
    gone: [],
    moved: [],
    newFindings: [],
    newBySeverity: { P0: 0, P1: 0, P2: 0 },
    comparable: comparabilityOf(before, after),
    unknown: [],
  };

  if (wanted && wanted.length > 0) {
    const asked = new Set(wanted);
    report.checked = wanted.length;
    for (const fingerprint of wanted) {
      if (!beforeIndex.has(fingerprint)) {
        report.unknown.push(fingerprint);
        continue;
      }
      report.present.push(...(presentByFingerprint.get(fingerprint) ?? []));
    }
    report.gone.push(...gone.filter((hit) => asked.has(hit.fingerprint)));
    report.moved.push(...moved.filter(({ from }) => asked.has(from.fingerprint)));
    return report;
  }

  report.checked = beforeIndex.size;
  report.present = [...presentByFingerprint.values()].flat();
  report.gone = gone;
  report.moved = moved;
  report.newFindings = newFindings;
  report.newBySeverity = newBySeverity;
  return report;
}

export async function handleVerify(req: Request, res: Response, store: ResultStore): Promise<void> {
  const body = req.body as
    { before?: unknown; after?: unknown; fingerprints?: unknown } | undefined;
  const beforeId = typeof body?.before === "string" ? body.before : "";
  const afterId = typeof body?.after === "string" ? body.after : "";
  if (!beforeId || !afterId) {
    res.status(400).json({ error: "Both a before and an after scan id are required" });
    return;
  }
  if (!Array.isArray(body?.fingerprints) && body?.fingerprints !== undefined) {
    res.status(400).json({ error: "fingerprints must be an array of strings" });
    return;
  }
  const wanted = Array.isArray(body?.fingerprints)
    ? body.fingerprints.filter((f): f is string => typeof f === "string").slice(0, 2000)
    : undefined;
  const before = store.get(beforeId);
  const after = store.get(afterId);
  if (!before || !after) {
    res.status(404).json({
      error: "Analysis not found",
      missing: [!before ? beforeId : null, !after ? afterId : null].filter(Boolean),
    });
    return;
  }
  res.json(compareScans(before, after, wanted));
}
