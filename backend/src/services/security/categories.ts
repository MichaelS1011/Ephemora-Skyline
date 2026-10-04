import type { FindingCategory } from "../../models/index.js";

/**
 * The table behind the category axis.
 *
 * The finding's own type string is no grouping: the ruff adapter invents
 * `QUALITY_F401` at runtime and semgrep invents `SECURITY_<rule-id>`, so a
 * user who wants "the injection stuff, not the hygiene" had nothing to click.
 * Categories are therefore derived from the CWE the finding already carries —
 * one list to keep true instead of two. A finding whose rule cites no known
 * CWE lands in `unclassified`, which the UI shows rather than swallows.
 */

export type { FindingCategory };

export interface CategoryInfo {
  id: FindingCategory;
  label: string;
  /** One sentence a developer recognises their own finding in. */
  meaning: string;
  /**
   * Scanners that can produce findings here. A category no enabled engine can
   * fill is not "clean", it is blind, and the UI has to say which of the two.
   */
  engines: Array<"regex" | "gitleaks" | "semgrep" | "dependencies" | "ruff">;
}

export const FINDING_CATEGORIES: readonly CategoryInfo[] = [
  {
    id: "injection",
    label: "Injection & execution",
    meaning: "Data reaches a place that runs it: shell, SQL, eval, deserialization.",
    engines: ["regex", "semgrep"],
  },
  {
    id: "secrets",
    label: "Secrets",
    meaning: "Credentials, tokens and keys that are stored in the code or its history.",
    engines: ["gitleaks", "regex"],
  },
  {
    id: "crypto",
    label: "Cryptography",
    meaning: "Weak algorithms and short keys — the maths that pretends to protect something.",
    engines: ["regex", "semgrep"],
  },
  {
    id: "transport",
    label: "Transport & certificates",
    meaning: "Cleartext network calls and certificate checks that were switched off.",
    engines: ["regex", "semgrep"],
  },
  {
    id: "exposure",
    label: "Data exposure",
    meaning: "Sensitive values written where they can be read: logs, browser storage, dumps.",
    engines: ["regex", "semgrep"],
  },
  {
    id: "dependencies",
    label: "Dependencies & supply chain",
    meaning: "Known-bad packages, install hooks and code pulled in without verification.",
    engines: ["dependencies", "semgrep", "regex"],
  },
  {
    id: "permissions",
    label: "Permissions & destructive actions",
    meaning: "World-writable paths and commands that delete or overwrite more than intended.",
    engines: ["regex", "semgrep"],
  },
  {
    id: "hygiene",
    label: "Code hygiene",
    meaning: "Not a vulnerability: dead imports, wrong comparisons, shadowed names.",
    engines: ["regex", "ruff", "semgrep"],
  },
  {
    id: "unclassified",
    label: "Not classified",
    meaning: "A finding whose rule carries no CWE the categories know.",
    engines: ["regex", "gitleaks", "semgrep", "dependencies", "ruff"],
  },
] as const;

/**
 * CWE number → category. Numbers are grouped by the family the CWE itself
 * belongs to, so a new rule that cites CWE-89 joins injection for free.
 */
const CWE_TO_CATEGORY: Readonly<Record<number, FindingCategory>> = {
  22: "injection",
  78: "injection",
  79: "injection",
  89: "injection",
  94: "injection",
  95: "injection",
  98: "injection",
  134: "injection",
  502: "injection",
  643: "injection",
  917: "injection",
  1321: "injection",
  326: "crypto",
  327: "crypto",
  330: "crypto",
  798: "secrets",
  532: "exposure",
  538: "exposure",
  922: "exposure",
  200: "exposure",
  201: "exposure",
  312: "exposure",
  319: "transport",
  295: "transport",
  296: "transport",
  297: "transport",
  300: "dependencies",
  494: "dependencies",
  829: "dependencies",
  1104: "dependencies",
  1357: "dependencies",
  276: "permissions",
  732: "permissions",
  73: "permissions",
};

/** Types that are a category by definition and carry no CWE to derive from. */
const TYPE_TO_CATEGORY: Readonly<Record<string, FindingCategory>> = {
  VULNERABLE_DEPENDENCY: "dependencies",
  LOOSE_EQUALITY: "hygiene",
  DESTRUCTIVE_COMMAND: "permissions",
  CONSOLE_USAGE: "hygiene",
};

/**
 * Runtime-generated families. `SECURITY_S<nr>` from ruff's bandit port is
 * deliberately NOT here: S105 is a secret and S108 is a permission, and
 * guessing "hygiene" for the whole family would put findings in the one
 * category a user is most likely to filter out. They stay `unclassified`
 * until the ruff adapter carries their CWE.
 */
const FAMILY_PREFIXES: Array<[RegExp, FindingCategory]> = [[/^QUALITY_/, "hygiene"]];

/**
 * Category of a finding type, deriving from its CWE when there is one.
 * Unknown types return "unclassified" — never a guess.
 */
export function categoryOf(type: string, cwe?: string): FindingCategory {
  const explicit = TYPE_TO_CATEGORY[type];
  if (explicit) return explicit;
  const match = cwe?.match(/(\d+)/);
  if (match) {
    const mapped = CWE_TO_CATEGORY[Number(match[1])];
    if (mapped) return mapped;
  }
  for (const [pattern, category] of FAMILY_PREFIXES) if (pattern.test(type)) return category;
  return "unclassified";
}

export const CATEGORY_IDS: FindingCategory[] = FINDING_CATEGORIES.map((c) => c.id);

export function categoryInfo(id: FindingCategory): CategoryInfo {
  return FINDING_CATEGORIES.find((c) => c.id === id)!;
}
