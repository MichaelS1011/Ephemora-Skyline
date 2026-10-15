import { syntaxContext } from "../syntax-context.js";
import type { SecurityIssue } from "../../../models/index.js";
import {
  detectLanguage,
  isDataFile,
  isTextOnlyLine,
  maskForScanning,
  structureLines,
} from "../../analyzer/metrics.js";
import { enrichIssues } from "../finding-knowledge.js";
import { CREDENTIAL_NAME } from "../redact.js";
import type { ScannerAdapter } from "../adapter.js";
import { languageOfPath, type CustomPattern } from "../scan-config.js";

export interface ScanPattern {
  regex: RegExp;
  type: string;
  severity: "P0" | "P1" | "P2";
  message: string;
  fix?: string;
  score: number;
  /**
   * Only paths matching this produce the finding. An install hook is a fact
   * about a manifest, not about a source file that happens to mention one.
   */
  paths?: RegExp;
  /** Language names (`"typescript"`), empty = every language */
  languages?: string[];
  cwe?: string;
}

const CUSTOM_SCORE: Record<"P0" | "P1" | "P2", number> = { P0: 9, P1: 6, P2: 3 };

/**
 * Provider-format credential values (regeln-lane 2026-10-14). The shapes are
 * the ones vendors print in their own documentation; a value that matches one
 * is credential-shaped wherever it sits, keyword name or not.
 */
const PROVIDER_VALUE =
  /(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|ya29\.[A-Za-z0-9_-]{10,})/;

/** Vendor-documented example values (AWS's own docs keys). Findings — but
 * classified as examples, never shouted as live credentials (and never P0). */
const DOCUMENTED_EXAMPLE = /^(?:AKIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI\/K7MDENG\/bPxRfiCYEXAMPLEKEY)$/;

/**
 * Does the literal value read as a credential rather than as a label? The
 * keyword name alone is not enough ("password-field-selector" is a CSS class),
 * so a non-provider value must mix letters with digits. Labels like "changeme",
 * "example", "placeholder-value" and the `# label only` case stay silent.
 */
function credentialShaped(value: string): boolean {
  if (!value) return false;
  return PROVIDER_VALUE.test(value) || (/\d/.test(value) && /[A-Za-z]/.test(value));
}

/** camelCase/snake_case name whose segments show a security purpose. */
function securityShapedName(name: string): boolean {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return /(?:^|_)(?:token|session|nonce|password|passwd|secret|otp|code|key|credential|auth)(?:$|_)/.test(
    snake,
  );
}

/**
 * A user rule becomes a scanner rule — the same shape, the same gates, the same
 * suppression of comments. Validated before it gets here (`validateCustomPattern`
 * compiles it and runs a ReDoS canary), so this is translation, not a checkpoint.
 */
