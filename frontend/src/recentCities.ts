import type { CityData } from "./city/types";

/**
 * The cities this machine has opened.
 *
 * The backend holds a city in RAM only: 20 at a time, least-recently-used
 * first out, and 24 h without a read ends it (`backend/src/server/index.ts:54-104`).
 * The address carries one city, but nothing carried the LIST — so every visit
 * started at the folder picker again, even the tenth one that day.
 *
 * This is a local index of what was opened here, in this browser. It is not a
 * catalogue of scan results: it names the folder, the time and what the scan
 * measured. Whether the city is still in the server's memory is a fact about
 * the server, and the index only claims what it can prove (see `cityGoneForSure`).
 */

export interface RecentCity {
  /** The scan's id — what `?city=` resolves. */
  id: string;
  /** The folder's basename, as the scan named it. NOT a path: the browser never learns one. */
  folder: string;
  /** Epoch ms of the last time this browser showed this city. */
  openedAt: number;
  /** Findings the scan measured in it. */
  findings: number;
  /** Files the scan read. */
  files: number;
}

/** The backend's own bounds, quoted so the index can say what it does not know. */
export const CITY_TTL_MS = 24 * 60 * 60 * 1000;
export const CITY_STORE_MAX = 20;

const KEY = "codecity-recent:v1";

function read(): RecentCity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentCity =>
        !!e &&
        typeof (e as RecentCity).id === "string" &&
        typeof (e as RecentCity).folder === "string" &&
        typeof (e as RecentCity).openedAt === "number",
    );
  } catch {
    return [];
  }
}

function write(entries: RecentCity[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Storage disabled or full: the index is a convenience, the visit is not lost
    return false;
  }
}

/**
 * Newest first.
 *
 * The stored order IS the answer: `recordCityVisit` puts the newest entry last,
 * so this simply turns the list around. Sorting by `openedAt` was the first
 * attempt and it is wrong twice over — two opens in the same millisecond tie,
 * and a stable sort then keeps the OLDER one in front.
 */
export function recentCities(): RecentCity[] {
  return read().reverse().slice(0, CITY_STORE_MAX);
}

/**
 * Has this browser shown this city before?
 *
 * That is the one question the construction cinematic turns on: the animation
 * is for the city a person is seeing for the first time, not for the tenth
 * reload of a visit they are in the middle of.
 */
export function hasCityVisit(id: string | null | undefined): boolean {
  if (!id) return false;
  return read().some((e) => e.id === id);
}

/**
 * Note the city that just arrived.
 *
 * Re-opening a city moves it to the front — the same touch the server's store
 * gives it on a read, so an actively browsed city stays at the top of both
 * lists instead of ageing out from under the person using it.
 */
export function recordCityVisit(city: CityData | null): void {
  if (!city?.analysisId) return;
  const sev = city.findingsBySeverity;
  const entry: RecentCity = {
    id: city.analysisId,
    folder: city.repo.name,
    openedAt: Date.now(),
    findings: (sev?.P0 ?? 0) + (sev?.P1 ?? 0) + (sev?.P2 ?? 0),
    files: city.totalFiles,
  };
  const rest = read().filter((e) => e.id !== entry.id);
  write([...rest, entry].slice(-CITY_STORE_MAX));
}

/**
 * Whether the city behind an entry is certainly gone.
 *
 * The server refreshes a result's clock on every read, so the clock that
 * matters is when THIS browser last opened it. Past the TTL the answer is
 * certain; inside it the entry may still have been pushed out by 20 later
 * scans or by a server restart, and the index does not claim to know.
 */
export function cityGoneForSure(entry: RecentCity, now = Date.now()): boolean {
  return now - entry.openedAt > CITY_TTL_MS;
}

/** What the entry can promise, in one word, without guessing about the server. */
export function cityAvailability(entry: RecentCity, now = Date.now()): "certain" | "unknown" {
  return cityGoneForSure(entry, now) ? "certain" : "unknown";
}

/** Drop one entry — for a link the user deletes, not for a city that expired. */
export function forgetCityVisit(id: string): void {
  write(read().filter((e) => e.id !== id));
}
