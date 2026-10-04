import { ENV_FILE } from "../analyzer/metrics.js";
import { CATEGORY_IDS } from "./categories.js";
import { isOffline } from "./network-policy.js";
import { validatePackIds } from "./rule-packs.js";
import type { FindingCategory } from "../../models/index.js";

/**
 * ScanConfig — user-configurable scan behavior.
 *
 * A config travels from the client (POST /api/analyze-local body.config)
 * through the orchestrator into the scanner facade. `resolveConfig()`
 * validates, caps and merges it with a profile preset; `undefined` input
 * resolves to the "standard" profile = exactly today's behavior.
 */

export interface CustomPattern {
  /** [A-Z0-9_]{2,38}; the "CUSTOM_" prefix is enforced on assignment */
  id: string;
  /** Regex source, max 512 chars, no flags baked in */
  regex: string;
  /** Subset of "g" "i" (default "g") */
  flags?: string;
  severity: "P0" | "P1" | "P2";
  message: string;
  fix?: string;
  cwe?: string;
  /** Language gates: ["python", "javascript", "typescript", ...] (empty = all) */
  languages?: string[];
  fileExtensions?: string[];
}

export interface ToolToggles {
  gitleaks: boolean;
  gitleaksHistory: boolean;
  semgrep: boolean;
  dependencies: boolean;
  osv: boolean;
  ruff: boolean;
}

export interface ScanConfig {
  profile: ScanProfile;
  /** Allowlist of finding types (empty = all) */
  enabledFindingTypes: string[];
  /** Denylist wins over the allowlist */
  disabledFindingTypes: string[];
  /**
   * Which kinds of mistakes to report (empty = all). This is the axis a user
   * can actually decide about — severity is a threshold and a type list is a
   * hundred names, but "injection yes, hygiene later" is a real choice.
   */
  enabledCategories: FindingCategory[];
  customPatterns: CustomPattern[];
  /**
   * Rule packs to load instead of the registry config. Empty keeps today's
   * behavior (`p/security-audit`, fetched from semgrep.dev while the scan
   * runs). Non-empty means the rules come off the local disk, which is also
   * what makes a deep scan possible with the network switched off.
   */
  rulePacks: string[];
  severityThreshold: "P0" | "P1" | "P2";
  languageScope: string[];
  excludePaths: string[];
  tools: ToolToggles;
}

export type ScanProfile =
  "quick" | "standard" | "deep" | "security-only" | "quality-only" | "custom";

export const MAX_CUSTOM_PATTERNS = 25;
export const MAX_EXCLUDE_PATHS = 50;
const MAX_PATTERN_LEN = 512;
const MAX_MESSAGE_LEN = 200;
const MAX_LANGUAGES = 12;
const MAX_EXTENSIONS = 12;

const ALL_TOOLS_ON: ToolToggles = {
  gitleaks: true,
  gitleaksHistory: false, // expensive — deep profile opt-in
  semgrep: true,
  dependencies: true,
  osv: true,
  ruff: true,
};

const PROFILE_PRESETS: Record<ScanProfile, Partial<ScanConfig>> = {
  // Fast triage: heavy tools off, only critical severity
  quick: {
    severityThreshold: "P0",
    tools: { ...ALL_TOOLS_ON, semgrep: false, osv: false, ruff: false },
    disabledFindingTypes: ["CONSOLE_USAGE", "LOOSE_EQUALITY", "LOCALSTORAGE_USAGE"],
  },
  // Exactly today's behavior — the default
  standard: {},
  // Everything, including git-history secrets
  deep: {
    tools: { ...ALL_TOOLS_ON, gitleaksHistory: true },
  },
  "security-only": {
    disabledFindingTypes: ["CONSOLE_USAGE", "LOOSE_EQUALITY", "LOCALSTORAGE_USAGE"],
  },
  "quality-only": {
    // The UI promises "dead code, console, style", so this is the hygiene
    // family: the three hand-written ones plus every QUALITY_<code> a linter
    // contributes — ruff alone has 15 of them, which no fixed list could track.
    enabledFindingTypes: ["CONSOLE_USAGE", "LOOSE_EQUALITY", "LOCALSTORAGE_USAGE", "QUALITY"],
    tools: { ...ALL_TOOLS_ON, gitleaks: false, semgrep: false, dependencies: false, osv: false },
  },
  custom: {},
};

export function profilePreset(profile: ScanProfile): Partial<ScanConfig> {
  return PROFILE_PRESETS[profile] ?? {};
}

export function defaultScanConfig(): ScanConfig {
  return {
    profile: "standard",
    enabledFindingTypes: [],
    enabledCategories: [],
    disabledFindingTypes: [],
    customPatterns: [],
    rulePacks: [],
    severityThreshold: "P2",
    languageScope: [],
    excludePaths: [],
    tools: { ...ALL_TOOLS_ON },
  };
}

/**
 * Static ReDoS heuristic — rejects the classic catastrophic-backtracking
 * shapes (nested quantifiers over open alternation) before a user regex
 * ever runs. The worker-side canary test is the second line of defense.
 */
