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

/** Shared with the regex detector, including compounds such as mysqlpassword. */
export const CREDENTIAL_NAME = /(?:password|passwd|secret|token|api[_-]?key)\w*/i;

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

/** Keep detector-matched compounds and credential words; `monkey` stays readable. */
export function looksLikeSecretName(name: string): boolean {
  if (CREDENTIAL_NAME.test(name)) return true;
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
  /\bxox[baprs]-[0-9A-Za-z-]{10,}/g, // Slack (a trailing hyphen is part of the value)
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\bya29\.[0-9A-Za-z_-]{10,}/g, // Google OAuth access token
  /\b[ps]k_(?:live|test)_[0-9A-Za-z]{16,}\b/g, // Stripe
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\bnpm_[A-Za-z0-9]{30,}\b/g, // npm access token, the form `npm_…`
  /\bgithub_pat_[0-9A-Za-z_]{20,}\b/g, // GitHub fine-grained PAT
  /\b_npmp_[0-9a-f]{32,}\b/g, // npm legacy auth key in .npmrc, not the token above
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g, // PEM key header
];

/**
 * Credentials that sit inside a URL rather than next to a name.
 *
 * `DATABASE_URL=postgres://admin:pw@db.internal/app` is a connection string, not
 * a `PASSWORD=` line, so the name rule above never fires on it — and the frame
 * two lines past a hygiene hit is where such a string turns up when the finding
 * itself was about something else. The scheme and the user name are the
 * informative half of the line, the password is the dangerous half, so the
 * replacement keeps groups 1 and 3 and hides group 2.
 */
const URI_USERINFO = /([a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:)([^\s/@]{4,})(@[^\s"']*)/gi;
const URI_QUERY =
  /([?&](?:key|token|password|passwd|secret|api_?key|access_?token)=)([^\s&"']{4,})/gi;

/** Mask every credential SHAPE in a piece of text. */
function maskSecretShapes(text: string): string {
  let out = text;
  out = out.replace(URI_USERINFO, `$1${HIDDEN}$3`);
  out = out.replace(URI_QUERY, `$1${HIDDEN}`);
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
export function maskSecretText(text: string, knownValue?: string | readonly string[]): string {
  if (!text) return text;
  let out = text;
  const known = typeof knownValue === "string" ? [knownValue] : (knownValue ?? []);
  // Longest first, so an overlapping shorter match cannot leave a secret's suffix.
  for (const value of [...new Set(known)].sort((a, b) => b.length - a.length)) {
    if (value.length >= 6) out = out.split(value).join(HIDDEN);
  }
  out = maskSecretShapes(out);

  const assign = /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1([ \t]*[:=][ \t]*)(["'`]?)/g;
  let match: RegExpExecArray | null;
  let result = "";
  let cursor = 0;
  while ((match = assign.exec(out)) !== null) {
    if (!looksLikeSecretName(match[2]!)) continue;
    const valueStart = match.index + match[0].length;
    const quote = match[4] ?? "";
    let valueEnd = valueStart;
    if (quote) {
      while (valueEnd < out.length && out[valueEnd] !== quote && !/[\r\n]/.test(out[valueEnd]!)) {
        valueEnd += out[valueEnd] === "\\" && valueEnd + 1 < out.length ? 2 : 1;
      }
    } else {
      while (valueEnd < out.length && !/[\s,;)}\]&"']/.test(out[valueEnd]!)) valueEnd++;
    }
    const value = out.slice(valueStart, valueEnd);
    // A hidden-marker prefix that the display clip cut short is already redacted;
    // rewriting it to the full marker would lengthen the line back past the clip
    // and make the boundary non-idempotent.
    if (!value || value.startsWith(HIDDEN.slice(0, 1))) continue;
    if (value === `${HIDDEN}…`) continue;
    result += out.slice(cursor, valueStart) + HIDDEN;
    cursor = valueEnd;
    assign.lastIndex = valueEnd + (quote && out[valueEnd] === quote ? 1 : 0);
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
export function maskIssueFrames(
  issue: {
    code?: string;
    snippet?: { line: string; before: string[]; after: string[] };
    /** Consumed before persistence; never store the matched credential. */
    secretValue?: string;
  },
  knownValues: readonly string[] = [],
): void {
  const known = issue.secretValue === undefined ? knownValues : [...knownValues, issue.secretValue];
  if (issue.code) issue.code = maskSecretText(issue.code, known);
  if (issue.snippet) {
    issue.snippet.line = maskSecretText(issue.snippet.line, known);
    issue.snippet.before = issue.snippet.before.map((l) => maskSecretText(l, known));
    issue.snippet.after = issue.snippet.after.map((l) => maskSecretText(l, known));
  }
  delete issue.secretValue;
}
