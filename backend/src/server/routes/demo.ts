import type { AnalysisResult, FileAnalysis } from "../../models/index.js";

/**
 * Synthetic demo repository — a plausible multi-district codebase that flows
 * through the same cityMapper as real analyses. Deterministic (seeded PRNG)
 * so the demo city always looks the same.
 */

// mulberry32 — tiny seeded PRNG
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FindingSpec {
  type: string;
  severity: "P0" | "P1" | "P2";
  line: number;
  code: string;
  message: string;
  fix?: string;
}

interface FileSpec {
  path: string;
  language: string;
  loc: number;
  findings?: FindingSpec[];
}

const COMPONENTS = [
  "AppShell",
  "Button",
  "Modal",
  "DataTable",
  "Sidebar",
  "HeaderBar",
  "FooterBar",
  "ChatInput",
  "MessageList",
  "UserAvatar",
  "SettingsDialog",
  "ThemeToggle",
  "FileUploader",
  "CommandPalette",
  "NotificationCenter",
  "RichTextEditor",
];

const HOOKS = [
  "useAuth",
  "useFetch",
  "useDebounce",
  "useLocalStorage",
  "useMediaQuery",
  "useOnClickOutside",
  "useScrollPosition",
  "useWebsocket",
];

const STORES = ["authStore", "uiStore", "cartStore", "settingsStore", "editorStore", "playerStore"];

const UTILS = ["formatDate", "sanitizeHtml", "validateEmail", "deepMerge"];

const ROUTES = ["health", "analyze", "demo", "result", "status", "auth", "users", "webhooks"];

const SERVICES = [
  "github-client",
  "clone-manager",
  "security-scanner",
  "city-mapper",
  "orchestrator",
  "websocket-server",
  "logger",
  "rate-limiter",
  "database",
  "auth-service",
];

const MODELS = ["index", "repo", "analysis"];

const DOCS = ["README", "ARCHITECTURE", "GETTING_STARTED", "SECURITY"];

const SCRIPTS = ["build", "deploy", "migrate", "seed", "rotate-secrets"];

const INFRA = ["Dockerfile", "docker-compose.yml", "ci.yml", "main.tf", "nginx.conf"];

const MOBILE = ["AppShell.native", "CameraScanner", "PushHandler", "OfflineCache"];

const FINDINGS: Record<string, FindingSpec[]> = {
  "backend/src/services/auth-service.ts": [
    {
      type: "HARDCODED_SECRET",
      severity: "P0",
      line: 23,
      code: 'const JWT_SECRET = "sk-live-9f2b7c...";',
      message: "Hardcoded JWT signing secret committed to the repository",
      fix: "Load from environment or a secrets manager (Vault, AWS Secrets Manager)",
    },
    {
      type: "CONSOLE_USAGE",
      severity: "P2",
      line: 88,
      code: 'console.log("login attempt", user);',
      message: "Debug logging may leak credentials in production",
      fix: "Use a structured logger with redaction",
    },
  ],
  "backend/src/services/database.ts": [
    {
      type: "SQL_INJECTION",
      severity: "P0",
      line: 141,
      code: "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
      message: "User-controlled value concatenated into a raw SQL query",
      fix: "Use parameterized queries or an ORM (Prisma, Drizzle)",
    },
  ],
  "backend/src/services/clone-manager.ts": [
    {
      type: "CMD_INJECTION",
      severity: "P0",
      line: 95,
      code: "exec(`git clone ${userUrl} ${target}`)",
      message: "Unvalidated input interpolated into a shell command",
      fix: "Use execFile/spawn with an argument array and validate input",
    },
  ],
  "frontend/src/components/RichTextEditor.tsx": [
    {
      type: "XSS",
      severity: "P1",
      line: 210,
      code: "container.innerHTML = html;",
      message: "Unsanitized HTML inserted into the DOM",
      fix: "Sanitize with DOMPurify before inserting",
    },
  ],
  "frontend/src/stores/settingsStore.ts": [
    {
      type: "LOCALSTORAGE_USAGE",
      severity: "P2",
      line: 34,
      code: 'localStorage.setItem("theme", theme)',
      message: "Sensitive preferences stored client-side without protection",
      fix: "Store non-sensitive data only; use httpOnly cookies for the rest",
    },
  ],
  "scripts/deploy.mjs": [
    {
      type: "CMD_INJECTION",
      severity: "P1",
      line: 61,
      code: 'exec(`ssh ${host} "docker compose up -d"`)',
      message: "Shell built from interpolated variables",
      fix: "Use execFile with an argument array",
    },
  ],
};

