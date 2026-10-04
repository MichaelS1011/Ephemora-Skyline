import { createHash } from "crypto";

/**
 * One identity for one finding, minted in one place.
 *
 * The panel, the persisted city JSON and the SARIF export must name the same
 * finding the same way, or a review verdict and an exported report drift apart
 * — which is why this is a module and not a hash at each call site.
 *
 * What makes a finding "the same": the rule, the file, the line it sits on, and
 * the (already masked) text of that line. What that deliberately excludes:
 * - position in any array. The previous key was `<fileId>#<index>` with
 *   `fileId = f-<walk order>`; adding a file or a finding reshuffled both
 *   halves, so a re-scan orphaned every verdict.
 * - column and snippet. Not every scanner reports them, and a rule pack that
 *   started emitting one would re-identify every finding it already found.
 *
 * Consequences, stated plainly: a finding that MOVES to another line is a new
 * finding, and a renamed file is a new finding. The product must not claim a
 * fixed issue survived being rewritten somewhere else.
 *
 * Secret findings hash the MASKED line, so the hash is no oracle over the
 * credential, and rotating a token leaves the verdict where it belongs.
 */
export interface FingerprintInput {
  /** Path as the analysis reports it, relative to the scanned root. */
  path: string;
  /** Scanner issue type, e.g. "HARDCODED_SECRET" — the fallback identity. */
  type: string;
  /** Rule id when the scanner has one; it wins over `type`. */
  ruleId?: string;
  line: number;
  /** The finding's own source line, already masked at the redaction boundary. */
  code?: string;
  provenance?: string;
  /** Set for findings that only exist in git history. */
  historyCommit?: string;
}

/** Fields are joined with NUL: no path, rule id or source line can contain it. */
const SEP = String.fromCharCode(0);

/** Windows separators and a leading `./` are the same file written twice. */
export function normalizeIdentityPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Reindentation is not a new finding. */
function normalizeLine(code: string | undefined): string {
  return (code ?? "").replace(/\s+/g, " ").trim();
}

export function findingFingerprint(i: FingerprintInput): string {
  const rule = i.ruleId ?? i.type;
  const path = normalizeIdentityPath(i.path);
  const parts =
    i.provenance === "gitleaks-history"
      ? // no current line to hash — the commit is the only stable place to point
        ["commit", rule, path, i.historyCommit ?? ""]
      : ["line", rule, path, String(i.line), normalizeLine(i.code)];
  return createHash("sha256").update(parts.join(SEP)).digest("hex").slice(0, 16);
}
