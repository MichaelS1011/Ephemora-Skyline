/**
 * The category axis, mirrored for the UI.
 *
 * `backend/src/services/security/categories.ts` decides which category a
 * finding is in; this file only says what the user sees and clicks. The parity
 * test in `frontend/tests/categoryAxis.test.ts` fails if the two id lists ever
 * drift apart — a chip that filters nothing is worse than no chip.
 */
import type { FindingCategory } from "../city/types";

export interface CategoryMeta {
  id: FindingCategory;
  label: string;
  /** Shown as the tooltip on the chip and as the line in the overview. */
  meaning: string;
  /**
   * Engines that could produce a finding here, by the same key the scan
   * reports them under in `scanProvenance` / `unverifiedEngines`. A category
   * none of the running engines can fill is blind, not clean, and the UI has
   * to say which of the two it is looking at.
   */
  engines: EngineKey[];
}

export type EngineKey = "regex" | "gitleaks" | "semgrep" | "dependencies" | "ruff";

/** The name a developer recognises, for tooltips and the blindness note. */
export const ENGINE_LABEL: Record<EngineKey, string> = {
  regex: "code patterns",
  gitleaks: "secrets",
  semgrep: "deep AST rules",
  dependencies: "dependency audit",
  ruff: "Python lint",
};

export const FINDING_CATEGORIES: readonly CategoryMeta[] = [
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
    engines: ["regex", "ruff"],
  },
  {
    id: "unclassified",
    label: "Not classified",
    meaning: "A finding whose rule carries no CWE the categories know.",
    engines: ["regex", "gitleaks", "semgrep", "dependencies", "ruff"],
  },
] as const;

export const CATEGORY_IDS: FindingCategory[] = FINDING_CATEGORIES.map((c) => c.id);

export function categoryMeta(id: FindingCategory): CategoryMeta {
  return FINDING_CATEGORIES.find((c) => c.id === id)!;
}

/**
 * "injection 4 · secrets 1" — the kinds a folder actually reported, worst-fed
 * first. A finding list sorted by severity alone cannot answer "what am I full
 * of?", which is the question a developer asks before they decide to care.
 */
export function summarizeCategories(counts?: Record<FindingCategory, number>): string {
  if (!counts) return "";
  return FINDING_CATEGORIES.map((c) => ({ id: c.id, n: counts[c.id] ?? 0 }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .map((row) => `${row.id} ${row.n}`)
    .join(" · ");
}

/**
 * Categories the switched-off engines leave unfilled. Zero findings here is
 * not a clean result — nobody looked, and the panel has to say so.
 */
export function blindCategories(offEngines: string[]): FindingCategory[] {
  return FINDING_CATEGORIES.filter(
    (c) => c.engines.length > 0 && c.engines.every((e) => offEngines.includes(e)),
  ).map((c) => c.id);
}

/**
 * What to send as `config.enabledCategories`. "Everything selected" and
 * "nothing selected" both mean no filter — sending the full list would make
 * deselecting the last chip silently widen the scan.
 */
export function enabledCategoriesPayload(selected: FindingCategory[]): FindingCategory[] {
  if (selected.length === 0 || selected.length === CATEGORY_IDS.length) return [];
  return CATEGORY_IDS.filter((id) => selected.includes(id));
}

const STORAGE_KEY = "codecity-scan-categories";

/**
 * What the user left switched on. An absent or broken entry means "everything"
 * — a scan that quietly narrowed itself because localStorage was cleared would
 * be the worst kind of surprise.
 */
export function loadSavedCategories(): FindingCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...CATEGORY_IDS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...CATEGORY_IDS];
    const kept = CATEGORY_IDS.filter((id) => parsed.includes(id));
    return kept.length > 0 ? kept : [...CATEGORY_IDS];
  } catch {
    return [...CATEGORY_IDS];
  }
}

export function saveCategories(selected: FindingCategory[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(CATEGORY_IDS.filter((id) => selected.includes(id))),
    );
  } catch {
    /* storage unavailable */
  }
}