export function toScanPattern(p: CustomPattern): ScanPattern {
  const extensions = (p.fileExtensions ?? [])
    .map((e) => e.trim().replace(/^\.+/, ""))
    .filter(Boolean);
  return {
    regex: new RegExp(p.regex, `g${(p.flags ?? "").includes("i") ? "i" : ""}`),
    type: p.id,
    severity: p.severity,
    message: p.message,
    fix: p.fix,
    score: CUSTOM_SCORE[p.severity],
    paths: extensions.length ? new RegExp(`\\.(?:${extensions.join("|")})$`, "i") : undefined,
    languages: (p.languages ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
    cwe: p.cwe,
  };
}

export const REGEX_PATTERNS: ScanPattern[] = [
  {
    regex:
      /child_process\s*\.\s*exec|(?:^|[^.\w])exec\s*\(|execFile\s*\(.*shell\s*:\s*true|spawn\s*\(\s*['"`](?:sh|bash|cmd)['"`]/gm,
    type: "CMD_INJECTION",
    severity: "P0",
    message: "Potential command injection — unsafe shell execution",
    fix: "Use spawn() with argument arrays and avoid shell: true",
    score: 10,
  },
  {
    // SQL only inside execute()/query() calls or as a quoted SQL statement —
    // the old cross-newline SELECT...FROM regex also flagged English prose
    // ("Select the model ... from ...") in comments and docstrings
    regex:
      /(?:(?:execute|query|exec)\s*\(\s*[fFrRbB]{0,2}['"`][^'"`]{0,300}SELECT\b[^'"`]{0,300}|['"`]\s*SELECT\b[^'"`]{0,300}\b(?:WHERE|ORDER\s+BY|GROUP\s+BY|LIMIT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^'"`]{0,200}['"`])/gi,
    type: "SQL_INJECTION",
    severity: "P0",
    message: "Raw SQL query detected — potential SQL injection",
    fix: "Use parameterized queries or an ORM (e.g., Prisma, Drizzle)",
    score: 9,
  },
  {
    // Built-in eval() only — `model.eval()` (PyTorch), `ast.literal_eval()`
    // and friends are not the eval builtin (real-project false positives)
    regex: /(?<![.\w])eval\s*\(/g,
    type: "EVAL_USAGE",
    severity: "P0",
    message: "eval() detected — arbitrary code execution risk",
    fix: "Use JSON.parse() or a safe parser instead",
    score: 10,
  },
  {
    regex: /new\s+Function\s*\(/g,
    type: "DYNAMIC_FUNCTION",
    severity: "P0",
    message: "Dynamic function creation detected — code injection risk",
    fix: "Avoid Function constructor; use safe alternatives",
    score: 9,
  },
  {
    // PATH_TRAVERSAL: the traversal is the flow, not the segment — a real
    // filesystem call whose argument concatenates or interpolates request
    // input fires even without a literal '../'; the literal stays a supporting
    // signal. Import/require lines are skipped in the loop below.
    regex:
      /(?:(?:fs\.\w+File\w*|res\.sendFile|res\.download)\s*\([^;]{0,200}['"]\.\.\/)|(?:userInput|(?:req|request)\s*\.\s*(?:query|body|params)\s*\.\s*\w+)\s*\+[^;\n]{0,120}['"`]\/?\.\.?\/|['"`]\/?\.\.?\/['"`]\s*\+|(?:fs\s*\.\s*(?:readFileSync|readFile|createWriteStream|createReadStream|writeFileSync|writeFile|appendFileSync|appendFile|open)\s*\(|path\s*\.\s*(?:join|resolve)\s*\()[^;\n)]{0,150}?(?:req|request)\s*\.\s*(?:query|body|params|headers)/g,
    type: "PATH_TRAVERSAL",
    severity: "P1",
    message: "Path traversal in filesystem or response call with user-supplied input",
    fix: "Validate and sanitize file paths; use path.resolve() and compare against an allowed base directory",
    score: 9,
  },
  {
    regex: /innerHTML\s*=|dangerouslySetInnerHTML/g,
    type: "XSS",
    severity: "P1",
    message: "XSS risk — unsanitized HTML insertion",
    fix: "Use textContent or sanitize with DOMPurify; avoid dangerouslySetInnerHTML with untrusted content",
    score: 7,
  },
  {
    // Server-side XSS: the response body itself is assembled from request
    // input. A constant string, a plain variable or an object response is not
    // this finding — concatenation is the gate.
    regex:
      /(?:res|rsp|reply|response)\s*\.\s*(?:send|end|json)\s*\(\s*(?:[^;\n]{0,120}?\+\s*(?:req|request)\s*\.\s*(?:query|body|params|headers|cookies)|(?:req|request)\s*\.\s*(?:query|body|params|headers|cookies)[^;\n]{0,120}?\+)/g,
    type: "XSS",
    severity: "P1",
    message: "Server-side XSS — response body assembled from request input",
    fix: "Escape before embedding request data in HTML, or send data as JSON and render on the client",
    score: 7,
  },
  {
    // Credential literal, general form: a bounded always-on pattern baseline.
    // Provenance is "regex", severity is P1 and the message says "fallback" —
    // this is a heuristic second pair of eyes for when gitleaks is absent or
    // silent, never a scanner verdict. The value gate in the loop keeps
    // labels ("password-field-selector", "changeme", `# label only`) silent.
    regex: new RegExp(`${CREDENTIAL_NAME.source}\\s*[:=]\\s*["']([^"'$%\\\\]{8,})["']`, "gi"),
    type: "HARDCODED_SECRET",
    severity: "P1",
    message:
      "Credential literal in source — regex pattern baseline (offline fallback heuristic, not a scanner verdict)",
    fix: "Load the value from the environment or a secret manager and rotate anything committed",
    score: 7,
    cwe: "CWE-798",
  },
  {
    // Credential literal, provider-prefix form: the value shape alone (AWS,
    // GitHub, OpenAI, Slack, Google, OAuth) is the finding — no credential
    // keyword in the name required. Documented example values are classified
    // as examples in the loop; this rule never emits a P0.
    regex:
      /(?:^|[=:(,[{])\s*["'](AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|ya29\.[A-Za-z0-9_-]{10,})["']/gm,
    type: "HARDCODED_SECRET",
    severity: "P1",
    message:
      "Provider-format credential literal — regex pattern baseline (offline fallback heuristic, not a scanner verdict)",
    fix: "Load the value from the environment or a secret manager and rotate anything committed",
    score: 7,
    cwe: "CWE-798",
  },
  {
    // SSRF: a server-side fetch whose URL comes straight from the request.
    regex:
      /(?:\bfetch\s*\(|\bhttps?\s*\.\s*(?:get|request)\s*\(|\baxios\s*\.\s*(?:get|post)\s*\()[^;\n]{0,120}?(?:req|request)\s*\.\s*(?:query|body|params|headers)/g,
    type: "SSRF",
    severity: "P1",
    message: "Server-side request to a URL taken from the request — SSRF",
    fix: "Resolve and validate the target against an allowlist of schemes and hosts before fetching",
    score: 8,
    cwe: "CWE-918",
  },
  {
    // Weak randomness in a security-shaped binding; the loop checks the name
    // and reports the line of the Math.random() call itself.
    regex:
      /(?:([\w$]+)\s*=\s*Math\s*\.\s*random\s*\(|function\s+([\w$]+)\s*\([^)]{0,60}\)\s*\{[\s\S]{0,120}?\breturn\s+Math\s*\.\s*random\s*\()/g,
    type: "WEAK_RANDOMNESS",
    severity: "P2",
    message: "Security-relevant value derived from Math.random() — predictable",
    fix: "Use crypto.randomBytes() or crypto.randomUUID() for tokens, sessions and secrets",
    score: 4,
    cwe: "CWE-330",
  },
  {
    // CORS wildcard + credentials in the same block/statement. The leading
    // boundary class starts the match outside the header-name string literal;
    // the loop re-anchors the finding to the Allow-Origin line.
    regex:
      /[\s{(=,:[\]]\s*["']Access-Control-Allow-Origin["']\s*[:,=]\s*["']\*["'][\s\S]{0,80}?[\s{(=,:[\]]\s*["']Access-Control-Allow-Credentials["']\s*[:,=]\s*(?:"true"|'true'|true)(?=\s*[,;)}\]]|\s*$)|[\s{(=,:[\]]\s*["']Access-Control-Allow-Credentials["']\s*[:,=]\s*(?:"true"|'true'|true)(?=\s*[,;)}\]]|\s*$)[\s\S]{0,80}?["']Access-Control-Allow-Origin["']\s*[:,=]\s*["']\*["']/g,
    type: "CORS",
    severity: "P1",
    message: "CORS misconfiguration — browsers block credentialed responses with a wildcard origin",
    fix: "Use a specific allowlisted origin for credentialed requests, or omit credential support for public responses",
    score: 7,
    cwe: "CWE-942",
  },
  {
    regex:
      /prototype\s*\.\s*(?:__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)/g,
    type: "PROTOTYPE_POLLUTION",
    severity: "P1",
    message: "Prototype property manipulation — potential prototype pollution",
    fix: "Use Object.freeze() or Map for safe key-value storage",
    score: 7,
  },
  {
    // pickle/yaml on untrusted data = arbitrary code execution (Python);
    // yaml.load is unsafe unless Loader=SafeLoader is passed
    regex: /pickle\.loads?\s*\(|yaml\.load\s*\((?![^)]*SafeLoader)[^)]*\)/gi,
    type: "UNSAFE_DESERIALIZATION",
    severity: "P1",
    message: "Unsafe deserialization detected",
    fix: "Use JSON.parse() or secure deserialization with schema validation (e.g., zod)",
    score: 8,
  },
  {
    regex: /setTimeout\s*\(\s*['"`]/g,
    type: "SETTIMEOUT_STRING",
    severity: "P1",
    message: "setTimeout with string argument — equivalent to eval()",
    fix: "Pass a function reference instead of a string",
    score: 7,
  },
  {
    regex: /console\.(?:log|debug|info|warn)\s*\(/g,
    type: "CONSOLE_USAGE",
    severity: "P2",
    message: "Console output — review logged values (informational)",
    fix: "Use a structured logger (pino, winston) with log levels",
    score: 3,
  },
  {
    // `x == null` is the one loose comparison JavaScript programmers write on
    // purpose — it catches null and undefined in one go. Reporting it as a bug
    // was the only real-code LOOSE_EQUALITY finding left in this repo's own
    // scan, so the rule chased an idiom instead of a mistake.
    regex: /[^=!<>]==(?!=)(?!\s*(?:null|undefined)\b)/g,
    type: "LOOSE_EQUALITY",
    severity: "P2",
    message: "Loose equality (==) — use === instead",
    fix: "Replace == with === for strict equality",
    score: 2,
  },
  {
    regex: /localStorage\.setItem\s*\(/g,
    type: "LOCALSTORAGE_USAGE",
    severity: "P2",
    message: "Potential sensitive value written to localStorage — verify the stored data",
    fix: "Use httpOnly cookies or secure server-side storage",
    score: 3,
  },
  {
    regex: /fetch\s*\(\s*['"`]http:\/\//g,
    type: "INSECURE_HTTP",
    severity: "P2",
    message: "HTTP request over unencrypted channel",
    fix: "Use HTTPS for all API calls",
    score: 5,
  },
  {
    // Deploy accidents live in shell scripts and manifests, and until now the
    // scan never even uploaded those files.
    regex: /"(?:preinstall|postinstall|prepublish|prepublishOnly)"\s*:/g,
    paths: /(?:^|\/)package\.json$/,
    type: "INSTALL_HOOKS",
    severity: "P1",
    message: "Automatic install hook — code that runs on every machine that installs this",
    fix: "Expose a documented script instead of a lifecycle hook, so setup stays a deliberate action",
    score: 7,
  },
  {
    regex: /\b(?:curl|wget)\b[^|\n]{0,200}\|\s*(?:sudo\s+)?(?:bash|sh|zsh|python\d?(?:\.\d+)?)\b/g,
    type: "CURL_PIPE_BASH",
    severity: "P0",
    message: "Downloaded script executed without an integrity check",
    fix: "Download to a file, verify its checksum or signature, then run it",
    score: 9,
  },
  {
    regex: /\bchmod\b[^\n]*?(?:\b[0-7]?77\b|\ba\+w\b|\bgo\+w\b|\bo\+w\b)/g,
    type: "WORLD_WRITABLE",
    severity: "P1",
    message: "World-writable permission — any local user can modify or replace the target",
    fix: "Use the narrowest permission that works (typically 755 for a directory, 644 for a file)",
    score: 6,
  },
  {
    regex:
      /(?:--insecure\b|--no-check-certificate\b|verify\s*=\s*false\b|rejectUnauthorized\s*:\s*false\b|InsecureSkipVerify\s*:\s*true\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0\b|sslmode\s*=\s*disable\b)/gi,
    type: "TLS_VERIFICATION_DISABLED",
    severity: "P0",
    message: "TLS certificate validation switched off — the connection is open to interception",
    fix: "Fix the certificate (or the trust store); never disable verification to make a call succeed",
    score: 9,
  },
  {
    regex:
      /\brm\s+(?:-[a-z]+\s+)*(?:\/(?:$|[\s*])|--no-preserve-root)|(?:^|[\s;&(])dd\s+[^\n]*\bof=\/dev\//gm,
    type: "DESTRUCTIVE_COMMAND",
    severity: "P0",
    message: "Destructive command targets the filesystem root or a raw device",
    fix: "Refuse absolute or unset paths before deleting, and never write to a device node from a script",
    score: 10,
  },
];

/**
 * Runtime-danger claims: a hook that installs code, a command that wipes the
 * disk. In a test file such a string is a description, not a machine about to
 * act — the finding stays, but as hygiene (P2) instead of an alarm.
 */
const OPERATIONAL_TYPES = new Set([
  "INSTALL_HOOKS",
  "CURL_PIPE_BASH",
  "WORLD_WRITABLE",
  "TLS_VERIFICATION_DISABLED",
  "DESTRUCTIVE_COMMAND",
]);

export class RegexAdapter implements ScannerAdapter {
  readonly id = "regex";
  private custom: ScanPattern[] = [];
  constructor(private patterns: ScanPattern[] = REGEX_PATTERNS) {}

  /**
   * User rules join the catalogue at scan time. They are appended, not
   * substituted, so turning a custom rule on can never remove a built-in one.
   */
  setCustomPatterns(list: CustomPattern[]): void {
    this.custom = list.map(toScanPattern);
  }

  get activePatterns(): ScanPattern[] {
    return this.custom.length ? [...this.patterns, ...this.custom] : this.patterns;
  }

  scanFile(filePath: string, content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split("\n");
    const dot = filePath.lastIndexOf(".");
    const ext = dot > filePath.lastIndexOf("/") ? filePath.slice(dot).toLowerCase() : "";
    const isJsFamily = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext);
    // A code-shaped question has no true answer in a lockfile or a translation
    // catalogue: "does this line call eval?" reads values, not behaviour. Only
    // rules that name their file type (the `paths` gate) run on data.
    const dataFile = isDataFile(filePath);
    // Patterns run against the file with its prose blanked out; line numbers
    // and the shown code still come from the original text, which is the whole
    // point of a mask that keeps its length.
    const scannable = maskForScanning(content, detectLanguage(filePath));
    const syntax = isJsFamily ? syntaxContext(filePath, content) : null;

    // Heuristic: findings in test/spec files are lower priority
    const isTestFile =
      /(^|[/\\])(?:test|tests|__tests__|spec|__spec__|fixtures)(?:[/\\]|$)|\.(?:test|spec)\.[jt]sx?$/.test(
        filePath,
      );

    // Python comments and triple-quoted docstrings are prose — scanner hits
    // inside them ("Select the model ... from ...") are never actionable.
    // Mini-lexer: tracks string/comment/docstring state character-wise, so
    // module-level `PROMPT = """..."""` constants don't desync the parity
    // (a line starting with `"""` can be a CLOSER, not an opener).
    const suppressedLines = new Set<number>();
    if (ext === ".py") {
      type PyState = { mode: "code" | "line-comment" | "doc" | "string"; delim?: string };
      let state: PyState = { mode: "code" };
      const isTriple = (a: string, b: string, c: string): boolean =>
        a === b && b === c && (c === '"' || c === "'");
      lines.forEach((line, i) => {
        let quote: string | null = null; // single-char quote inside code
        let j = 0;
        if (state.mode === "doc" || state.mode === "string") {
          suppressedLines.add(i + 1);
          const delim = state.delim!;
          while (j < line.length - 2) {
            if (isTriple(line[j]!, line[j + 1]!, line[j + 2]!) && delim === line.slice(j, j + 3)) {
              state = { mode: "code" };
              j += 3;
              break;
            }
            j++;
          }
          if (state.mode !== "code") return; // whole line is prose
        }
        while (j < line.length) {
          const c = line[j]!;
          if (state.mode === "line-comment") {
            suppressedLines.add(i + 1);
            break;
          }
          if (c === "#" && !quote) {
            state = { mode: "line-comment" };
            continue;
          }
          if (c === "\\" && quote) {
            j += 2;
            continue;
          }
          if (quote && c === quote) {
            quote = null;
            j++;
            continue;
          }
          if (!quote && (c === '"' || c === "'")) {
            if (isTriple(c, line[j + 1] ?? "", line[j + 2] ?? "")) {
              const delim = line.slice(j, j + 3);
              const rest = line.slice(j + 3);
              const closeIdx = rest.indexOf(delim);
              if (closeIdx === -1) {
                state = { mode: "doc", delim };
                suppressedLines.add(i + 1);
                break; // docstring continues on the next line
              }
              j += 3 + closeIdx + 3;
              continue;
            }
            quote = c;
            j++;
            continue;
          }
          j++;
        }
        if (state.mode === "line-comment") state = { mode: "code" };
      });
    }

    // Precompute line offsets for O(log L) zero-allocation line lookups
    const lineOffsets = new Uint32Array(lines.length);
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      lineOffsets[i] = offset;
      offset += lines[i]!.length + 1;
    }

    const findLineNum = (charIndex: number): number => {
      let low = 0;
      let high = lineOffsets.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (lineOffsets[mid]! <= charIndex) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return low;
    };

    // Built on first use: most files produce no matches at all
    let structure: string[] | null = null;
    const isTextLine = (line: number): boolean => {
      structure ??= structureLines(content, detectLanguage(filePath));
      return isTextOnlyLine(structure[line - 1] ?? "", lines[line - 1] ?? "");
    };
    // The structure view of a line is blank: the text sits inside a
    // multi-line literal or a block comment — prose, not catalogue shape.
    const isMultilineProse = (line: number): boolean => {
      structure ??= structureLines(content, detectLanguage(filePath));
      return (structure[line - 1] ?? "").trim() === "" && (lines[line - 1] ?? "").trim() !== "";
    };

    for (const pattern of this.activePatterns) {
      // Language gating: loose equality is a JavaScript-only pitfall — in
      // Python `==` is the correct operator (400+ false positives in real
      // Python projects otherwise)
      if (pattern.type === "LOOSE_EQUALITY" && !isJsFamily) continue;
      if (
        pattern.languages?.length &&
        !pattern.languages.includes(languageOfPath(filePath).toLowerCase())
      )
        continue;

      // Path gating: an install hook is a fact about a manifest, not about a
      // source file that happens to name one.
      if (pattern.paths && !pattern.paths.test(filePath)) continue;
      if (dataFile && !pattern.paths) continue;

      // A .sql file IS the query language — every statement in a migration
      // would otherwise read as an injection and bury the real findings.
      if (pattern.type === "SQL_INJECTION" && ext === ".sql") continue;

      // Local regex instance prevents race conditions across concurrent file scans
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(scannable)) !== null) {
        let lineNum = findLineNum(match.index);

        // WEAK_RANDOMNESS: only a security-shaped binding counts, and the
        // finding sits on the Math.random() call — not on the function line
        // several lines above it (sec-subtle/src/subtle.js:27 shape).
        if (pattern.type === "WEAK_RANDOMNESS") {
          const name = match[1] ?? match[2] ?? "";
          if (!securityShapedName(name)) {
            if (match[0].length === 0) regex.lastIndex++;
            continue;
          }
          const at = match[0].lastIndexOf("Math");
          if (at >= 0) lineNum = findLineNum(match.index + at);
        }

        // CORS: report the wildcard-origin line, whichever order the pair
        // appears in.
        if (pattern.type === "CORS") {
          const at = match[0].search(/Access-Control-Allow-Origin/);
          if (at >= 0) lineNum = findLineNum(match.index + at);
        }

        if (syntax && !syntax.allows(match.index, pattern.type)) {
          if (match[0].length === 0) regex.lastIndex++;
          continue;
        }
        // Never flag prose: comments, docstrings
        if (suppressedLines.has(lineNum)) {
          if (match[0].length === 0) regex.lastIndex++;
          continue;
        }

        // The credential and CORS rules find their answer in data-shaped
        // catalogue lines (`secretAccessKey: "wJal…",` is a text-only line yet
        // carries the literal secret; an origin/credentials pair in a config
        // object is a real configuration). The exemption is narrow: the value
        // must be credential-shaped (provider format, or letters mixed with
        // digits), so labels ("secret": "example", "password-field-selector")
        // and prose inside multi-line literals stay suppressed.
        const shapedCredential =
          pattern.type === "HARDCODED_SECRET" && credentialShaped(match[1] ?? "");
        const dataExempt =
          (shapedCredential || pattern.type === "CORS") && !isMultilineProse(lineNum);

        // Never flag text that only names the construct: an advice entry, a fix
        // suggestion's unsafe example, a rule catalogue. Rules that name their
        // file type are exempt, because there the string is the fact.
        if (!pattern.paths && isTextLine(lineNum) && !dataExempt) {
          if (match[0].length === 0) regex.lastIndex++;
          continue;
        }

        // SQL_INJECTION: skip parameterized queries. The placeholder has to be
        // in the query itself — the 400 characters after the match are unrelated
        // code, and any later ternary muted a real injection there.
        if (pattern.type === "SQL_INJECTION") {
          if (/\?|\$\d|:\w+/.test(match[0])) {
            if (match[0].length === 0) regex.lastIndex++;
            continue;
          }
          // A quote is only a query under construction when something
          // non-literal is joined into it (concatenation, interpolation,
          // printf/format building) — or when it already carries injection
          // payload. A quoted constant like `SELECT COUNT(*) FROM metrics
          // LIMIT 10` with neither is a finished string, not a risk (the
          // P0 false alarm on sec-false-positive-bait/src/bait.js:14).
          const tailLines = scannable
            .slice(match.index + match[0].length, match.index + match[0].length + 80)
            .split("\n");
          // A match ending on the last character still leaves its own (empty)
          // line in the split, but the index read is `string | undefined` under
          // noUncheckedIndexedAccess. Guarded at runtime — no assertion — so the
          // two tests below can never be handed undefined.
          const tail = tailLines[0] ?? "";
          const dynamic =
            /\$\{|%\(|%[sd]|\bformat\s*\(|[fF]["']/.test(match[0]) ||
            // the mask rewrites in-string quotes, so the operator can sit
            // behind one or two quote characters: `" + id` / `' + req.x`
            /^\s*["']?\s*(?:\+\s*\S|\.\s*[\w$])/.test(tail);
          const payload =
            /(?:\b1\s*=\s*1\b|['"]\s*(?:OR|AND)\s|\s--|\/\*|\bUNION\b|\bsleep\s*\(|\bbenchmark\s*\(|xp_cmdshell)/i.test(
              match[0] + tail,
            );
          if (!dynamic && !payload) {
            if (match[0].length === 0) regex.lastIndex++;
            continue;
          }
        }

        // HARDCODED_SECRET (regex fallback rules): the keyword name or the
        // position alone is not enough — the value has to read as a credential,
        // not as a label. This is what keeps "password-field-selector",
        // "changeme", "placeholder-value" and the `# label only` case silent.
        if (pattern.type === "HARDCODED_SECRET" && !shapedCredential) {
          if (match[0].length === 0) regex.lastIndex++;
          continue;
        }

        // PATH_TRAVERSAL: skip lines that are imports/requires or comments
        if (pattern.type === "PATH_TRAVERSAL") {
          const lineIdx = lineNum - 1;
          const lineText = (lines[lineIdx] ?? "").trim();
          const isImport =
            /^(?:import\b|export\b|const\s+\w+\s*=\s*require\s*\(|require\s*\(|\/\/|\/\*|\*\s)/.test(
              lineText,
            );
          if (isImport) {
            if (match[0].length === 0) regex.lastIndex++;
            continue;
          }
        }

        const lineContent = lines[lineNum - 1] ?? "";

        // Downgrade severity for test files (except secrets which are always P0)
        let severity = pattern.severity;
        if (isTestFile && OPERATIONAL_TYPES.has(pattern.type)) {
          severity = "P2";
        } else if (isTestFile && pattern.type !== "HARDCODED_SECRET" && severity === "P0") {
          severity = "P1";
        }

        let message = pattern.message + (isTestFile ? " (in test file)" : "");
        // The vendor-documented example keys (AWS's own docs pair) are findings
        // — the file does carry the shape — but classified as examples, never
        // shouted, and this rule cannot emit a P0 by construction.
        if (pattern.type === "HARDCODED_SECRET" && DOCUMENTED_EXAMPLE.test(match[1] ?? "")) {
          message =
            "Example credential (vendor-documented value) — regex pattern baseline (offline fallback heuristic), classified as an example, not a live secret";
        }

        issues.push({
          type: pattern.type,
          severity,
          score: pattern.score,
          line: lineNum,
          code: lineContent.trim(),
          secretValue: shapedCredential ? match[1] : undefined,
          message,
          fix: pattern.fix,
          cwe: pattern.cwe,
          provenance: "regex",
          ruleId: `regex:${pattern.type}`,
        } as SecurityIssue & { provenance: string; ruleId: string });
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
    enrichIssues(issues, content);
    // Enrichment masks complete values (including neighbours) before this display limit.
    for (const issue of issues) issue.code = issue.code.slice(0, 120);
    return this.aggregateNoise(issues);
  }

  /**
   * Noise damping: CONSOLE_USAGE / LOOSE_EQUALITY hit hundreds of times in
   * real repos and drown out real findings — aggregate to one finding per
   * file per type (the count travels in the message, line = first hit).
   */
  private aggregateNoise(issues: SecurityIssue[]): SecurityIssue[] {
    const NOISY_TYPES = new Set(["CONSOLE_USAGE", "LOOSE_EQUALITY"]);
    const kept: SecurityIssue[] = [];
    const aggregated = new Map<string, { first: SecurityIssue; total: number }>();
    for (const issue of issues) {
      if (!NOISY_TYPES.has(issue.type)) {
        kept.push(issue);
        continue;
      }
      const agg = aggregated.get(issue.type);
      if (agg) {
        agg.total++;
        continue;
      }
      aggregated.set(issue.type, { first: issue, total: 1 });
    }
    for (const { first, total } of aggregated.values()) {
      if (total > 1) first.message = `${first.message} (×${total} in this file)`;
      kept.push(first);
    }
    return kept;
  }
}