export function redosRisk(regexSource: string): string | null {
  if (regexSource.length > MAX_PATTERN_LEN) return "pattern too long (max 512 chars)";
  // nested quantifier groups like (...+)+ / (...*)* / (a|a){2,}
  if (/\([^)]*[*+]\)[*+{]/.test(regexSource)) {
    return "nested quantifiers — catastrophic backtracking risk";
  }
  if (/\([^()]*\|[^()]*\)[*+]/.test(regexSource)) {
    return "overlapping alternation with quantifier — backtracking risk";
  }
  if (/\{\d+,\d*\}\{\d+/.test(regexSource)) return "repeated bounded repetition";
  return null;
}

/** Compile-and-canary check: returns an error string or null when safe */
export function validateCustomPattern(p: CustomPattern): string | null {
  if (!/^[A-Z0-9_]{2,38}$/.test(p.id))
    return `${p.id || "pattern"}: id must be A-Z, 0-9, _ (2-38 chars)`;
  const risk = redosRisk(p.regex ?? "");
  if (risk) return `${p.id}: ${risk}`;
  let re: RegExp;
  try {
    re = new RegExp(p.regex, `${p.flags ?? "g"}`);
  } catch (e) {
    return `${p.id}: invalid regular expression (${e instanceof Error ? e.message : "syntax"})`;
  }
  // Canary: a pathological input must not take disproportionately long
  const canary = "a".repeat(2000) + "b";
  const t0 = Date.now();
  try {
    re.lastIndex = 0;
    re.test(canary);
  } catch {
    return `${p.id}: regex execution failed`;
  }
  if (Date.now() - t0 > 250)
    return `${p.id}: canary run exceeded 250ms — pattern rejected (ReDoS protection)`;
  if (!p.message || p.message.length < 3) return `${p.id}: message is required`;
  if (p.message.length > MAX_MESSAGE_LEN) return `${p.id}: message too long (max 200 chars)`;
  if (p.cwe && !/^CWE-\d+$/.test(p.cwe)) return `${p.id}: cwe must look like CWE-79`;
  if (p.flags && !/^[gi]*$/.test(p.flags)) return `${p.id}: flags may only contain g and i`;
  if (
    p.languages &&
    (p.languages.length > MAX_LANGUAGES || p.languages.some((l) => typeof l !== "string"))
  ) {
    return `${p.id}: invalid languages list`;
  }
  if (p.fileExtensions && p.fileExtensions.length > MAX_EXTENSIONS) {
    return `${p.id}: too many file extensions`;
  }
  if (p.fileExtensions && p.fileExtensions.some((e) => !e.startsWith(".") || e.length > 10)) {
    return `${p.id}: extensions must look like .py, .ts`;
  }
  return null;
}

function strArray(v: unknown, cap: number, label: string, errors: string[]): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.push(`${label}: expected an array`);
    return [];
  }
  const out = v.filter((x): x is string => typeof x === "string").slice(0, cap);
  if (v.length > cap) errors.push(`${label}: truncated to ${cap} entries`);
  return out;
}

/**
 * An unknown category is refused, not dropped: a filter that quietly ignores
 * a typo reports a scan the user believes they limited.
 */
function categoriesOf(v: unknown, errors: string[]): FindingCategory[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errors.push("enabledCategories: expected an array");
    return [];
  }
  if (v.length > CATEGORY_IDS.length)
    errors.push(`enabledCategories: truncated to ${CATEGORY_IDS.length} entries`);
  const kept: FindingCategory[] = [];
  for (const entry of v.slice(0, CATEGORY_IDS.length)) {
    if (typeof entry === "string" && (CATEGORY_IDS as string[]).includes(entry)) {
      if (!kept.includes(entry as FindingCategory)) kept.push(entry as FindingCategory);
    } else {
      errors.push(`enabledCategories: unknown category "${String(entry)}"`);
    }
  }
  return kept;
}

function severityOf(
  v: unknown,
  fallback: "P0" | "P1" | "P2",
  errors: string[],
  label: string,
): "P0" | "P1" | "P2" {
  if (v === undefined || v === null) return fallback;
  if (v === "P0" || v === "P1" || v === "P2") return v;
  errors.push(`${label}: must be P0, P1 or P2`);
  return fallback;
}

export interface ResolveResult {
  config: ScanConfig;
  /** Validation errors — when non-empty the caller should 400 with them */
  errors: string[];
}

/**
 * The offline switch outranks both a preset and a user toggle: it is a claim
 * about the machine, and a claim you cannot switch off is not a claim. The
 * three engines it stops are the ones that read a rule pack or an advisory
 * database over the network; the file never leaves, but a name does.
 *
 * semgrep is the exception that proves the claim: with a local rule pack
 * selected there is nothing to fetch, so switching the engine off would be a
 * lie about the network rather than a protection from it.
 */
function applyOffline(config: ScanConfig): ScanConfig {
  if (isOffline()) {
    if (config.rulePacks.length === 0) config.tools.semgrep = false;
    config.tools.osv = false;
    config.tools.dependencies = false;
  }
  return config;
}

