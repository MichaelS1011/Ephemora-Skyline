import type { SecurityIssue } from "../../models/index.js";
import { categoryOf } from "./categories.js";
import { maskSecretText } from "./redact.js";

export interface FindingKnowledge {
  /** Plain-language: what does this finding mean for the code owner? */
  explain: string;
  /** Standard taxonomy reference (CWE id) */
  cwe?: string;
  /** Authoritative documentation link (OWASP, CWE, semgrep, advisory) */
  refUrl?: string;
}

/**
 * Curated explanations per finding type — the "why is this flagged and why
 * should I care" layer that turns a scanner hit into something a developer
 * can act on. Sources: OWASP cheat sheets, CWE, semgrep rule docs.
 */
export const FINDING_KNOWLEDGE: Record<string, FindingKnowledge> = {
  CMD_INJECTION: {
    explain:
      "User-controlled input reaches a shell command. An attacker can append their own commands (e.g. `; rm -rf /`) and run anything with your process's permissions.",
    cwe: "CWE-78",
    refUrl: "https://owasp.org/www-community/attacks/Command_Injection",
  },
  SQL_INJECTION: {
    explain:
      "A database query is built by string concatenation, so attacker-supplied text can change its meaning — read, modify or delete any data the query can touch.",
    cwe: "CWE-89",
    refUrl: "https://owasp.org/www-community/attacks/SQL_Injection",
  },
  EVAL_USAGE: {
    explain:
      "eval() executes a string as code. If any part of that string is attacker-influenced, it is arbitrary code execution. There is almost always a safe alternative.",
    cwe: "CWE-95",
    refUrl:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!",
  },
  DYNAMIC_FUNCTION: {
    explain:
      "new Function() compiles a string into executable code — same risk profile as eval(). Attackers who control the string control your process.",
    cwe: "CWE-95",
    refUrl:
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function",
  },
  PATH_TRAVERSAL: {
    explain:
      "User input flows into a filesystem path together with `../`. An attacker can escape the intended directory and read or overwrite any file the process can reach.",
    cwe: "CWE-22",
    refUrl: "https://owasp.org/www-community/attacks/Path_Traversal",
  },
  XSS: {
    explain:
      "Untrusted data is rendered as HTML (innerHTML / dangerouslySetInnerHTML). Injected `<script>` runs in your users' browsers — session hijacking, keylogging, defacement.",
    cwe: "CWE-79",
    refUrl: "https://owasp.org/www-community/attacks/xss/",
  },
  PROTOTYPE_POLLUTION: {
    explain:
      "Manipulating object prototypes (__proto__, __defineGetter__ …) can poison every object of that type in the app — a common step towards remote code execution.",
    cwe: "CWE-1321",
    refUrl: "https://github.com/nicknisi/prototype-pollution",
  },
  UNSAFE_DESERIALIZATION: {
    explain:
      "Deserializing untrusted data (yaml.load, unserialize …) can instantiate arbitrary objects or trigger gadget chains — often remote code execution.",
    cwe: "CWE-502",
    refUrl: "https://owasp.org/www-community/vulnerabilities/Deserialization_of_untrusted_data",
  },
  SETTIMEOUT_STRING: {
    explain:
      'setTimeout("…code…") evaluates the string like eval(). Pass a function reference instead: setTimeout(() => doWork(), 100).',
    cwe: "CWE-95",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/API/setTimeout#syntax",
  },
  HARDCODED_SECRET: {
    explain:
      "A credential is committed in plain text. Anyone with repo access (or the git history) owns it. Rotate the credential, move it to an environment variable or a secrets manager.",
    cwe: "CWE-798",
    refUrl: "https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password",
  },
  VULNERABLE_DEPENDENCY: {
    explain:
      "One of your dependencies has a known vulnerability (CVE). You are vulnerable just by importing it — update to the fixed version.",
    cwe: "CWE-1104",
    refUrl: "https://osv.dev/",
  },
  CONSOLE_USAGE: {
    explain:
      "console output can leak internal data in production and adds noise. Use a structured logger with levels and strip debug logs from shipped code.",
    cwe: "CWE-532",
    refUrl: "https://cwe.mitre.org/data/definitions/532.html",
  },
  LOOSE_EQUALITY: {
    explain:
      "== coerces types before comparing ('0' == false is true). These surprising rules cause subtle logic bugs — prefer === / !==.",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Equality",
  },
  LOCALSTORAGE_USAGE: {
    explain:
      "localStorage is readable by any script on the page — never store tokens or personal data there; XSS turns directly into account takeover.",
    cwe: "CWE-922",
    refUrl: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API",
  },
  INSECURE_HTTP: {
    explain:
      "A request goes over plain http:// — anyone on the network can read and modify it. Use https:// everywhere.",
    cwe: "CWE-319",
    refUrl: "https://owasp.org/www-project-top-ten/2021/A02_2021-Cryptographic_Failures",
  },
  WEAK_CRYPTO: {
    explain:
      "A weak hash (md5/sha1) is used where collision resistance matters. Attackers can forge signatures or passwords — use SHA-256 or better (bcrypt/argon2 for passwords).",
    cwe: "CWE-327",
    refUrl: "https://owasp.org/www-project-top-ten/2021/A02_2021-Cryptographic_Failures",
  },
  QUALITY_ASSERT: {
    explain:
      "An assert statement validates runtime input. When Python runs with -O optimization, asserts are stripped entirely — the check silently disappears.",
    refUrl: "https://docs.python.org/3/using/cmdline.html#cmdoption-O",
  },
  QUALITY_F401: {
    explain:
      "An imported module is never used. Dead imports slow readers down and can hide dependency cycles — remove it.",
  },
  QUALITY_F811: {
    explain:
      "A name is redefined, silently overwriting the earlier definition — often a copy-paste bug or a missing rename.",
  },
  QUALITY_F841: {
    explain:
      "A local variable is assigned but never used — usually a leftover or a forgotten return value.",
  },
  QUALITY_F821: {
    explain:
      "The code references a name that is never defined in this scope. This is a runtime crash waiting to happen when the code path executes.",
  },
  QUALITY_E711: {
    explain:
      "Comparing to None with == instead of `is` — None is a singleton, identity is the correct check.",
  },
  QUALITY_E712: {
    explain:
      "Comparing to True/False with == — use the boolean directly (`if flag:` instead of `if flag == True:`).",
  },
  QUALITY_B006: {
    explain:
      "A mutable default argument (list/dict/set) is shared across every call of the function — mutations leak between invocations. Use None and create a fresh value inside.",
  },
  INSTALL_HOOKS: {
    explain:
      "A lifecycle hook (preinstall/postinstall) runs automatically whenever someone installs this package — on their machine, in their build, with their credentials. This is the standard route by which a careless or compromised dependency executes code.",
    cwe: "CWE-829",
    refUrl: "https://cwe.mitre.org/data/definitions/829.html",
  },
  CURL_PIPE_BASH: {
    explain:
      "A script is downloaded and executed in one step, so whatever the server returns that day runs with your privileges. A hijacked domain or a compromised server becomes code execution on this machine.",
    cwe: "CWE-494",
    refUrl: "https://cwe.mitre.org/data/definitions/494.html",
  },
  WORLD_WRITABLE: {
    explain:
      "The file or directory is writable by every user on the machine. Any local process can replace its content — a script, socket or config that something else executes becomes a path to running code as another user.",
    cwe: "CWE-732",
    refUrl: "https://cwe.mitre.org/data/definitions/732.html",
  },
  TLS_VERIFICATION_DISABLED: {
    explain:
      "Certificate validation is switched off, so the connection no longer proves who is on the other end. Anything a network attacker can route through can read or change the traffic — including credentials and tokens.",
    cwe: "CWE-295",
    refUrl: "https://cwe.mitre.org/data/definitions/295.html",
  },
  DESTRUCTIVE_COMMAND: {
    explain:
      "This deletes down the filesystem root or writes to a raw device. If the path above it is ever empty or unset, the command stops being a cleanup and destroys the machine it runs on.",
  },
};

