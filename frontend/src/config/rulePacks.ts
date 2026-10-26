import type { FindingCategory } from "../city/types";
import { readStoredJson, type StoredRead } from "../storageRead";

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
  const read = loadSavedPacksRead();
  return read.state === "read" ? read.value : [];
}

/**
 * The STORAGE path of the pack choice, beside `RulePacksRead` above (which is
 * the network path, closed last round): one class, two doors, same three
 * states. `loadSavedPacks` answering `[]` for corrupt bytes was the third
 * data-loss door the prefs-round ledger named: the saved selection vanished
 * silently, the next scan ran under a different rule cover, and the
 * prune-on-set in the store (`useStore.ts:1590`, another lane) turned that
 * `[]` into a fresh `savePacks` — deleting the file. The unreadable bytes now
 * stay under `codecity-scan-packs:unreadable` whatever the store saves next;
 * the surface says so (`profile.packsStorageUnreadable`, the pack-note slot).
 */
export function loadSavedPacksRead(): StoredRead<string[]> {
  return readStoredJson(STORAGE_KEY, (parsed) =>
    Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : undefined,
  );
}

export function savePacks(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Which packs exist is a fact about the disk, and a read that failed is not an
 * answer about the disk. The old shape returned `[]` for every failure, so
 * "the backend is not reachable" rendered identical to "this machine holds no
 * packs" — the same lie the verdicts route closed one file over (see
 * `VerdictRead` in reviews.ts; that file is another lane's, so the shape is
 * re-declared here rather than imported).
 *
 * `read` — the route answered with a packs array; an empty array is a real
 * answer ("no packs installed"). `absent` — 404: this backend does not know
 * the route at all, the way before #41 did, and registry-default behaviour is
 * the honest silence. `unreadable` — the connection was refused, the answer
 * was an error, or the bytes did not parse: a pack list exists or does not,
 * and nobody here is allowed to say which.
 */
export type RulePacksRead =
  { state: "read"; packs: RulePackInfo[] } | { state: "absent" } | { state: "unreadable" };

/**
 * Body payload. An empty selection is not a filter — it keeps the behaviour the
 * product shipped with: semgrep pulls its registry config during the scan.
 */
export async function fetchRulePacks(): Promise<RulePacksRead> {
  let res: Response;
  try {
    res = await fetch("/api/rule-packs");
  } catch {
    return { state: "unreadable" };
  }
  if (res.status === 404) return { state: "absent" };
  if (!res.ok) return { state: "unreadable" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "unreadable" };
  }
  const packs = body && typeof body === "object" ? (body as { packs?: unknown }).packs : undefined;
  if (!Array.isArray(packs)) return { state: "unreadable" };
  return { state: "read", packs: packs as RulePackInfo[] };
}
