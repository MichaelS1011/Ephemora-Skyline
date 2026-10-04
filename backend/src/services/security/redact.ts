/**
 * Masking for the text a finding carries with it.
 *
 * Every finding stores the line it was found on (`code`) and a small code frame
 * (`snippet`), and both are written into the persisted city result — the file a
 * user shares when they ask someone to look at their scan. For a credential
 * finding that stores the credential. The key name is the informative half of
 * such a line and the value is the dangerous half, so the name stays.
 */
const HIDDEN = "‹hidden›";

const SENSITIVE = new Set([
  "secret",
  "token",
  "password",
  "passwd",
  "pwd",
  "apikey",
  "api",
  "key",
  "credential",
  "credentials",
  "auth",
  "authorization",
]);

/** Split `PAYMENT_SECRET_KEY`, `apiKey` and `db-url` into their words */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * A name counts when one of its words is a credential word, or when a compound
 * name ends in one — `monkey` is one word and does not, `access_key` does.
 */
export function looksLikeSecretName(name: string): boolean {
  const parts = words(name);
  if (parts.some((p) => SENSITIVE.has(p))) return true;
  return parts.length > 1 && parts.some((p) => /(?:secret|token|key|password|credential)$/.test(p));
}

/**
 * Mask the value of every `NAME = value` / `"NAME": "value"` in a line whose
 * name looks like a credential. Quotes and spacing are kept so the line still
 * reads like the source it came from.
 */
export function maskSecretText(text: string, knownValue?: string): string {
  if (!text) return text;
  let out = text;
  // gitleaks reports the exact string it matched — that is better than guessing
  if (knownValue && knownValue.length >= 6) out = out.split(knownValue).join(HIDDEN);

  const assign = /([A-Za-z_][A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)/g;
  let match: RegExpExecArray | null;
  let result = "";
  let cursor = 0;
  while ((match = assign.exec(out)) !== null) {
    const name = match[1]!;
    if (!looksLikeSecretName(name)) continue;
    const valueStart = match.index + match[0].length;
    const quote = match[3] ?? "";
    const rest = out.slice(valueStart);
    // to the closing quote when the value is quoted, otherwise to end of line
    const end = quote ? rest.indexOf(quote) : -1;
    const valueEnd = valueStart + (end > 0 ? end : rest.length);
    result += out.slice(cursor, valueStart) + HIDDEN + (quote && end > 0 ? quote : "");
    cursor = valueEnd + (end > 0 ? 1 : 0);
    assign.lastIndex = cursor;
  }
  return cursor === 0 ? out : result + out.slice(cursor);
}

/** Findings whose own text is a credential, from any scanner */
export function isSecretFinding(issue: { type?: string; provenance?: string }): boolean {
  const type = issue.type ?? "";
  const provenance = issue.provenance ?? "";
  return (
    type === "HARDCODED_SECRET" ||
    type.startsWith("SECRET_") ||
    provenance === "gitleaks" ||
    provenance.startsWith("gitleaks-")
  );
}

/**
 * Mask every piece of source text a finding carries: the line it was found on
 * and each line of its code frame.
 *
 * This is the one masking routine, and it runs at every boundary a finding
 * crosses on its way out of the scanner — not only inside the enrichment pass.
 * A frame reaches two lines past the finding, so a hygiene hit one line above
 * a `DB_PASSWORD = …` carried the password into the city JSON the user exports;
 * and an adapter that fills `code` itself (gitleaks' no-binary fallback reads
 * the raw line) bypassed enrichment entirely, which is how the value reached a
 * CI run. Masking at the call site of one adapter was not enough.
 */
export function maskIssueFrames(issue: {
  code?: string;
  snippet?: { line: string; before: string[]; after: string[] };
}): void {
  if (issue.code) issue.code = maskSecretText(issue.code);
  if (issue.snippet) {
    issue.snippet.line = maskSecretText(issue.snippet.line);
    issue.snippet.before = issue.snippet.before.map((l) => maskSecretText(l));
    issue.snippet.after = issue.snippet.after.map((l) => maskSecretText(l));
  }
}