export function knowledgeFor(type: string): FindingKnowledge {
  return (
    FINDING_KNOWLEDGE[type] ?? {
      explain: "Scanner flagged this construct as a potential security or quality issue.",
    }
  );
}

export interface CodeSnippet {
  /** Up to 2 lines before the finding */
  before: string[];
  /** The flagged line */
  line: string;
  /** Up to 2 lines after the finding */
  after: string[];
  number: number;
}

const CONTEXT_LINES = 2;
const MAX_SNIPPET_LINE = 160;

/**
 * Build a small code frame around the flagged line (semgrep/ESLint codeframe
 * style) so every finding can show WHERE in the file the problem lives.
 */
export function buildSnippet(content: string | undefined, line: number): CodeSnippet | undefined {
  if (!content) return undefined;
  const lines = content.split("\n");
  const idx = Math.min(Math.max(line - 1, 0), lines.length - 1);
  const trim = (s: string): string =>
    s.length > MAX_SNIPPET_LINE ? `${s.slice(0, MAX_SNIPPET_LINE)}…` : s;
  const before = lines.slice(Math.max(0, idx - CONTEXT_LINES), idx).map(trim);
  const flagged = trim(lines[idx] ?? "");
  const after = lines.slice(idx + 1, idx + 1 + CONTEXT_LINES).map(trim);
  if (flagged === undefined) return undefined;
  return { before, line: flagged, after, number: idx + 1 };
}

/**
 * Attach knowledge + code frame to issues, in place. Cheap and idempotent —
 * called by every adapter/facade merge that has the file content at hand.
 */
export function enrichIssues(issues: SecurityIssue[], content?: string): void {
  for (const issue of issues) {
    if (!issue.explanation) {
      const knowledge = knowledgeFor(issue.type);
      issue.explanation = knowledge.explain;
      if (knowledge.cwe) issue.cwe = knowledge.cwe;
      if (knowledge.refUrl) issue.refUrl = knowledge.refUrl;
    }
    // After the knowledge pass, because the category is derived from the CWE
    // this is the place that attaches.
    if (!issue.category) issue.category = categoryOf(issue.type, issue.cwe);
    if (!issue.snippet) {
      issue.snippet = buildSnippet(content, issue.line);
    }
    // Every code frame is masked, not only the credential finding's own.
    // A frame reaches two lines past the finding, so a hygiene hit one line
    // above a `DB_PASSWORD = …` carried the password into the city JSON the
    // user exports — measured on a two-file fixture: the credential findings
    // were clean, the CONSOLE_USAGE frame next to them was not.
    if (issue.code) issue.code = maskSecretText(issue.code);
    if (issue.snippet) {
      issue.snippet.line = maskSecretText(issue.snippet.line);
      issue.snippet.before = issue.snippet.before.map((l) => maskSecretText(l));
      issue.snippet.after = issue.snippet.after.map((l) => maskSecretText(l));
    }
  }
}
