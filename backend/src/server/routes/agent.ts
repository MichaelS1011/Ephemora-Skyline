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
import type { AnalysisResult } from "../../models/index.js";
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
      hits.push({ fingerprint, path: file.path, line: v.line, type: v.type, ruleId });
      index.set(fingerprint, hits);
    }
  }
  return index;
}

export interface VerifyReport {
  before: string;
  after: string;
  checked: number;
  present: FingerprintHit[];
  gone: FingerprintHit[];
  /** Same rule in the same file at another line, or in another file: not a fix to celebrate */
  moved: Array<{ from: FingerprintHit; to: FingerprintHit }>;
  /** Fingerprints the caller asked for that `before` never contained */
  unknown: string[];
}

/**
 * Compare two scans by fingerprint.
 *
 * A vanished fingerprint is not proof of a fix — the line may have moved, the
 * file may have been renamed, or the finding may have been silenced. Those cases
 * are separated here instead of being reported as `gone`, because an agent that
 * believes a false "fixed" is worse than one that got nothing.
 */
export function compareScans(
  before: AnalysisResult,
  after: AnalysisResult,
  wanted?: string[],
): VerifyReport {
  const beforeIndex = fingerprintIndex(before);
  const afterIndex = fingerprintIndex(after);
  const afterByRule = new Map<string, FingerprintHit[]>();
  for (const hits of afterIndex.values()) {
    for (const hit of hits) {
      const key = `${hit.path}::${hit.ruleId}`;
      const list = afterByRule.get(key) ?? [];
      list.push(hit);
      afterByRule.set(key, list);
    }
  }

  const report: VerifyReport = {
    before: before.id,
    after: after.id,
    checked: 0,
    present: [],
    gone: [],
    moved: [],
    unknown: [],
  };
  const keys = wanted && wanted.length > 0 ? wanted : [...beforeIndex.keys()];
  for (const fingerprint of keys) {
    report.checked += 1;
    const hits = beforeIndex.get(fingerprint);
    if (!hits || hits.length === 0) {
      report.unknown.push(fingerprint);
      continue;
    }
    const still = afterIndex.get(fingerprint);
    if (still && still.length > 0) {
      report.present.push(...hits);
      continue;
    }
    const elsewhere = (afterByRule.get(`${hits[0]!.path}::${hits[0]!.ruleId}`) ?? [])[0];
    if (elsewhere) report.moved.push({ from: hits[0]!, to: elsewhere });
    else report.gone.push(...hits);
  }
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
    res
      .status(404)
      .json({
        error: "Analysis not found",
        missing: [!before ? beforeId : null, !after ? afterId : null].filter(Boolean),
      });
    return;
  }
  res.json(compareScans(before, after, wanted));
}