/**
 * Validate + normalize an unknown client payload into a ScanConfig.
 * Unknown keys are ignored (forward compatible); every list is capped;
 * custom patterns run through the ReDoS validation.
 */
export type ResolvedScanConfig = ScanConfig;

export function resolveConfig(input?: unknown): ResolveResult {
  const errors: string[] = [];
  const config = defaultScanConfig();

  if (input === undefined || input === null) return { config: applyOffline(config), errors };
  if (typeof input !== "object") {
    errors.push("config: expected an object");
    return { config: applyOffline(config), errors };
  }
  const raw = input as Record<string, unknown>;

  const profile = typeof raw["profile"] === "string" ? raw["profile"] : "standard";
  if (profile in PROFILE_PRESETS) {
    config.profile = profile as ScanProfile;
  } else {
    errors.push(`config.profile: unknown profile "${String(profile)}"`);
  }

  // Preset first, then explicit user overrides win
  const preset = profilePreset(config.profile);
  const mergeTools = (t?: Partial<ToolToggles>): ToolToggles => ({ ...config.tools, ...t });
  if (preset.tools) config.tools = mergeTools(preset.tools);

  config.enabledFindingTypes = strArray(
    raw["enabledFindingTypes"],
    100,
    "enabledFindingTypes",
    errors,
  );
  config.disabledFindingTypes = strArray(
    raw["disabledFindingTypes"],
    100,
    "disabledFindingTypes",
    errors,
  );
  config.enabledCategories = categoriesOf(raw["enabledCategories"], errors);
  if (preset.disabledFindingTypes && config.disabledFindingTypes.length === 0) {
    config.disabledFindingTypes = preset.disabledFindingTypes;
  }
  // A profile's allowlist was never applied, so "Quality" reported every security
  // finding too — the opposite of what its own label promises. An explicit user
  // list still replaces it rather than widening it.
  if (preset.enabledFindingTypes && config.enabledFindingTypes.length === 0) {
    config.enabledFindingTypes = preset.enabledFindingTypes;
  }
  config.languageScope = strArray(raw["languageScope"], MAX_LANGUAGES, "languageScope", errors);
  config.rulePacks = validatePackIds(raw["rulePacks"], errors);
  config.excludePaths = strArray(raw["excludePaths"], MAX_EXCLUDE_PATHS, "excludePaths", errors);
  config.severityThreshold = severityOf(
    raw["severityThreshold"],
    preset.severityThreshold ?? "P2",
    errors,
    "config.severityThreshold",
  );

  if (raw["customPatterns"] !== undefined) {
    if (!Array.isArray(raw["customPatterns"])) {
      errors.push("customPatterns: expected an array");
    } else {
      const list = raw["customPatterns"].slice(0, MAX_CUSTOM_PATTERNS);
      if (raw["customPatterns"].length > MAX_CUSTOM_PATTERNS) {
        errors.push(`customPatterns: truncated to ${MAX_CUSTOM_PATTERNS}`);
      }
      for (const item of list) {
        if (typeof item !== "object" || item === null) continue;
        const p = item as Record<string, unknown>;
        const pattern: CustomPattern = {
          id: String(p["id"] ?? ""),
          regex: String(p["regex"] ?? ""),
          flags: typeof p["flags"] === "string" ? p["flags"] : "g",
          severity: severityOf(
            p["severity"],
            "P1",
            errors,
            `customPatterns[${String(p["id"])}].severity`,
          ),
          message: String(p["message"] ?? ""),
          fix: typeof p["fix"] === "string" ? p["fix"] : undefined,
          cwe: typeof p["cwe"] === "string" ? p["cwe"] : undefined,
          languages: Array.isArray(p["languages"])
            ? p["languages"].filter((l): l is string => typeof l === "string")
            : undefined,
          fileExtensions: Array.isArray(p["fileExtensions"])
            ? p["fileExtensions"].filter((l): l is string => typeof l === "string")
            : undefined,
        };
        const err = validateCustomPattern(pattern);
        if (err) {
          errors.push(err);
        } else {
          pattern.id = pattern.id.startsWith("CUSTOM_") ? pattern.id : `CUSTOM_${pattern.id}`;
          config.customPatterns.push(pattern);
        }
      }
    }
  }

  // Tool toggles after presets so explicit user choices win
  if (raw["tools"] && typeof raw["tools"] === "object") {
    const t = raw["tools"] as Record<string, unknown>;
    for (const key of Object.keys(config.tools) as (keyof ToolToggles)[]) {
      if (typeof t[key] === "boolean") config.tools[key] = t[key] as boolean;
    }
  }

  return { config: applyOffline(config), errors };
}

/** Map a file path to a normalized language name for language gating */
export function languageOfPath(filePath: string): string {
  // ".env.production" ends in an extension that means nothing; as an env file it
  // is env, and a rule scoped to "env" has to reach it
  if (ENV_FILE.test(filePath)) return "env";
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python",
    ".pyw": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".tf": "terraform",
    ".php": "php",
    ".cs": "csharp",
    ".kt": "kotlin",
    ".swift": "swift",
  };
  return map[ext] ?? "other";
}
