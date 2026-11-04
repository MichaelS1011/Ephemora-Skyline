import type { PostcardText } from "../components/postcardCopy";
import { allFiles } from "./layout";
import type { CityData, CityDir, CityFile } from "./types";

/**
 * Local photo missions derived from the scan itself.
 *
 * A mission exists only when a measured field names a target that the payload
 * actually contains. Nothing here invents a score, a target or a reason; the
 * copy module turns the keys into German or English.
 */

export const POSTCARD_CAPTURED_EVENT = "ephemora-skyline:postcard-captured";
const STORAGE_PREFIX = "ephemora-skyline:postcards:";

export type PostcardChallengeKind =
  "unshielded" | "cycle" | "blast" | "coverage" | "clone" | "district";

export interface PostcardChallenge {
  /** Stable within one scan; localStorage marks are keyed by this. */
  id: string;
  kind: PostcardChallengeKind;
  target: {
    fileId: string;
    path: string;
    district?: string;
  };
  reason: PostcardText;
  action: PostcardText;
}

export type PostcardMarks = Record<string, true>;

export type PostcardMarksRead =
  { state: "absent" } | { state: "read"; value: PostcardMarks } | { state: "unreadable" };

const byPath = (a: CityFile, b: CityFile): number =>
  a.path === b.path ? a.id.localeCompare(b.id) : a.path.localeCompare(b.path);

const isCode = (file: CityFile): boolean => file.role !== "test";

function allCityFiles(city: CityData): CityFile[] {
  return allFiles(city)
    .map((hit) => hit.file)
    .sort(byPath);
}

function filesUnder(dir: CityDir): CityFile[] {
  const out: CityFile[] = [...dir.detailFiles];
  for (const child of dir.children) out.push(...filesUnder(child));
  return out;
}

function largestDistrict(city: CityData): CityDir | null {
  const candidates = city.tree.children.length > 0 ? city.tree.children : [city.tree];
  let best: CityDir | null = null;
  for (const dir of candidates) {
    if (filesUnder(dir).length === 0) continue;
    if (
      !best ||
      dir.fileCount > best.fileCount ||
      (dir.fileCount === best.fileCount && dir.path.localeCompare(best.path) < 0)
    ) {
      best = dir;
    }
  }
  return best;
}

function unshielded(files: readonly CityFile[]): PostcardChallenge | null {
  const target = files
    .filter(
      (file) => isCode(file) && file.findings.length === 0 && (file.unverifiedBy?.length ?? 0) > 0,
    )
    .sort((a, b) => b.linesOfCode - a.linesOfCode || byPath(a, b))[0];
  if (!target) return null;
  return {
    id: `unshielded:${target.id}`,
    kind: "unshielded",
    target: { fileId: target.id, path: target.path },
    reason: {
      key: "unshielded.reasonUnverified",
      vars: { loc: target.linesOfCode, engines: (target.unverifiedBy ?? []).join(", ") },
    },
    action: { key: "unshielded.action" },
  };
}

function cycle(files: readonly CityFile[]): PostcardChallenge | null {
  const target = files.filter((file) => file.inCycle).sort(byPath)[0];
  if (!target) return null;
  return {
    id: `cycle:${target.id}`,
    kind: "cycle",
    target: { fileId: target.id, path: target.path },
    reason: { key: "cycle.reason" },
    action: { key: "cycle.action" },
  };
}

