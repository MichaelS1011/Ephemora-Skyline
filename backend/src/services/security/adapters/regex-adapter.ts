import type { SecurityIssue } from "../../../models/index.js";
import { enrichIssues } from "../finding-knowledge.js";
import type { ScannerAdapter } from "../adapter.js";

interface ScanPattern {
  regex: RegExp;
  type: string;
  severity: "P0" | "P1" | "P2";
  message: string;
  fix?: string;
  score: number;
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
    regex: /SELECT\s+[\s\S]*?\s+FROM\s+[\s\S]*?\s+(?:WHERE|ORDER|GROUP)/gi,
    type: "SQL_INJECTION",
    severity: "P0",
    message: "Raw SQL query detected — potential SQL injection",
    fix: "Use parameterized queries or an ORM (e.g., Prisma, Drizzle)",
    score: 9,
  },
  {
    regex: /eval\s*\(/g,
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
    regex: /deserializeObject|unserialize|yaml\.load\s*\([^,)]*\)/gi,
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
];

export class RegexAdapter implements ScannerAdapter {
  readonly id = "regex";
  constructor(private patterns: ScanPattern[] = REGEX_PATTERNS) {}

  scanFile(filePath: string, content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split("\n");

    // Heuristic: findings in test/spec files are lower priority
    const isTestFile =
      /[/\\](?:test|tests|__tests__|spec|__spec__|fixtures)[/\\]|\.(?:test|spec)\.[jt]sx?$/.test(
        filePath,
      );

    for (const pattern of this.patterns) {
      let match: RegExpExecArray | null;
      pattern.regex.lastIndex = 0;
      while ((match = pattern.regex.exec(content)) !== null) {
        // SQL_INJECTION: skip parameterized queries
        if (pattern.type === "SQL_INJECTION") {
          const win = content.slice(match.index, match.index + 400);
          const lineSlice = content.slice(match.index).split("\n")[0] ?? "";
          if (win.includes("?") || /\$\d/.test(win) || /:\w+/.test(lineSlice)) {
            if (match[0].length === 0) pattern.regex.lastIndex++;
            continue;
          }
        }

        // PATH_TRAVERSAL: skip lines that are imports/requires or comments
        if (pattern.type === "PATH_TRAVERSAL") {
          const lineIdx = content.slice(0, match.index).split("\n").length - 1;
          const lineText = (lines[lineIdx] ?? "").trim();
          const isImport =
            /^(?:import\b|export\b|const\s+\w+\s*=\s*require\s*\(|require\s*\(|\/\/|\/\*|\*\s)/.test(
              lineText,
            );
          if (isImport) {
            if (match[0].length === 0) pattern.regex.lastIndex++;
            continue;
          }
        }

        const lineNum = content.slice(0, match.index).split("\n").length;
        const lineContent = lines[lineNum - 1] ?? "";

        // Downgrade severity for test files (except secrets which are always P0)
        let severity = pattern.severity;
        if (isTestFile && pattern.type !== "HARDCODED_SECRET" && severity === "P0") {
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
        if (match[0].length === 0) pattern.regex.lastIndex++;
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
