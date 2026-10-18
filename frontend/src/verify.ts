/**
 * The anchor for "what changed since I was last here".
 *
 * The server compares two scans it still holds in RAM; this module is the
 * browser's side of that comparison. It remembers, per scan, the earlier scan
 * of the SAME folder shape that this browser showed — so the answer is about
 * this project's last visit, not about any scan that happened to run near it.
 *
 * "Same folder" is a hash of the folder's relative paths, never a name or a
 * path: the browser never learns where the project lives, and two checkouts of
 * the same repository compare to each other, which is exactly what a person
 * wants after a pull. The hash is order-independent and capped, so a huge tree
 * costs the same as a small one.
 *
 * What this cannot know: whether the earlier scan is still in the server's
 * memory (20 results, 24 h). The UI asks and says "aged out" when the answer
 * is a 404, instead of pretending nothing changed.
 */
import type { CityData } from "./city/types";

const KEY = "codecity-verify-anchor:v1";
/** Enough visits to cover a working day; the server forgets sooner than this. */
const MAX_ENTRIES = 60;
/** Past this many paths the fingerprint is of the first slice — still stable. */
const MAX_PATHS = 4000;

export interface VerifyAnchor {
  /** The scan this anchor belongs to. */
  scanId: string;
  /** The folder-shaped hash, see `folderShape`. */
  shape: string;
  /** The earlier scan of the same shape, if this browser has seen one. */
  previousId: string | null;
  /** When this scan was first shown in this browser. */
  at: number;
  /**
   * When the scan itself finished, as the payload states it. Absent for
   * payloads written before the field existed — the comparison then says
   * "earlier", never a date it does not have.
   */
  scannedAt?: string;
}

export interface VerifyReport {
  before: string;
  after: string;
  checked: number;
  present: VerifyHit[];
  gone: VerifyHit[];
  moved: { from: VerifyHit; to: VerifyHit }[];
  unknown: string[];
}

export interface VerifyHit {
  fingerprint: string;
  path: string;
  line: number;
  type: string;
  ruleId: string;
  severity: string;
  category?: string;
}

/**
 * A folder's shape: its relative paths, order-independent, hashed.
 *
 * Two checkouts of one repository share it; a project with the same name
 * somewhere else does not. Lines are deliberately not part of it — an edit
 * must not break the tie to the last visit, which is the whole point.
 */
