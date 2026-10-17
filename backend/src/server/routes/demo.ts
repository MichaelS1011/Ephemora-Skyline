import type { Request, Response } from "express";
import type { AnalysisResult, FileAnalysis } from "../../models/index.js";
import { categoryOf } from "../../services/security/categories.js";
import { knowledgeFor } from "../../services/security/finding-knowledge.js";
import { mapResultToCityData } from "../../utils/cityMapper.js";

/**
 * Synthetic demo repository — a plausible multi-district codebase that flows
 * through the same cityMapper as real analyses. Deterministic (seeded PRNG)
 * so the demo city always looks the same.
 *
 * Nothing here was analyzed: the summary is arithmetic over the files below,
 * the findings say `provenance: "demo"`, and every engine is declared off. A
 * demo must never arrive carrying an analyzer's claims.
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
  "useInterval",
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
  "metrics-aggregator",
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
      code: 'const JWT_SECRET = "REPLACE_WITH_ENV_JWT_SIGNING_KEY";',
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
  // A file whose only finding is review-level hygiene: the one shape that makes
  // the panel show what a threat word stands on ("Medium · from 1 review-level
  // note …", verdictBasis in frontend/src/city/provenance.ts). Measured before:
  // no demo file was hygiene-only, so the demo path could never show that line.
  "frontend/src/components/DebugPanel.tsx": [
    {
      type: "CONSOLE_USAGE",
      severity: "P2",
      line: 12,
      code: 'console.log("frame", frameMs);',
      message: "Debug logging left in production code",
      fix: "Remove the log or gate it behind a development flag",
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

  // Appended last on purpose: the seeded PRNG is consumed file by file, so a
  // file added here leaves every earlier file's height, imports and complexity
  // untouched — the demo city keeps its measured shape and gains one sample.
  push("frontend/src/components/DebugPanel.tsx", "TypeScript", 22);

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
      // The same knowledge table a real scan reads its CWE from
      // (`finding-knowledge.ts`), so the demo city answers in the user's
      // language on the same terms as a scanned one. Measured before: 0 of the
      // demo's 7 findings carried a category, and the panel's German line under
      // the scanner's English sentence appeared for 1 of 1 in a real scan and
      // for none here — the first thing most people open the program with.
      vulnerabilities: (spec.findings ?? []).map((f) => {
        const knowledge = knowledgeFor(f.type);
        const cwe = knowledge.cwe;
        return {
          ...f,
          score: f.severity === "P0" ? 10 : f.severity === "P1" ? 7 : 3,
          provenance: "demo",
          explanation: knowledge.explain,
          ...(knowledge.explainDe ? { explanationDe: knowledge.explainDe } : {}),
          ...(knowledge.fixDe ? { fixDe: knowledge.fixDe } : {}),
          // The line the rule names, and nothing around it. A real scan reads
          // two lines either side out of the file (`buildSnippet`); no file was
          // read here, so the frame stays one line deep rather than inventing
          // its neighbours. Before this it was absent altogether, and the code
          // frame the README promises was invisible on the one screen every
          // visitor opens before they have scanned anything: 0 of 7.
          snippet: { before: [], line: f.code, after: [], number: f.line },
          ...(cwe ? { cwe } : {}),
          ...(knowledge.refUrl ? { refUrl: knowledge.refUrl } : {}),
          category: categoryOf(f.type, cwe),
        };
      }),
    };
  });

  const totalLines = files.reduce((s, f) => s + f.lines.total, 0);
  const totalVulns = files.reduce((s, f) => s + f.vulnerabilities.length, 0);
  const bySeverity = { P0: 0, P1: 0, P2: 0 };
  for (const f of files) for (const v of f.vulnerabilities) bySeverity[v.severity]++;

  const languages: Record<string, number> = {};
  for (const f of files) languages[f.language] = (languages[f.language] ?? 0) + f.lines.code;

  // Everything the summary claims is derived from the files above — the same
  // arithmetic the orchestrator runs. Invented constants here once said
  // "max complexity 42" about a dataset whose own files peaked at 18.
  const scores = files.map((f) => f.complexity.cyclomatic);
  const avgOf = (list: number[]): number =>
    list.length > 0 ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : 0;

  const byDir = new Map<string, FileAnalysis[]>();
  for (const f of files) {
    const top = f.path.split("/")[0];
    if (!top) continue;
    const bucket = byDir.get(top);
    if (bucket) bucket.push(f);
    else byDir.set(top, [f]);
  }

  const directories = [...byDir].map(([dirPath, inDir]) => ({
    path: dirPath,
    fileCount: inDir.length,
    totalLines: inDir.reduce((s, f) => s + f.lines.total, 0),
    avgComplexity: avgOf(inDir.map((f) => f.complexity.cyclomatic)),
    vulnerabilityCount: inDir.reduce((s, f) => s + f.vulnerabilities.length, 0),
    children: [],
  }));

  return {
    id: "demo-001",
    repo: {
      owner: "codecity",
      name: "demo-city",
      branch: "main",
      cloneUrl: "",
      analyzedAt: new Date().toISOString(),
    },
    files,
    directories,
    summary: {
      totalFiles: files.length,
      totalDirectories: byDir.size,
      totalLines,
      avgCyclomatic: avgOf(scores),
      maxCyclomatic: scores.length > 0 ? Math.max(...scores) : 0,
      languages,
      totalVulnerabilities: totalVulns,
      vulnerabilitiesBySeverity: bySeverity,
      languagesByLines: languages,
      // Nothing scanned any of this. Declaring the engines as absent is the
      // difference between "the city is clean" and "nobody looked".
      scanProvenance: {
        regex: false,
        gitleaks: false,
        semgrep: false,
        dependencies: false,
        osv: false,
        ruff: false,
        churn: false,
        duplicates: false,
        coverage: false,
      },
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

/** A result store subset the demo routes touch. */
type DemoStore = {
  get(id: string): AnalysisResult | undefined;
  set(id: string, result: AnalysisResult): void;
};

/** GET /api/demo — the hardcoded demo dataset, served as a stored result. */
export function handleDemo(_req: Request, res: Response): void {
  try {
    res.json(getDemoResult());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/cities/default — the city-mapped demo the frontend draws before any
 * real scan exists. It registers the demo under its own id, so `?city=demo-001`
 * resolves like any other city and a reload lands back on the demo instead of
 * the empty world.
 */
export function handleCitiesDefault(_req: Request, res: Response, analysisStore: DemoStore): void {
  try {
    const demo = getDemoResult();
    if (!analysisStore.get(demo.id)) analysisStore.set(demo.id, demo);
    res.json(mapResultToCityData(demo));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}
