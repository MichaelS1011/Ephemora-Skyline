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
 * Credential SHAPES, independent of what the variable next to them is called.
 *
 * The name rule above cannot cover `const pat = "ghp_…"` — `pat` is not a
 * credential word, and a test fixture, a docs snippet and a client's config
 * class all name their tokens after whatever the author felt like. gitleaks
 * knows the exact value it matched and hands it over as `knownValue`, but every
 * other path (semgrep, the regex adapter, the gitleaks fallback, an adapter
 * added next month) reports the line without telling us which substring is the
 * secret. Shapes are the only thing those paths have in common, so the shapes
 * are masked here, at the boundary, rather than in each adapter.
 */
const SECRET_SHAPES: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temporary key id
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
  /\b[ps]k_(?:live|test)_[0-9A-Za-z]{16,}\b/g, // Stripe
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\b_npmp_[0-9a-f]{32,}\b/g, // npm
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g, // PEM key header
];

/** Mask every credential SHAPE in a piece of text. */
function maskSecretShapes(text: string): string {
  let out = text;
  for (const shape of SECRET_SHAPES) {
    shape.lastIndex = 0;
    out = out.replace(shape, HIDDEN);
  }
  return out;
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
  out = maskSecretShapes(out);

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
  /** The exact value a scanner matched. Used for masking, then dropped: it must
   *  never reach the persisted result, where it would be the thing we promised
   *  not to store. */
  secretValue?: string;
}): void {
  const known = issue.secretValue;
  if (issue.code) issue.code = maskSecretText(issue.code, known);
  if (issue.snippet) {
    issue.snippet.line = maskSecretText(issue.snippet.line, known);
    issue.snippet.before = issue.snippet.before.map((l) => maskSecretText(l, known));
    issue.snippet.after = issue.snippet.after.map((l) => maskSecretText(l, known));
  }
  if (known !== undefined) delete issue.secretValue;
}