export function folderShape(city: CityData): string {
  // Every file the mapper delivered, not just the towers a sub-district draws:
  // the first version walked `detailFiles` and got a shape from a capped slice,
  // so two different folders could share one anchor. Paths are relative, so a
  // checkout at another location hashes the same — which is what a comparison
  // after a pull needs.
  //
  // This runs inside `setCityData`, the one door every city passes, so a
  // malformed or partial tree (a fixture, a payload from another version) must
  // cost a missing comparison — never the city itself.
  const paths: string[] = [];
  const walk = (
    node: { detailFiles?: { path?: string }[]; children?: unknown[] } | undefined,
  ): void => {
    if (!node) return;
    for (const file of node.detailFiles ?? []) if (file?.path) paths.push(file.path);
    for (const child of node.children ?? []) walk(child as typeof node);
  };
  try {
    walk(city.tree);
    for (const file of city.additionalFiles ?? []) if (file?.path) paths.push(file.path);
  } catch {
    return `0:${"0".repeat(8)}`;
  }
  const list = [...new Set(paths)].sort().slice(0, MAX_PATHS);
  // FNV-1a over the joined list: cheap, stable, and the number never leaves
  // this module except as a string that happens to look like a hash
  let hash = 0x811c9dc5;
  const text = list.join("\n");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${list.length}:${hash.toString(16).padStart(8, "0")}`;
}

const TIMES_KEY = "codecity-verify-times:v1";
const MAX_TIMES = 120;

/** Remember a replaced scan's own time; the anchor no longer holds its record. */
function rememberTime(scanId: string, scannedAt: string | undefined): void {
  if (!scannedAt || typeof window === "undefined") return;
  try {
    const table = JSON.parse(window.localStorage.getItem(TIMES_KEY) ?? "{}") as Record<
      string,
      string
    >;
    table[scanId] = scannedAt;
    const entries = Object.entries(table).slice(-MAX_TIMES);
    window.localStorage.setItem(TIMES_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage off: the date is missing, the sentence stays true without it */
  }
}

/** The recorded finish time of one scan, or undefined when it was never noted. */
export function verifyAnchorScannedAt(scanId: string): string | undefined {
  const fromAnchor = read().find((entry) => entry.scanId === scanId)?.scannedAt;
  if (fromAnchor) return fromAnchor;
  try {
    const table = JSON.parse(window.localStorage.getItem(TIMES_KEY) ?? "{}") as Record<
      string,
      string
    >;
    return table[scanId];
  } catch {
    return undefined;
  }
}

function read(): VerifyAnchor[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is VerifyAnchor =>
        !!e &&
        typeof (e as VerifyAnchor).scanId === "string" &&
        typeof (e as VerifyAnchor).shape === "string" &&
        ((e as VerifyAnchor).previousId === null ||
          typeof (e as VerifyAnchor).previousId === "string") &&
        typeof (e as VerifyAnchor).at === "number",
    );
  } catch {
    return [];
  }
}

function write(entries: VerifyAnchor[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* storage off: the comparison is simply unavailable, nothing else breaks */
  }
}

/**
 * Note this scan and find the earlier one it should be compared against.
 *
 * Runs when a city arrives. A visit of the same scan keeps its anchor; a new
 * scan of the same folder shape points at the most recent earlier scan of that
 * shape and then becomes the new anchor.
 */
export function anchorFor(city: CityData | null): VerifyAnchor | null {
  if (!city?.analysisId) return null;
  const entries = read();
  const existing = entries.find((e) => e.scanId === city.analysisId);
  if (existing) {
    // An entry written before the payload carried a time is filled in on the
    // next visit of that scan: the heading may then date itself.
    if (!existing.scannedAt && city.createdAt) {
      existing.scannedAt = city.createdAt;
      write(entries.map((e) => (e.scanId === existing.scanId ? existing : e)));
    }
    return existing;
  }
  const shape = folderShape(city);
  const previous = [...entries]
    .reverse()
    .find((e) => e.shape === shape && e.scanId !== city.analysisId);
  const scannedAt = city.createdAt;
  const anchor: VerifyAnchor = {
    scanId: city.analysisId,
    shape,
    previousId: previous?.scanId ?? null,
    at: Date.now(),
    ...(typeof scannedAt === "string" && scannedAt.length > 0 ? { scannedAt } : {}),
  };
  // One anchor per shape: the newest scan is the one a comparison starts
  // from. The record it replaces stays in a separate, tiny side table — the
  // earlier scan's own time is what "since the scan of 11 Oct" dates, and the
  // earlier scan is gone from the server before the next visit.
  for (const replaced of entries.filter((e) => e.shape === shape)) {
    rememberTime(replaced.scanId, replaced.scannedAt);
  }
  const kept = entries.filter((e) => e.shape !== shape);
  write([...kept, anchor]);
  return anchor;
}

/**
 * Ask the local server what happened between two scans.
 *
 * Returns null when the question cannot be answered — no earlier scan, or the
 * earlier scan has aged out of the server's memory — and the caller says why
 * rather than showing zeros.
 */
export async function verifyScans(
  beforeId: string,
  afterId: string,
): Promise<{ ok: true; report: VerifyReport } | { ok: false; agedOut: boolean }> {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ before: beforeId, after: afterId }),
  });
  // A 404 is the server saying it no longer holds one of the two scans. Any
  // other failure is a failure, and saying "aged out" for it would be a claim
  // about the server's memory that a broken connection cannot make.
  if (res.status === 404) return { ok: false, agedOut: true };
  if (!res.ok) return { ok: false, agedOut: false };
  return { ok: true, report: (await res.json()) as VerifyReport };
}
