import type { FindingCategory } from "../city/types";

/**
 * Rule packs — the bundles of deep rules a scan can be pointed at.
 *
 * The list comes from the backend (`GET /api/rule-packs`), because a pack is a
 * fact about the machine and its disk, not a string the frontend may invent:
 * the scan accepts ids only, never paths.
 */
export interface RulePackInfo {
  id: string;
  name: string;
  version: string;
  origin: "shipped" | "fetched";
  source: string;
  license: string;
  categories: FindingCategory[];
  languages: string[];
  ruleCount: number;
  default: boolean;
  note?: string;
}

const STORAGE_KEY = "codecity-scan-packs";

export function loadSavedPacks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function savePacks(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Body payload. An empty selection is not a filter — it keeps the behaviour the
 * product shipped with: semgrep pulls its registry config during the scan.
 */
export async function fetchRulePacks(): Promise<RulePackInfo[]> {
  try {
    const res = await fetch("/api/rule-packs");
    if (!res.ok) return [];
    const body: unknown = await res.json();
    const packs = (body as { packs?: unknown }).packs;
    return Array.isArray(packs) ? (packs as RulePackInfo[]) : [];
  } catch {
    return [];
  }
}
