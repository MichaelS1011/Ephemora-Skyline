import type { SecurityIssue } from "../../../models/index.js";
import { detectLanguage, isDataFile, maskForScanning } from "../../analyzer/metrics.js";
import { enrichIssues } from "../finding-knowledge.js";
import type { ScannerAdapter } from "../adapter.js";

interface ScanPattern {
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
    // PATH_TRAVERSAL: only flag (a) real filesystem/response calls with ../,
    // or (b) known user-input sources concatenated with a ../ path segment.
    // NOT import/require statements (those are handled by the import-skip in scanFile)
    regex:
      /(?:(?:fs\.\w+File\w*|res\.sendFile|res\.download)\s*\([^;]{0,200}['"]\.\.\/)|(?:userInput|(?:req|request)\s*\.\s*(?:query|body|params)\s*\.\s*\w+)\s*\+[^;\n]{0,120}['"`]\/?\.\.?\/|['"`]\/?\.\.?\/['"`]\s*\+/g,
    type: "PATH_TRAVERSAL",
    severity: "P0",
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
    message: "console statement — may leak sensitive data in production",
    fix: "Use a structured logger (pino, winston) with log levels",
    score: 3,
  },
  {
    regex: /[^=!<>]==[^=]/g,
    type: "LOOSE_EQUALITY",
    severity: "P2",
    message: "Loose equality (==) — use === instead",
    fix: "Replace == with === for strict equality",
    score: 2,
  },
  {
    regex: /localStorage\.(?:getItem|setItem|removeItem)\s*\(/g,
    type: "LOCALSTORAGE_USAGE",
    severity: "P2",
    message: "localStorage usage — sensitive data should not be stored client-side",
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
  constructor(private patterns: ScanPattern[] = REGEX_PATTERNS) {}

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

    for (const pattern of this.patterns) {
      // Language gating: loose equality is a JavaScript-only pitfall — in
      // Python `==` is the correct operator (400+ false positives in real
      // Python projects otherwise)
      if (pattern.type === "LOOSE_EQUALITY" && !isJsFamily) continue;

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
        const lineNum = findLineNum(match.index);
        // Never flag prose: comments, docstrings
        if (suppressedLines.has(lineNum)) {
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

        issues.push({
          type: pattern.type,
          severity,
          score: pattern.score,
          line: lineNum,
          code: lineContent.trim().slice(0, 120),
          message: pattern.message + (isTestFile ? " (in test file)" : ""),
          fix: pattern.fix,
          provenance: "regex",
          ruleId: `regex:${pattern.type}`,
        } as SecurityIssue & { provenance: string; ruleId: string });
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
    enrichIssues(issues, content);
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
