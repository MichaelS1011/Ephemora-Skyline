/**
 * Static remediation guidance for known finding classes. The InfoPanel shows
 * this as a "Suggested fix" block so a reviewer gets concrete next steps
 * without leaving the panel. Pure data + pure matching — no side effects.
 */

export interface FixSuggestion {
  title: string;
  steps: string[];
  code?: string;
}

/** Rules are matched case-insensitively by substring on this token. */
interface FixRecipe {
  token: string;
  suggestion: FixSuggestion;
}

/**
 * Ordered most-specific-first: the first recipe whose token is contained in
 * the rule id wins. Kebab/snake/space variants are normalized (see fixFor),
 * so one token covers e.g. "HARDCODED_SECRET" and "hardcoded-secret".
 */
const RECIPES: FixRecipe[] = [
  {
    token: "SECRET",
    suggestion: {
      title: "Move the secret out of the source",
      steps: [
        "Rotate the exposed credential immediately — anything committed to history must be treated as compromised.",
        "Load the value from an environment variable or a secret manager instead of a literal.",
        "Keep the real value in a gitignored .env file and document a placeholder in .env.example.",
        "Purge the secret from git history (git filter-repo or BFG) if the repository is shared.",
      ],
      code: `// .env  (never committed)
API_KEY=...

// src/config.ts
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY is required");`,
    },
  },
  {
    // HARDCODED_CREDENTIALS is the same class of problem as a secret
    token: "CREDENTIALS",
    suggestion: {
      title: "Move the credentials out of the source",
      steps: [
        "Rotate the exposed credentials immediately — anything committed to history must be treated as compromised.",
        "Load them from environment variables or a secret manager instead of literals.",
        "Keep the real values in a gitignored .env file and document placeholders in .env.example.",
        "Purge the credentials from git history (git filter-repo or BFG) if the repository is shared.",
      ],
      code: `// .env  (never committed)
DB_USER=app
DB_PASSWORD=...

// src/db.ts
const password = process.env.DB_PASSWORD;
if (!password) throw new Error("DB_PASSWORD is required");`,
    },
  },
  {
    token: "CMD_INJECTION",
    suggestion: {
      title: "Stop interpolating input into shell commands",
      steps: [
        "Never build shell command strings from user input via concatenation or template literals.",
        "Spawn the program directly with execFile/spawn and pass arguments as an array — no shell in between.",
        "Validate the input against an allow-list before it reaches the process.",
      ],
      code: `import { execFile } from "node:child_process";

// unsafe:  exec(\`ping -c 1 \${host}\`)
execFile("ping", ["-c", "1", host], (error, stdout) => {
  if (error) throw error;
  console.log(stdout);
});`,
    },
  },
  {
    token: "COMMAND_INJECTION",
    suggestion: {
      title: "Stop interpolating input into shell commands",
      steps: [
        "Never build shell command strings from user input via concatenation or template literals.",
        "Spawn the program directly with execFile/spawn and pass arguments as an array — no shell in between.",
        "Validate the input against an allow-list before it reaches the process.",
      ],
      code: `import { execFile } from "node:child_process";

// unsafe:  exec(\`ping -c 1 \${host}\`)
execFile("ping", ["-c", "1", host], (error, stdout) => {
  if (error) throw error;
  console.log(stdout);
});`,
    },
  },
  {
    token: "CONSOLE",
    suggestion: {
      title: "Log through a structured logger",
      steps: [
        "Introduce a single logger module (wrapping pino/winston or leveled console output) as the only logging entry point.",
        "Log structured fields — level, message and a context object — instead of concatenated strings.",
        "Route debug output through logger.debug and remove console.* calls from production code paths.",
      ],
    },
  },
  {
    token: "SQL_INJECTION",
    suggestion: {
      title: "Use parameterized queries",
      steps: [
        "Never concatenate user input into SQL strings.",
        "Pass user input as query parameters so the driver escapes it.",
        "For dynamic table or column names use an allow-list — parameters cannot replace identifiers.",
      ],
      code: `// unsafe:  db.query(\`SELECT * FROM users WHERE id = \${id}\`)
const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [id]);`,
    },
  },
  {
    token: "XSS",
    suggestion: {
      title: "Escape or sanitize before rendering",
      steps: [
        "Prefer the framework's automatic escaping — bind values as text or attributes, never via dangerouslySetInnerHTML/innerHTML.",
        "If raw HTML must be rendered, sanitize it first with DOMPurify (server side: sanitize-html).",
        "Allow-list URL schemes (http/https) and quote every attribute when building markup.",
      ],
    },
  },
  {
    token: "PATH_TRAVERSAL",
    suggestion: {
      title: "Resolve and confine the path before use",
      steps: [
        "Resolve the user-supplied path against the serving base directory.",
        "Verify the resolved path stays inside the base directory; reject otherwise.",
        "Open files only via the resolved path, never the raw input.",
      ],
      code: `import path from "node:path";

const base = path.resolve(__dirname, "uploads");
const target = path.resolve(base, userInput);
if (!target.startsWith(base + path.sep)) {
  throw new Error("Path traversal rejected");
}`,
    },
  },
  {
    token: "RANDOM",
    suggestion: {
      title: "Use a cryptographically secure random source",
      steps: [
        "Replace Math.random() — it is predictable and unsafe for tokens, ids or keys.",
        "Use crypto.randomUUID() for identifiers and crypto.randomBytes(n) for tokens and keys.",
      ],
      code: `import { randomBytes, randomUUID } from "node:crypto";

const sessionId = randomUUID();
const token = randomBytes(32).toString("base64url");`,
    },
  },
];

/** The identifier a rule is matched on: ruleId when present, else the type. */
function normalize(rule: string): string {
  // Unify kebab-case, snake_case and spaced names so one token per class is enough
  return rule.toUpperCase().replace(/[-\s]+/g, "_");
}

/**
 * Remediation guidance for a finding, matched on `ruleId ?? type`
 * (case-insensitive contains). Unknown rule classes return null — the panel
 * then falls back to the finding's own `fix` string, if any.
 */
export function fixFor(finding: { type: string; ruleId?: string }): FixSuggestion | null {
  const rule = normalize(finding.ruleId ?? finding.type);
  if (rule.length === 0) return null;
  const recipe = RECIPES.find((candidate) => rule.includes(candidate.token));
  return recipe ? recipe.suggestion : null;
}