function blast(city: CityData, files: readonly CityFile[]): PostcardChallenge | null {
  const incoming = new Map<string, number>();
  for (const edge of city.fileConnections) {
    if (edge.from === edge.to) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const known = new Set(files.map((file) => file.id));
  const target = files
    .filter((file) => known.has(file.id) && (incoming.get(file.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (incoming.get(b.id) ?? 0) - (incoming.get(a.id) ?? 0) ||
        b.linesOfCode - a.linesOfCode ||
        byPath(a, b),
    )[0];
  if (!target) return null;
  const count = incoming.get(target.id) ?? 0;
  return {
    id: `blast:${target.id}`,
    kind: "blast",
    target: { fileId: target.id, path: target.path },
    reason: { key: count === 1 ? "blast.reasonOne" : "blast.reasonMany", vars: { n: count } },
    action: { key: "blast.action" },
  };
}

function coverage(city: CityData, files: readonly CityFile[]): PostcardChallenge | null {
  const scannedAt = city.createdAt ? Date.parse(city.createdAt) : Number.NaN;
  const measured = files.filter((file) => typeof file.coveragePct === "number");
  if (measured.length > 0) {
    const target = measured.sort(
      (a, b) => (a.coveragePct ?? 0) - (b.coveragePct ?? 0) || byPath(a, b),
    )[0]!;
    return {
      id: `coverage:${target.id}`,
      kind: "coverage",
      target: { fileId: target.id, path: target.path },
      reason: { key: "coverage.reasonCoverage", vars: { pct: target.coveragePct ?? 0 } },
      action: { key: "coverage.action" },
    };
  }
  if (!Number.isFinite(scannedAt)) return null;
  const aged = files.filter((file) => typeof file.lastCommitAt === "number");
  if (aged.length === 0) return null;
  const target = aged.sort(
    (a, b) => (a.lastCommitAt ?? 0) - (b.lastCommitAt ?? 0) || byPath(a, b),
  )[0]!;
  const days = Math.max(
    0,
    Math.floor((scannedAt - (target.lastCommitAt ?? scannedAt)) / 86_400_000),
  );
  return {
    id: `coverage:${target.id}`,
    kind: "coverage",
    target: { fileId: target.id, path: target.path },
    reason: { key: "coverage.reasonAge", vars: { days } },
    action: { key: "coverage.action" },
  };
}

function clone(files: readonly CityFile[]): PostcardChallenge | null {
  const target = files.filter((file) => (file.clonePartners?.length ?? 0) > 0).sort(byPath)[0];
  const partner = target?.clonePartners?.[0];
  if (!target || !partner) return null;
  return {
    id: `clone:${target.id}`,
    kind: "clone",
    target: { fileId: target.id, path: target.path },
    reason: { key: "clone.reason", vars: { lines: partner.lines, path: partner.path } },
    action: { key: "clone.action" },
  };
}

function district(city: CityData): PostcardChallenge | null {
  const dir = largestDistrict(city);
  if (!dir) return null;
  const files = filesUnder(dir);
  const target = files.sort((a, b) => b.linesOfCode - a.linesOfCode || byPath(a, b))[0];
  if (!target) return null;
  return {
    id: `district:${target.id}`,
    kind: "district",
    target: { fileId: target.id, path: target.path, district: dir.path || dir.name },
    reason: {
      key: "district.reason",
      vars: {
        district: dir.path || dir.name || city.repo.name,
        loc: dir.linesOfCode,
        file: target.name,
      },
    },
    action: { key: "district.action" },
  };
}

/** The supported missions, in reading order, capped at five. */
export function derivePostcardChallenges(city: CityData): PostcardChallenge[] {
  const files = allCityFiles(city);
  if (files.length === 0) return [];
  const list: PostcardChallenge[] = [];
  for (const derive of [
    () => unshielded(files),
    () => cycle(files),
    () => blast(city, files),
    () => coverage(city, files),
    () => clone(files) ?? district(city),
  ]) {
    const challenge = derive();
    if (challenge) list.push(challenge);
  }
  const seen = new Set<string>();
  return list
    .filter((challenge) => {
      if (seen.has(challenge.id)) return false;
      seen.add(challenge.id);
      return true;
    })
    .slice(0, 5);
}

export function postcardStorageKey(analysisId: string | undefined): string | null {
  const id = analysisId?.trim();
  return id ? `${STORAGE_PREFIX}${id}` : null;
}

function readMarks(key: string): PostcardMarksRead {
  if (typeof window === "undefined") return { state: "absent" };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return { state: "unreadable" };
  }
  if (raw === null) return { state: "absent" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    const value: PostcardMarks = {};
    for (const [id, marked] of Object.entries(parsed)) if (marked === true) value[id] = true;
    return { state: "read", value };
  } catch {
    try {
      window.localStorage.setItem(`${key}:unreadable`, raw);
    } catch {
      // Storage may be full or blocked; the read still fails honestly.
    }
    return { state: "unreadable" };
  }
}

export function loadPostcardMarksRead(analysisId: string | undefined): PostcardMarksRead {
  const key = postcardStorageKey(analysisId);
  return key ? readMarks(key) : { state: "absent" };
}

export function loadPostcardMarks(analysisId: string | undefined): PostcardMarks {
  const read = loadPostcardMarksRead(analysisId);
  return read.state === "read" ? read.value : {};
}

export function markChallengeCaptured(analysisId: string, challengeId: string): boolean {
  const key = postcardStorageKey(analysisId);
  if (!key || !challengeId) return false;
  if (typeof window === "undefined") return false;
  const current = readMarks(key);
  const value: PostcardMarks = current.state === "read" ? { ...current.value } : {};
  value[challengeId] = true;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Mark the mission whose target is this file; null when the file is not one. */
export function markPostcardCaptured(city: CityData, fileId: string): PostcardChallenge | null {
  if (!postcardStorageKey(city.analysisId)) return null;
  const challenge = derivePostcardChallenges(city).find((c) => c.target.fileId === fileId);
  if (!challenge) return null;
  if (!markChallengeCaptured(city.analysisId!, challenge.id)) return null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(POSTCARD_CAPTURED_EVENT, { detail: { challengeId: challenge.id } }),
    );
  }
  return challenge;
}

export function clearPostcardMarks(analysisId: string | undefined): boolean {
  const key = postcardStorageKey(analysisId);
  if (!key || typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