function buildFileSpecs(): FileSpec[] {
  const specs: FileSpec[] = [];

  const push = (path: string, language: string, loc: number): void => {
    specs.push({ path, language, loc, findings: FINDINGS[path] });
  };

  COMPONENTS.forEach((n, i) =>
    push(`frontend/src/components/${n}.tsx`, "TypeScript", 90 + ((i * 137) % 520)),
  );
  HOOKS.forEach((n, i) => push(`frontend/src/hooks/${n}.ts`, "TypeScript", 30 + ((i * 89) % 160)));
  STORES.forEach((n, i) =>
    push(`frontend/src/stores/${n}.ts`, "TypeScript", 60 + ((i * 113) % 220)),
  );
  UTILS.forEach((n, i) => push(`frontend/src/utils/${n}.ts`, "TypeScript", 25 + ((i * 71) % 120)));

  ROUTES.forEach((n, i) =>
    push(`backend/src/server/routes/${n}.ts`, "TypeScript", 40 + ((i * 97) % 180)),
  );
  SERVICES.forEach((n, i) =>
    push(`backend/src/services/${n}.ts`, "TypeScript", 120 + ((i * 167) % 780)),
  );
  MODELS.forEach((n, i) => push(`backend/src/models/${n}.ts`, "TypeScript", 50 + ((i * 53) % 260)));

  DOCS.forEach((n) => push(`docs/${n}.md`, "Markdown", 120));
  SCRIPTS.forEach((n, i) => push(`scripts/${n}.mjs`, "JavaScript", 35 + ((i * 67) % 150)));
  INFRA.forEach((n) => push(`infrastructure/${n}`, n.endsWith(".yml") ? "YAML" : "Config", 45));
  MOBILE.forEach((n, i) => push(`mobile/src/${n}.tsx`, "TypeScript", 80 + ((i * 131) % 300)));

  return specs;
}

function pickTargets(all: string[], self: string, rng: () => number, count: number): string[] {
  const targets: string[] = [];
  const dirOf = (p: string): string => p.split("/").slice(0, -1).join("/");
  const selfDir = dirOf(self);
  for (let i = 0; i < count; i++) {
    // 60% same-district import, 40% cross-district — realistic coupling
    const pool =
      rng() < 0.6
        ? all.filter((p) => p !== self && dirOf(p) === selfDir)
        : all.filter((p) => p !== self && dirOf(p) !== selfDir);
    const list = pool.length > 0 ? pool : all.filter((p) => p !== self);
    const t = list[Math.floor(rng() * list.length)];
    if (t) targets.push(t);
  }
  return [...new Set(targets)];
}

export function getDemoResult(): AnalysisResult {
  const rng = makeRng(20260828);
  const specs = buildFileSpecs();
  const allPaths = specs.map((s) => s.path);

  const files: FileAnalysis[] = specs.map((spec) => {
    const name = spec.path.split("/").pop() ?? spec.path;
    const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_");
    const importCount = 1 + Math.floor(rng() * 3);
    const targets = pickTargets(allPaths, spec.path, rng, importCount);
    const comments = Math.floor(spec.loc * 0.18);
    const blank = Math.floor(spec.loc * 0.15);

    return {
      path: spec.path,
      language: spec.language,
      lines: {
        total: spec.loc + comments + blank,
        code: spec.loc,
        comments,
        blank,
      },
      complexity: {
        cyclomatic: Math.max(1, Math.floor(spec.loc / 45) + Math.floor(rng() * 6)),
      },
      functions: [],
      classes: [],
      imports: targets.map((t, idx) => ({
        source: makeImportSource(spec.path, t),
        named: [`${base}Dep${idx}`],
        isExternal: false,
        line: 1 + idx * 3,
      })),
      exports: [{ type: "named" as const, name: base, line: 1 }],
      vulnerabilities: (spec.findings ?? []).map((f) => ({
        ...f,
        score: f.severity === "P0" ? 10 : f.severity === "P1" ? 7 : 3,
      })),
    };
  });

  const totalLines = files.reduce((s, f) => s + f.lines.total, 0);
  const totalVulns = files.reduce((s, f) => s + f.vulnerabilities.length, 0);
  const bySeverity = { P0: 0, P1: 0, P2: 0 };
  for (const f of files) for (const v of f.vulnerabilities) bySeverity[v.severity]++;

  const languages: Record<string, number> = {};
  for (const f of files) languages[f.language] = (languages[f.language] ?? 0) + f.lines.code;

  const dirs = new Set(
    files.map((f) => f.path.split("/")[0]).filter((d): d is string => Boolean(d)),
  );

  return {
    id: "demo-001",
    repo: {
      owner: "codecity",
      name: "demo-city",
      branch: "main",
      cloneUrl: "https://github.com/codecity/demo-city",
      analyzedAt: new Date().toISOString(),
    },
    files,
    directories: [...dirs].map((d) => ({
      path: d,
      fileCount: files.filter((f) => f.path.startsWith(d + "/")).length,
      totalLines: files
        .filter((f) => f.path.startsWith(d + "/"))
        .reduce((s, f) => s + f.lines.total, 0),
      avgComplexity: 20,
      vulnerabilityCount: files
        .filter((f) => f.path.startsWith(d + "/"))
        .reduce((s, f) => s + f.vulnerabilities.length, 0),
      children: [],
    })),
    summary: {
      totalFiles: files.length,
      totalDirectories: dirs.size,
      totalLines,
      avgCyclomatic: 14,
      maxCyclomatic: 42,
      languages,
      totalVulnerabilities: totalVulns,
      vulnerabilitiesBySeverity: bySeverity,
      languagesByLines: languages,
    },
    createdAt: new Date().toISOString(),
    status: "complete",
  };
}

/** Build a plausible import specifier from importer to target. */
function makeImportSource(fromPath: string, toPath: string): string {
  const fromDir = fromPath.split("/").slice(0, -1).join("/");
  const toDir = toPath.split("/").slice(0, -1).join("/");
  const toBase = toPath
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");

  if (fromDir === toDir) return `./${toBase}`;

  const fromParts = fromDir.split("/");
  const toParts = toDir.split("/");
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const ups = "../".repeat(fromParts.length - common);
  const down = toParts.slice(common).join("/");
  return `${ups}${down}/${toBase}`;
}
